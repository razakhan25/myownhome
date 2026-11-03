"use client";
import { useState } from "react";
import { fmtWhen, usePlaidLink, useSavedPlan, useSnapshot, type Snap } from "@/components/app/hooks";
import { fmt$ } from "@/lib/calc";

const STATUS: Record<string, { label: string; cls: string }> = {
  ok: { label: "Connected", cls: "bg-emerald-50 text-emerald-700" },
  login_required: { label: "Needs reconnecting", cls: "bg-amber-50 text-amber-700" },
  pending_expiration: { label: "Reconnect soon", cls: "bg-amber-50 text-amber-700" },
  revoked: { label: "Access revoked", cls: "bg-red-50 text-red-700" },
  error: { label: "Error", cls: "bg-red-50 text-red-700" },
};

export default function AccountsPage() {
  const { snap, setSnap, sync, error } = useSnapshot();
  const plan = useSavedPlan();
  const link = usePlaidLink();
  const [busy, setBusy] = useState("");

  const after = (s: Snap) => setSnap({ ...s, plaidEnabled: true });
  const setRole = async (id: string, role: string) => {
    setSnap((s) => s && { ...s, accounts: s.accounts.map((a) => (a.id === id ? { ...a, role } : a)) });
    await fetch(`/api/accounts/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
    const r = await fetch("/api/plaid/sync"); if (r.ok) setSnap(await r.json());
  };
  const unlink = async (item_id: string, name: string) => {
    if (!confirm(`Unlink ${name}? Its accounts and transactions are deleted from MyOwnHome.`)) return;
    setBusy(item_id);
    const r = await fetch("/api/plaid/unlink", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id }) });
    if (r.ok) setSnap({ ...(await r.json()), plaidEnabled: true });
    setBusy("");
  };
  const refresh = async () => { setBusy("sync"); await sync(); setBusy(""); };

  if (!snap) return <div className="space-y-4"><div className="h-10 w-48 rounded-full skeleton" /><div className="h-40 rounded-[24px] skeleton" /></div>;
  const debts = snap.accounts.filter((a) => (a.type === "credit" || a.type === "loan") && a.role !== "ignore");
  const debtTotal = debts.reduce((s, a) => s + a.balance, 0);
  const gross = (plan.plan?.inputs.annualIncome ?? 0) / 12;
  const dti = gross > 0 ? (snap.monthlyDebtPayments / gross) * 100 : null;
  const liab = (id: string) => snap.liabilities.find((l) => l.account_id === id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-serif text-[34px] sm:text-[40px] leading-none tracking-[-0.8px]">Accounts</h1><p className="mt-2 text-[14.5px] text-ink/60">Read-only through Plaid. Last sync {fmtWhen(snap.lastSyncedAt)}.</p></div>
        <div className="flex gap-2">
          {snap.items.length > 0 && <button onClick={refresh} disabled={busy === "sync"} className="btn-secondary">{busy === "sync" ? "Syncing…" : "Sync now"}</button>}
          {snap.plaidEnabled !== false && <button onClick={() => link.open({ onDone: after })} disabled={link.busy} className="btn-primary">{snap.items.length ? "Add a bank" : "Link a bank"}</button>}
        </div>
      </div>
      {(link.message || error) && <p className="text-[13.5px] text-ink/60">{link.message || error}</p>}

      {snap.items.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([["Cash", fmt$(snap.cash), "Checking and savings"], ["Home fund", snap.homeFund === null ? "—" : fmt$(snap.homeFund), snap.homeFund === null ? "Mark accounts below" : "Counts toward cash to close"], ["Debts", fmt$(debtTotal), `${debts.length} account${debts.length === 1 ? "" : "s"}`], ["Debt-to-income", dti === null ? "—" : `${dti.toFixed(0)}%`, `${fmt$(snap.monthlyDebtPayments)}/mo in payments`]] as const).map(([k, v, s]) => (
            <div key={k} className="panel !p-4"><div className="text-[12px] text-ink/50 uppercase tracking-[.06em]">{k}</div><div className="mt-1 text-[22px] font-semibold tracking-[-0.4px] tabular-nums">{v}</div><div className="text-[12px] text-ink/45">{s}</div></div>
          ))}
        </div>
      )}

      {snap.items.length === 0 && (
        <div className="panel text-center py-10">
          <p className="font-serif text-[26px] tracking-[-0.4px]">No banks linked yet</p>
          <p className="mt-2 max-w-[480px] mx-auto text-[14.5px] text-ink/60">Link checking, savings, cards and loans. Balances, two years of transactions and minimum payments keep your plan honest. We can never move money.</p>
          {snap.plaidEnabled === false ? <p className="mt-4 text-[13px] text-ink/50">Bank linking opens to beta users soon.</p> : <button onClick={() => link.open({ onDone: after })} disabled={link.busy} className="btn-primary mt-5">Link a bank</button>}
        </div>
      )}

      {snap.items.map((it) => {
        const accts = snap.accounts.filter((a) => a.item_id === it.item_id);
        const st = STATUS[it.status] ?? STATUS.error;
        const needsFix = it.status !== "ok";
        return (
          <section key={it.item_id} className="panel">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-[17px] font-semibold tracking-[-0.3px]">{it.institution_name ?? "Bank"}</h2>
              <span className={`h-6 px-2.5 rounded-full text-[11.5px] font-medium inline-flex items-center ${st.cls}`}>{st.label}</span>
              <span className="text-[12.5px] text-ink/45">synced {fmtWhen(it.last_synced_at)}{it.transactions_synced ? "" : " · transactions loading"}</span>
              <div className="ml-auto flex gap-2">
                {needsFix && <button onClick={() => link.open({ itemId: it.item_id, onDone: after })} disabled={link.busy} className="btn-secondary h-9 px-4 text-[13px]">Reconnect</button>}
                <button onClick={() => unlink(it.item_id, it.institution_name ?? "this bank")} disabled={busy === it.item_id} className="btn-ghost h-9 px-3 text-[13px] text-ink/55">{busy === it.item_id ? "Unlinking…" : "Unlink"}</button>
              </div>
            </div>
            {it.error && <p className="mt-2 text-[13px] text-amber-700">{it.error}</p>}
            <div className="mt-3 divide-y divide-ink/5">
              {accts.map((a) => {
                const l = liab(a.id);
                const isDebt = a.type === "credit" || a.type === "loan";
                return (
                  <div key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{a.name}{a.mask ? <span className="text-ink/40"> ··{a.mask}</span> : null}</p>
                      <p className="text-[12.5px] text-ink/50">
                        {(a.subtype ?? a.type).replace(/_/g, " ")}
                        {l?.minimum_payment ? ` · min ${fmt$(l.minimum_payment)}/mo` : ""}{l?.apr ? ` · ${l.apr}% APR` : ""}{l?.next_payment_due_date ? ` · due ${new Date(l.next_payment_due_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                        {a.type === "credit" && a.limit ? ` · ${Math.round((a.balance / a.limit) * 100)}% of ${fmt$(a.limit)} limit` : ""}
                      </p>
                    </div>
                    {a.type === "depository" ? (
                      <div className="inline-flex bg-[#f3f5f8] rounded-full p-1">
                        {([["home_fund", "Home fund"], ["spending", "Spending"], ["ignore", "Ignore"]] as const).map(([v, lbl]) => (
                          <button key={v} onClick={() => setRole(a.id, v)} className={`h-8 px-3 rounded-full text-[12.5px] font-medium transition ${a.role === v ? (v === "home_fund" ? "bg-[#0052FF] text-white" : "bg-white shadow-sm") : "text-ink/55"}`}>{lbl}</button>
                        ))}
                      </div>
                    ) : (
                      <button onClick={() => setRole(a.id, a.role === "ignore" ? "spending" : "ignore")} className="text-[12.5px] text-ink/50 hover:text-ink">{a.role === "ignore" ? "Ignored · include" : "Ignore"}</button>
                    )}
                    <span className={`w-[110px] text-right tabular-nums font-medium ${isDebt ? "text-ink/80" : ""}`}>{isDebt ? `−${fmt$(a.balance)}` : fmt$(a.balance)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <p className="text-[12.5px] text-ink/45 max-w-[760px]">Home fund = the accounts you're saving the down payment in; transfers into them count as savings and their balance is your cash toward closing. Ignore = left out of every number (a partner's account, a business account). Debt payments come from each lender's minimum; auto and personal loans without one are estimated at 2% of the balance per month.</p>
    </div>
  );
}
