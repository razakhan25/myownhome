"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { useSnapshot } from "@/components/app/hooks";
import { fmt$, fmtMonth } from "@/lib/calc";

type Txn = {
  id: string; account_id: string; date: string; name: string; merchant_name: string | null; amount: number; pending: boolean;
  category_primary: string | null; category_detailed: string | null; is_transfer: boolean; excluded: boolean; user_note: string | null; logo_url: string | null; user_edited: boolean;
};

const CATEGORIES: [string, string][] = [
  ["INCOME", "Income"], ["RENT_AND_UTILITIES", "Rent & utilities"], ["LOAN_PAYMENTS", "Loan payments"], ["FOOD_AND_DRINK", "Food & drink"], ["GENERAL_MERCHANDISE", "Shopping"],
  ["TRANSPORTATION", "Transportation"], ["ENTERTAINMENT", "Entertainment"], ["TRAVEL", "Travel"], ["MEDICAL", "Medical"], ["PERSONAL_CARE", "Personal care"],
  ["GENERAL_SERVICES", "Services"], ["HOME_IMPROVEMENT", "Home improvement"], ["GOVERNMENT_AND_NON_PROFIT", "Government & giving"], ["BANK_FEES", "Bank fees"], ["TRANSFER_IN", "Transfer in"], ["TRANSFER_OUT", "Transfer out"],
];
const label = (c: string | null) => CATEGORIES.find(([k]) => k === c)?.[1] ?? (c ? c.replace(/_/g, " ").toLowerCase() : "Uncategorized");
const BILLS = new Set(["RENT_AND_UTILITIES", "LOAN_PAYMENTS", "BANK_FEES"]);
type Filter = "all" | "income" | "bills" | "spending" | "transfers" | "excluded";

export default function TransactionsPage() {
  const supabase = useRef(browserClient()).current;
  const { snap } = useSnapshot();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<Txn[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = async () => {
    setRows(null);
    const [y, m] = month.split("-").map(Number);
    const from = `${month}-01`, to = new Date(y, m, 1).toISOString().slice(0, 10);
    const { data } = await supabase.from("transactions").select("id, account_id, date, name, merchant_name, amount, pending, category_primary, category_detailed, is_transfer, excluded, user_note, logo_url, user_edited").gte("date", from).lt("date", to).order("date", { ascending: false }).limit(1000);
    setRows((data ?? []).map((t) => ({ ...t, amount: Number(t.amount) })));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [month]);

  const acct = (id: string) => snap?.accounts.find((a) => a.id === id);
  const kind = (t: Txn): Exclude<Filter, "all"> => t.excluded ? "excluded" : t.is_transfer ? "transfers" : t.amount < 0 ? "income" : BILLS.has(t.category_primary ?? "") ? "bills" : "spending";
  const visible = useMemo(() => (rows ?? []).filter((t) => {
    if (acct(t.account_id)?.role === "ignore") return false;
    if (filter !== "all" && kind(t) !== filter) return false;
    if (q && !`${t.name} ${t.merchant_name ?? ""} ${label(t.category_primary)}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [rows, filter, q, snap]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => {
    const m = new Map<string, Txn[]>();
    for (const t of visible) m.set(t.date, [...(m.get(t.date) ?? []), t]);
    return [...m.entries()];
  }, [visible]);
  const totals = useMemo(() => {
    const t = { income: 0, bills: 0, spending: 0 };
    for (const x of rows ?? []) { if (acct(x.account_id)?.role === "ignore") continue; const k = kind(x); if (k === "income") t.income += -x.amount; else if (k === "bills") t.bills += x.amount; else if (k === "spending") t.spending += x.amount; }
    return t;
  }, [rows, snap]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (id: string, body: Record<string, unknown>) => {
    setRows((rs) => rs && rs.map((t) => (t.id === id ? { ...t, ...body, user_edited: true } : t)));
    const r = await fetch(`/api/transactions/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (body.remember && r.ok) load();
  };
  const shift = (d: number) => { const [y, m] = month.split("-").map(Number); setMonth(new Date(y, m - 1 + d, 15).toISOString().slice(0, 7)); setOpen(null); };
  const thisMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-serif text-[34px] sm:text-[40px] leading-none tracking-[-0.8px]">Transactions</h1><p className="mt-2 text-[14.5px] text-ink/60">Fix a category, mark transfers, hide one-offs. Your plan updates with every change.</p></div>
        <div className="flex items-center gap-1 bg-white rounded-full p-1 ring-1 ring-ink/[.06]">
          <button onClick={() => shift(-1)} className="w-9 h-9 rounded-full hover:bg-[#f3f5f8] grid place-items-center" aria-label="Previous month">‹</button>
          <span className="px-2 text-[14px] font-medium min-w-[92px] text-center">{fmtMonth(month)}</span>
          <button onClick={() => shift(1)} disabled={month >= thisMonth} className="w-9 h-9 rounded-full hover:bg-[#f3f5f8] grid place-items-center disabled:opacity-30" aria-label="Next month">›</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {([["Income", totals.income], ["Bills", totals.bills], ["Spending", totals.spending]] as const).map(([k, v]) => <div key={k} className="panel !p-4"><div className="text-[12px] text-ink/50 uppercase tracking-[.06em]">{k}</div><div className="mt-1 text-[22px] font-semibold tracking-[-0.4px] tabular-nums">{fmt$(v)}</div></div>)}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "income", "bills", "spending", "transfers", "excluded"] as Filter[]).map((f) => <button key={f} onClick={() => setFilter(f)} className={`chip capitalize ${filter === f ? "pill-on hover:bg-brand-600" : ""}`}>{f}</button>)}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search transactions" className="field h-9 w-[180px] ml-auto text-[14px]" />
      </div>

      {rows === null ? <div className="h-64 rounded-[24px] skeleton" /> : rows.length === 0 ? (
        <div className="panel text-center py-10"><p className="font-serif text-[24px]">Nothing here yet</p><p className="mt-2 text-[14px] text-ink/55">{snap && snap.items.length === 0 ? "Link a bank under Accounts to see transactions." : "No transactions this month. Try the previous month or sync again."}</p></div>
      ) : (
        <div className="panel !p-0 overflow-hidden">
          {days.map(([day, list]) => {
            const net = list.filter((t) => !t.is_transfer && !t.excluded).reduce((s, t) => s - t.amount, 0);
            return (
              <div key={day}>
                <div className="flex justify-between px-5 py-2 bg-[#f5f8fc] text-[12px] text-ink/55"><span>{new Date(day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span><span className="tabular-nums">{net >= 0 ? "+" : "−"}{fmt$(Math.abs(net))}</span></div>
                {list.map((t) => {
                  const a = acct(t.account_id);
                  const k = kind(t);
                  const isOpen = open === t.id;
                  return (
                    <div key={t.id} className={`border-t border-ink/5 ${t.excluded ? "opacity-50" : ""}`}>
                      <button onClick={() => setOpen(isOpen ? null : t.id)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-[#fafcfe]">
                        <span className="w-9 h-9 rounded-full bg-[#eef2f7] grid place-items-center text-[13px] font-semibold text-ink/60 overflow-hidden shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {t.logo_url ? <img src={t.logo_url} alt="" className="w-full h-full object-cover" /> : (t.merchant_name ?? t.name).slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] font-medium">{t.merchant_name ?? t.name}{t.pending ? <span className="ml-2 text-[11px] text-ink/40">pending</span> : null}</span>
                          <span className="block text-[12px] text-ink/50 truncate">{a ? `${a.name}${a.mask ? ` ··${a.mask}` : ""}` : ""}{t.user_note ? ` · ${t.user_note}` : ""}</span>
                        </span>
                        <span className={`hidden sm:inline-flex h-6 px-2.5 rounded-full text-[11.5px] font-medium ${k === "transfers" ? "bg-[#f3f5f8] text-ink/55" : k === "income" ? "bg-emerald-50 text-emerald-700" : k === "bills" ? "bg-[#eef3fa] text-brand-600" : "bg-[#f3f5f8] text-ink/70"}`}>{t.is_transfer ? "Transfer" : label(t.category_primary)}</span>
                        <span className={`w-[92px] text-right tabular-nums text-[14.5px] ${t.amount < 0 ? "text-emerald-700 font-medium" : ""}`}>{t.amount < 0 ? "+" : ""}{fmt$(Math.abs(t.amount)).replace("−", "")}{t.amount < 0 ? "" : ""}</span>
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-4 pt-1 bg-[#fafcfe] grid sm:grid-cols-[1fr_auto] gap-3 items-start pop-in">
                          <div className="flex flex-wrap gap-2 items-center">
                            <select value={t.category_primary ?? ""} onChange={(e) => patch(t.id, { category_primary: e.target.value, category_detailed: null })} className="field h-9 w-auto pr-8 text-[13.5px]" aria-label="Category">
                              <option value="">Uncategorized</option>
                              {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </select>
                            <label className="chip cursor-pointer"><input type="checkbox" checked={t.is_transfer} onChange={(e) => patch(t.id, { is_transfer: e.target.checked })} className="mr-2" />Transfer between my accounts</label>
                            <label className="chip cursor-pointer"><input type="checkbox" checked={t.excluded} onChange={(e) => patch(t.id, { excluded: e.target.checked })} className="mr-2" />Leave out of my plan</label>
                            <button onClick={() => patch(t.id, { category_primary: t.category_primary, is_transfer: t.is_transfer, excluded: t.excluded, remember: true })} className="chip">Apply to every “{(t.merchant_name ?? t.name).slice(0, 24)}”</button>
                          </div>
                          <input defaultValue={t.user_note ?? ""} onBlur={(e) => { if (e.target.value !== (t.user_note ?? "")) patch(t.id, { user_note: e.target.value.slice(0, 200) }); }} placeholder="Note" aria-label="Note" className="field h-9 w-full sm:w-[200px] text-[13.5px]" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {visible.length === 0 && <p className="px-5 py-8 text-center text-[14px] text-ink/55">No matches.</p>}
        </div>
      )}
    </div>
  );
}
