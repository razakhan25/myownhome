import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountBase, PlaidApi, RemovedTransaction, Transaction, TransactionStream } from "plaid";
import { plaid, plaidError } from "./plaid";
import { decrypt } from "./crypto";

export interface PlaidItemRow {
  id: string;
  user_id: string;
  item_id: string;
  access_token: string; // encrypted (lib/crypto)
  institution_name: string | null;
  institution_id: string | null;
  cursor: string | null;
  status: string;
  transactions_synced: boolean;
}

export interface ItemSyncResult {
  item_id: string;
  added: number;
  modified: number;
  removed: number;
  accounts: number;
  status: string;
  error?: string;
}

export interface FinancialSnapshot {
  cash: number; // depository accounts with role != 'ignore': available ?? current, summed, rounded
  homeFund: number | null; // sum of current balances of accounts with role = 'home_fund'; null when none is marked
  monthlyDebtPayments: number; // liability minimums + 2% of balance for loans without a liability row + LOAN_PAYMENTS recurring outflows
  accounts: {
    id: string;
    item_id: string;
    name: string;
    official_name: string | null;
    mask: string | null;
    type: string;
    subtype: string | null;
    balance: number;
    available: number | null;
    limit: number | null;
    role: string;
    institution_name: string | null;
  }[];
  liabilities: {
    account_id: string;
    kind: string;
    minimum_payment: number | null;
    apr: number | null;
    next_payment_due_date: string | null;
    last_statement_balance: number | null;
  }[];
  items: {
    item_id: string;
    institution_name: string | null;
    institution_id: string | null;
    status: string;
    error: string | null;
    last_synced_at: string | null;
    transactions_synced: boolean;
    account_count: number;
  }[];
  lastSyncedAt: string | null; // max over items
  transactionCount: number; // count of transactions rows for the user
}

export const PLAID_ITEM_COLUMNS = "id, user_id, item_id, access_token, institution_name, institution_id, cursor, status, transactions_synced";

const CARD_PAYMENT = "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT";
const ID_CHUNK = 200; // ids per `in` filter: keeps the request URL short

type Rule = { match: string; category_primary: string | null; category_detailed: string | null; is_transfer: boolean | null; excluded: boolean | null };
type Existing = { id: string; user_edited: boolean; transfer_pair_id: string | null };
type Candidate = { id: string; account_id: string; amount: number; date: string };

export function chunk<T>(rows: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

// Throws on a PostgREST error so one failed write fails the Item's sync instead of silently skipping.
export function must<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

export async function getItem(client: SupabaseClient, userId: string, itemId: string): Promise<PlaidItemRow | null> {
  const { data, error } = await client.from("plaid_items").select(PLAID_ITEM_COLUMNS).eq("user_id", userId).eq("item_id", itemId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PlaidItemRow | null) ?? null;
}

const today = () => new Date().toISOString().slice(0, 10);
const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
const shiftDay = (d: string, days: number) => new Date((dayNumber(d) + days) * 86_400_000).toISOString().slice(0, 10);
const cents = (n: number) => Math.round(n * 100);
const isCandidate = (primary: string | null, detailed: string | null) => primary === "TRANSFER_IN" || primary === "TRANSFER_OUT" || detailed === CARD_PAYMENT;
// A card payment only counts as a transfer when the card's own spending is linked too; otherwise it is the user's debt payment.
const isTransfer = (primary: string | null, detailed: string | null, hasCredit: boolean) =>
  primary === "TRANSFER_IN" || primary === "TRANSFER_OUT" || (detailed === CARD_PAYMENT && hasCredit);

// One Item: accounts + balance snapshot, liabilities, transactions cursor loop, recurring streams, item status.
export async function syncItem(client: SupabaseClient, item: PlaidItemRow): Promise<ItemSyncResult> {
  const result: ItemSyncResult = { item_id: item.item_id, added: 0, modified: 0, removed: 0, accounts: 0, status: item.status };
  const now = new Date().toISOString();
  try {
    const api = plaid();
    const token = decrypt(item.access_token);
    const accounts = (await api.accountsGet({ access_token: token })).data.accounts;
    await upsertAccounts(client, item, accounts, now);
    const known = new Set(accounts.map((a) => a.account_id));
    result.accounts = accounts.length;
    await syncLiabilities(client, api, token, item, now, known);
    Object.assign(result, await syncTransactions(client, api, token, item, now, known));
    await syncRecurring(client, api, token, item, now);
    must(await client.from("plaid_items").update({ status: "ok", error: null, last_synced_at: now }).eq("id", item.id).eq("user_id", item.user_id));
    result.status = "ok";
  } catch (e) {
    const { code, message } = plaidError(e);
    result.status = code === "ITEM_LOGIN_REQUIRED" ? "login_required" : "error";
    result.error = message;
    await client.from("plaid_items").update({ status: result.status, error: message }).eq("id", item.id).eq("user_id", item.user_id);
  }
  return result;
}

// Every syncable Item (status ok | pending_expiration) of the user; one bad Item never fails the others.
export async function syncUserItems(client: SupabaseClient, userId: string): Promise<ItemSyncResult[]> {
  const items = must(
    await client.from("plaid_items").select(PLAID_ITEM_COLUMNS).eq("user_id", userId).in("status", ["ok", "pending_expiration"]).order("created_at")
  ) as PlaidItemRow[];
  const results: ItemSyncResult[] = [];
  for (const item of items) results.push(await syncItem(client, item));
  return results;
}

export async function syncUser(client: SupabaseClient, userId: string): Promise<FinancialSnapshot> {
  await syncUserItems(client, userId);
  return snapshot(client, userId);
}

async function upsertAccounts(client: SupabaseClient, item: PlaidItemRow, accounts: AccountBase[], now: string) {
  if (!accounts.length) return;
  // no `role` here so the user's choice survives every sync
  must(
    await client.from("accounts").upsert(
      accounts.map((a) => ({
        id: a.account_id,
        user_id: item.user_id,
        item_id: item.item_id,
        name: a.name,
        official_name: a.official_name ?? null,
        mask: a.mask ?? null,
        type: a.type,
        subtype: a.subtype ?? null,
        current_balance: a.balances.current,
        available_balance: a.balances.available,
        limit_amount: a.balances.limit,
        iso_currency_code: a.balances.iso_currency_code,
        updated_at: now,
      }))
    )
  );
  const day = today();
  must(
    await client.from("balance_snapshots").upsert(
      accounts.map((a) => ({ account_id: a.account_id, day, user_id: item.user_id, current_balance: a.balances.current, available_balance: a.balances.available }))
    )
  );
}

async function syncLiabilities(client: SupabaseClient, api: PlaidApi, token: string, item: PlaidItemRow, now: string, known: Set<string>) {
  let li;
  try {
    li = (await api.liabilitiesGet({ access_token: token })).data.liabilities;
  } catch {
    return; // most Items have no liabilities product
  }
  const rows = [];
  for (const c of li.credit ?? [])
    if (c.account_id)
      rows.push({
        account_id: c.account_id,
        user_id: item.user_id,
        kind: "credit",
        minimum_payment: c.minimum_payment_amount ?? null,
        apr: c.aprs?.[0]?.apr_percentage ?? null,
        next_payment_due_date: c.next_payment_due_date ?? null,
        last_statement_balance: c.last_statement_balance ?? null,
        is_overdue: c.is_overdue ?? null,
        updated_at: now,
      });
  for (const s of li.student ?? [])
    if (s.account_id)
      rows.push({
        account_id: s.account_id,
        user_id: item.user_id,
        kind: "student",
        minimum_payment: s.minimum_payment_amount ?? null,
        apr: s.interest_rate_percentage ?? null,
        next_payment_due_date: s.next_payment_due_date ?? null,
        last_statement_balance: s.last_statement_balance ?? null,
        is_overdue: s.is_overdue ?? null,
        updated_at: now,
      });
  for (const m of li.mortgage ?? [])
    rows.push({
      account_id: m.account_id,
      user_id: item.user_id,
      kind: "mortgage",
      minimum_payment: m.next_monthly_payment ?? null,
      apr: m.interest_rate?.percentage ?? null,
      next_payment_due_date: m.next_payment_due_date ?? null,
      last_statement_balance: null,
      is_overdue: null,
      updated_at: now,
    });
  const valid = rows.filter((r) => known.has(r.account_id));
  if (valid.length) must(await client.from("liabilities").upsert(valid));
}

async function syncTransactions(client: SupabaseClient, api: PlaidApi, token: string, item: PlaidItemRow, now: string, known: Set<string>) {
  const counts = { added: 0, modified: 0, removed: 0 };
  let cursor = item.cursor ?? undefined;
  let added: Transaction[] = [];
  let modified: Transaction[] = [];
  let removed: RemovedTransaction[] = [];
  const seen = new Map<string, AccountBase>();
  for (let restarts = 0; ; ) {
    try {
      for (let more = true; more; ) {
        const res = (
          await api.transactionsSync({ access_token: token, cursor, count: 500, options: { include_personal_finance_category: true, days_requested: 730 } })
        ).data;
        added.push(...res.added);
        modified.push(...res.modified);
        removed.push(...res.removed);
        for (const a of res.accounts) seen.set(a.account_id, a);
        cursor = res.next_cursor;
        more = res.has_more;
      }
      break;
    } catch (e) {
      const { code } = plaidError(e);
      if (code === "PRODUCT_NOT_READY") return counts; // initial pull still running; SYNC_UPDATES_AVAILABLE retriggers
      if (code !== "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" || ++restarts > 3) throw e;
      cursor = item.cursor ?? undefined;
      added = [];
      modified = [];
      removed = [];
      seen.clear();
    }
  }
  counts.added = added.length;
  counts.modified = modified.length;
  counts.removed = removed.length;

  const removedIds = new Set(removed.map((r) => r.transaction_id));
  const latest = new Map<string, Transaction>(); // a modified entry supersedes the added one of the same id
  for (const t of [...added, ...modified]) if (!removedIds.has(t.transaction_id)) latest.set(t.transaction_id, t);

  const extra = [...seen.values()].filter((a) => !known.has(a.account_id));
  if (extra.length) {
    await upsertAccounts(client, item, extra, now);
    for (const a of extra) known.add(a.account_id);
  }
  const rows = [...latest.values()].filter((t) => known.has(t.account_id));

  if (removedIds.size) await deleteTransactions(client, item.user_id, [...removedIds]);
  if (rows.length) await writeTransactions(client, item, rows, now);

  // An empty next_cursor on a fresh Item means the initial pull isn't ready: keep the old cursor and let the webhook retrigger.
  if (cursor) must(await client.from("plaid_items").update({ cursor, transactions_synced: true }).eq("id", item.id).eq("user_id", item.user_id));
  return counts;
}

async function deleteTransactions(client: SupabaseClient, userId: string, ids: string[]) {
  for (const part of chunk(ids, ID_CHUNK)) {
    // the surviving side of a pair (e.g. the posted twin of a pending transfer) gets re-paired on the next write
    must(await client.from("transactions").update({ transfer_pair_id: null }).eq("user_id", userId).in("transfer_pair_id", part));
    must(await client.from("transactions").delete().eq("user_id", userId).in("id", part));
  }
}

function plaidFields(t: Transaction, now: string) {
  const pfc = t.personal_finance_category;
  return {
    amount: t.amount, // Plaid sign: positive = money out
    date: t.date,
    authorized_date: t.authorized_date ?? null,
    name: t.name,
    merchant_name: t.merchant_name ?? null,
    iso_currency_code: t.iso_currency_code ?? null,
    pending: t.pending,
    pending_transaction_id: t.pending_transaction_id ?? null,
    plaid_category_primary: pfc?.primary ?? null,
    plaid_category_detailed: pfc?.detailed ?? null,
    category_confidence: pfc?.confidence_level ?? null,
    payment_channel: t.payment_channel ?? null,
    logo_url: t.logo_url ?? null,
    website: t.website ?? null,
    updated_at: now,
  };
}

async function writeTransactions(client: SupabaseClient, item: PlaidItemRow, rows: Transaction[], now: string) {
  const uid = item.user_id;
  const [credit, ruleRows] = await Promise.all([
    client.from("accounts").select("id").eq("user_id", uid).eq("type", "credit").limit(1),
    client.from("merchant_rules").select("match, category_primary, category_detailed, is_transfer, excluded").eq("user_id", uid),
  ]);
  const hasCredit = must(credit).length > 0;
  const rules = new Map((must(ruleRows) as Rule[]).map((r) => [r.match, r]));

  // Rows the user edited keep their category / transfer / excluded choices; the initial pull can't collide with any.
  const existing = new Map<string, Existing>();
  if (item.transactions_synced)
    for (const part of chunk(rows.map((t) => t.transaction_id), ID_CHUNK))
      for (const r of must(await client.from("transactions").select("id, user_edited, transfer_pair_id").eq("user_id", uid).in("id", part)) as Existing[])
        existing.set(r.id, r);

  const full = [];
  const plaidOnly = [];
  for (const t of rows) {
    const prev = existing.get(t.transaction_id);
    const base = { id: t.transaction_id, user_id: uid, account_id: t.account_id, item_id: item.item_id, ...plaidFields(t, now) };
    if (prev?.user_edited) {
      plaidOnly.push(base);
      continue;
    }
    const rule = rules.get((t.merchant_name ?? t.name).toLowerCase());
    const transfer = isTransfer(base.plaid_category_primary, base.plaid_category_detailed, hasCredit) || Boolean(prev?.transfer_pair_id);
    full.push({
      ...base,
      category_primary: rule?.category_primary ?? base.plaid_category_primary,
      category_detailed: rule?.category_detailed ?? base.plaid_category_detailed,
      is_transfer: rule?.is_transfer ?? transfer,
      excluded: rule?.excluded ?? false,
    });
  }
  for (const part of chunk(full)) must(await client.from("transactions").upsert(part));
  for (const part of chunk(plaidOnly)) must(await client.from("transactions").upsert(part));

  await pairTransfers(
    client,
    uid,
    rows.filter((t) => {
      const prev = existing.get(t.transaction_id);
      return !prev?.user_edited && !prev?.transfer_pair_id && isCandidate(t.personal_finance_category?.primary ?? null, t.personal_finance_category?.detailed ?? null);
    })
  );
}

// Matches each written transfer candidate with one unpaired candidate on another account: same amount, opposite sign,
// within 3 days. Rows the user edited keep their own is_transfer choice and never take part.
async function pairTransfers(client: SupabaseClient, userId: string, written: Transaction[]) {
  if (!written.length) return;
  const dates = written.map((t) => t.date).sort();
  const from = shiftDay(dates[0], -3);
  const to = shiftDay(dates[dates.length - 1], 3);
  const pool: Candidate[] = [];
  for (let page = 0; ; page++) {
    const part = must(
      await client
        .from("transactions")
        .select("id, account_id, amount, date")
        .eq("user_id", userId)
        .eq("user_edited", false)
        .is("transfer_pair_id", null)
        .gte("date", from)
        .lte("date", to)
        .or(`plaid_category_primary.in.(TRANSFER_IN,TRANSFER_OUT),plaid_category_detailed.eq.${CARD_PAYMENT}`)
        .range(page * 1000, page * 1000 + 999)
    ) as Candidate[];
    pool.push(...part);
    if (part.length < 1000) break;
  }
  const byAmount = new Map<number, Candidate[]>();
  for (const c of pool) {
    const key = cents(Number(c.amount));
    if (!byAmount.has(key)) byAmount.set(key, []);
    byAmount.get(key)!.push(c);
  }
  const taken = new Set<string>();
  const pairs: [string, string][] = [];
  for (const t of written) {
    if (taken.has(t.transaction_id)) continue;
    const mate = (byAmount.get(cents(-t.amount)) ?? []).find(
      (c) => !taken.has(c.id) && c.id !== t.transaction_id && c.account_id !== t.account_id && Math.abs(dayNumber(c.date) - dayNumber(t.date)) <= 3
    );
    if (!mate) continue;
    taken.add(t.transaction_id);
    taken.add(mate.id);
    pairs.push([t.transaction_id, mate.id]);
  }
  for (const part of chunk(pairs, 25))
    await Promise.all(
      part.flatMap(([a, b]) => [
        client.from("transactions").update({ transfer_pair_id: b, is_transfer: true }).eq("id", a).eq("user_id", userId).then(must),
        client.from("transactions").update({ transfer_pair_id: a, is_transfer: true }).eq("id", b).eq("user_id", userId).then(must),
      ])
    );
}

function streamRow(s: TransactionStream, direction: "inflow" | "outflow", item: PlaidItemRow, now: string) {
  return {
    id: s.stream_id,
    user_id: item.user_id,
    account_id: s.account_id,
    item_id: item.item_id,
    direction,
    description: s.description,
    merchant_name: s.merchant_name ?? null,
    category_primary: s.personal_finance_category?.primary ?? null,
    category_detailed: s.personal_finance_category?.detailed ?? null,
    frequency: s.frequency,
    average_amount: Math.abs(s.average_amount.amount ?? 0),
    last_amount: Math.abs(s.last_amount.amount ?? 0),
    first_date: s.first_date,
    last_date: s.last_date,
    predicted_next_date: s.predicted_next_date ?? null,
    is_active: s.is_active,
    status: s.status,
    transaction_ids: s.transaction_ids ?? [],
    updated_at: now,
  };
}

async function syncRecurring(client: SupabaseClient, api: PlaidApi, token: string, item: PlaidItemRow, now: string) {
  let res;
  try {
    res = (await api.transactionsRecurringGet({ access_token: token })).data;
  } catch {
    return; // PRODUCT_NOT_READY etc.: streams arrive with the RECURRING_TRANSACTIONS_UPDATE webhook
  }
  const rows = [...res.inflow_streams.map((s) => streamRow(s, "inflow", item, now)), ...res.outflow_streams.map((s) => streamRow(s, "outflow", item, now))];
  for (const part of chunk(rows)) must(await client.from("recurring_streams").upsert(part));
  // streams Plaid no longer reports for this Item
  let stale = client.from("recurring_streams").update({ is_active: false, updated_at: now }).eq("user_id", item.user_id).eq("item_id", item.item_id);
  if (rows.length) stale = stale.not("id", "in", `(${rows.map((r) => r.id).join(",")})`);
  must(await stale);
}

type AccountRow = {
  id: string;
  item_id: string;
  name: string | null;
  official_name: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  current_balance: number | null;
  available_balance: number | null;
  limit_amount: number | null;
  role: string;
};
type LiabilityRow = { account_id: string; kind: string | null; minimum_payment: number | null; apr: number | null; next_payment_due_date: string | null; last_statement_balance: number | null };
type ItemRow = { item_id: string; institution_name: string | null; institution_id: string | null; status: string; error: string | null; last_synced_at: string | null; transactions_synced: boolean };

// Read-only summary from the DB; no Plaid calls.
export async function snapshot(client: SupabaseClient, userId: string): Promise<FinancialSnapshot> {
  const [accounts, liabilities, items, streams, tx] = await Promise.all([
    client.from("accounts").select("id, item_id, name, official_name, mask, type, subtype, current_balance, available_balance, limit_amount, role").eq("user_id", userId).order("name"),
    client.from("liabilities").select("account_id, kind, minimum_payment, apr, next_payment_due_date, last_statement_balance").eq("user_id", userId),
    client.from("plaid_items").select("item_id, institution_name, institution_id, status, error, last_synced_at, transactions_synced").eq("user_id", userId).order("created_at"),
    client
      .from("recurring_streams")
      .select("account_id, average_amount")
      .eq("user_id", userId)
      .eq("direction", "outflow")
      .eq("is_active", true)
      .eq("category_primary", "LOAN_PAYMENTS")
      .or(`category_detailed.is.null,category_detailed.neq.${CARD_PAYMENT}`),
    client.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  const accs = must(accounts) as AccountRow[];
  const liabs = must(liabilities) as LiabilityRow[];
  const its = must(items) as ItemRow[];
  const loanStreams = must(streams) as { account_id: string; average_amount: number | null }[];
  if (tx.error) throw new Error(tx.error.message);

  const byItem = new Map(its.map((i) => [i.item_id, i]));
  const withLiability = new Set(liabs.map((l) => l.account_id));
  const num = (v: number | null) => (v == null ? null : Number(v));
  const cash = accs.filter((a) => a.type === "depository" && a.role !== "ignore").reduce((s, a) => s + Number(a.available_balance ?? a.current_balance ?? 0), 0);
  const fund = accs.filter((a) => a.role === "home_fund");
  let debt = liabs.reduce((s, l) => s + Number(l.minimum_payment ?? 0), 0);
  // auto/personal loans aren't in Plaid Liabilities; estimate 2% of balance when no minimum is known
  for (const a of accs) if (a.type === "loan" && a.subtype !== "mortgage" && !withLiability.has(a.id)) debt += Number(a.current_balance ?? 0) * 0.02;
  for (const s of loanStreams) if (!withLiability.has(s.account_id)) debt += Number(s.average_amount ?? 0);
  const accountCount = new Map<string, number>();
  for (const a of accs) accountCount.set(a.item_id, (accountCount.get(a.item_id) ?? 0) + 1);

  return {
    cash: Math.round(cash),
    homeFund: fund.length ? Math.round(fund.reduce((s, a) => s + Number(a.current_balance ?? 0), 0)) : null,
    monthlyDebtPayments: Math.round(debt),
    accounts: accs.map((a) => ({
      id: a.id,
      item_id: a.item_id,
      name: a.name ?? "Account",
      official_name: a.official_name,
      mask: a.mask,
      type: a.type ?? "other",
      subtype: a.subtype,
      balance: Number(a.current_balance ?? 0),
      available: num(a.available_balance),
      limit: num(a.limit_amount),
      role: a.role,
      institution_name: byItem.get(a.item_id)?.institution_name ?? null,
    })),
    liabilities: liabs.map((l) => ({
      account_id: l.account_id,
      kind: l.kind ?? "other",
      minimum_payment: num(l.minimum_payment),
      apr: num(l.apr),
      next_payment_due_date: l.next_payment_due_date,
      last_statement_balance: num(l.last_statement_balance),
    })),
    items: its.map((i) => ({ ...i, account_count: accountCount.get(i.item_id) ?? 0 })),
    lastSyncedAt: its.reduce<string | null>((m, i) => (i.last_synced_at && (!m || i.last_synced_at > m) ? i.last_synced_at : m), null),
    transactionCount: tx.count ?? 0,
  };
}
