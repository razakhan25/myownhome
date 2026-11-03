import type { SupabaseClient } from "@supabase/supabase-js";
import { BASE_DEFAULTS, LINKABLE, linkedValues, monthlyCashflow, summarizeCashflow, type CashflowSummary, type LinkedValues, type PlanInputs } from "./calc";
import { snapshot } from "./sync";

export interface LinkedReport { cashflow: CashflowSummary; linked: LinkedValues; accountCount: number }

// Reads the user's linked data and computes what the plan should use. Pure math lives in lib/calc.ts.
export async function linkedReport(client: SupabaseClient, userId: string, now = new Date()): Promise<LinkedReport> {
  const since = new Date(now.getFullYear(), now.getMonth() - 7, 1).toISOString().slice(0, 10);
  const [snap, { data: txns }, { data: streams }] = await Promise.all([
    snapshot(client, userId),
    client.from("transactions").select("id, account_id, date, amount, category_primary, category_detailed, is_transfer, excluded, pending").eq("user_id", userId).gte("date", since).limit(10000),
    client.from("recurring_streams").select("id, direction, category_primary, category_detailed, average_amount, is_active, transaction_ids").eq("user_id", userId),
  ]);
  const accounts = snap.accounts.map((a) => ({ id: a.id, type: a.type, subtype: a.subtype, role: a.role }));
  const months = monthlyCashflow((txns ?? []).map((t) => ({ ...t, amount: Number(t.amount) })), accounts, (streams ?? []).map((s) => ({ ...s, average_amount: s.average_amount === null ? null : Number(s.average_amount) })), now);
  const cashflow = summarizeCashflow(months);
  const linked = linkedValues(cashflow, { cash: snap.cash, homeFund: snap.homeFund, monthlyDebtPayments: snap.monthlyDebtPayments, accountCount: snap.accounts.length });
  return { cashflow, linked, accountCount: snap.accounts.length };
}

// After a sync: every plan input that still follows linked data (plans.linked[field] !== false) takes the linked value.
export async function refreshPlanFromLinked(client: SupabaseClient, userId: string): Promise<void> {
  const { data: plan } = await client.from("plans").select("inputs, linked").eq("user_id", userId).maybeSingle();
  const report = await linkedReport(client, userId);
  const inputs: PlanInputs = { ...BASE_DEFAULTS, ...((plan?.inputs as Partial<PlanInputs>) ?? {}) };
  const linked: Record<string, boolean> = { ...((plan?.linked as Record<string, boolean>) ?? {}) };
  let changed = !plan;
  for (const f of LINKABLE) {
    const v = report.linked.values[f];
    if (v === undefined || linked[f] === false) continue;
    if (inputs[f] !== v) { inputs[f] = v; changed = true; }
    if (linked[f] !== true) { linked[f] = true; changed = true; }
  }
  if (!changed) return;
  await client.from("plans").upsert({ user_id: userId, inputs, linked, updated_at: new Date().toISOString() });
}
