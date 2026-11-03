import type { SupabaseClient } from "@supabase/supabase-js";
import { plaid } from "./plaid";
import { decrypt } from "./crypto";

export interface FinancialSnapshot {
  cash: number;              // checking + savings balances
  monthlyDebtPayments: number;
  accounts: { name: string; type: string; subtype: string | null; balance: number }[];
  institutions: string[];
}

// Pulls balances + liabilities for every linked item, stores them, returns a summary.
export async function syncUser(supabase: SupabaseClient, userId: string): Promise<FinancialSnapshot> {
  const { data: items } = await supabase.from("plaid_items").select("item_id, access_token, institution_name").eq("user_id", userId);
  const client = plaid();
  for (const item of items ?? []) {
    const token = decrypt(item.access_token);
    const acc = await client.accountsGet({ access_token: token });
    await supabase.from("accounts").upsert(
      acc.data.accounts.map((a) => ({
        id: a.account_id,
        user_id: userId,
        item_id: item.item_id,
        name: a.official_name ?? a.name,
        type: a.type,
        subtype: a.subtype,
        current_balance: a.balances.current,
        available_balance: a.balances.available,
        updated_at: new Date().toISOString(),
      }))
    );
    try {
      const li = await client.liabilitiesGet({ access_token: token });
      const rows: { account_id: string; user_id: string; kind: string; minimum_payment: number | null; apr: number | null }[] = [];
      for (const c of li.data.liabilities.credit ?? [])
        rows.push({ account_id: c.account_id!, user_id: userId, kind: "credit", minimum_payment: c.minimum_payment_amount ?? null, apr: c.aprs?.[0]?.apr_percentage ?? null });
      for (const s of li.data.liabilities.student ?? [])
        rows.push({ account_id: s.account_id!, user_id: userId, kind: "student", minimum_payment: s.minimum_payment_amount ?? null, apr: s.interest_rate_percentage ?? null });
      if (rows.length) await supabase.from("liabilities").upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
    } catch {
      // institution has no liabilities data; balances still count
    }
  }
  return snapshot(supabase, userId, (items ?? []).map((i) => i.institution_name ?? "Bank"));
}

export async function snapshot(supabase: SupabaseClient, userId: string, institutions?: string[]): Promise<FinancialSnapshot> {
  const [{ data: accounts }, { data: liabs }] = await Promise.all([
    supabase.from("accounts").select("id, name, type, subtype, current_balance, available_balance").eq("user_id", userId),
    supabase.from("liabilities").select("account_id, minimum_payment").eq("user_id", userId),
  ]);
  const cash = (accounts ?? [])
    .filter((a) => a.type === "depository")
    .reduce((s, a) => s + Number(a.available_balance ?? a.current_balance ?? 0), 0);
  let monthlyDebtPayments = (liabs ?? []).reduce((s, l) => s + Number(l.minimum_payment ?? 0), 0);
  // auto/personal loans aren't in Plaid Liabilities; estimate 2% of balance when no minimum is known
  const known = new Set((liabs ?? []).map((l) => l.account_id));
  for (const a of accounts ?? [])
    if (a.type === "loan" && a.subtype !== "mortgage" && !known.has(a.id)) monthlyDebtPayments += Number(a.current_balance ?? 0) * 0.02;
  return {
    cash: Math.round(cash),
    monthlyDebtPayments: Math.round(monthlyDebtPayments),
    accounts: (accounts ?? []).map((a) => ({ name: a.name, type: a.type, subtype: a.subtype, balance: Number(a.current_balance ?? 0) })),
    institutions: institutions ?? [],
  };
}
