"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Calculator from "@/components/Calculator";
import { Arrow } from "@/components/Brand";
import { fmtWhen, usePlaidLink, useReport, useSavedPlan, useSnapshot, type Snap } from "@/components/app/hooks";
import { computePlan, fmt$, fmtMonth } from "@/lib/calc";

const SUGGESTIONS = ["How do I buy sooner?", "FHA or conventional for me?", "Should I pay off debt first?", "Is buying better than renting over 7 years?"];

export default function HomePage() {
  const router = useRouter();
  const plan = useSavedPlan();
  const { snap, setSnap, sync } = useSnapshot();
  const { report, reload: reloadReport } = useReport();
  const link = usePlaidLink();
  const [q, setQ] = useState("");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { if (plan.plan && !plan.plan.onboarded_at) router.replace("/welcome"); }, [plan.plan, router]);

  if (!plan.plan) return <Loading />;
  const r = computePlan(plan.plan.inputs);
  const linkedState = report && report.accountCount > 0 ? { values: report.linked.values, basis: report.linked.basis, follow: plan.plan.linked } : undefined;
  const months = report?.cashflow.months ?? [];
  const current = months.find((m) => m.partial);
  const hasData = (report?.cashflow.fullMonths ?? 0) > 0 || (current && (current.income || current.spending));
  const max = Math.max(1, ...months.map((m) => Math.max(m.income, m.bills + m.spending + Math.max(0, m.saved))));

  const refresh = async () => { setSyncing(true); await sync(); await Promise.all([reloadReport(), plan.reload()]); setSyncing(false); };
  const afterLink = async (s: Snap) => { setSnap({ ...s, plaidEnabled: true }); await Promise.all([reloadReport(), plan.reload()]); };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-[34px] sm:text-[40px] leading-none tracking-[-0.8px]">Your home plan</h1>
          <p className="mt-2 text-[14.5px] text-ink/60">{plan.market ? `${plan.market.metro.name} · ` : ""}{r.months === null ? "Add a monthly savings amount to get a buy date." : r.months === 0 ? "You have the cash to close today." : `On pace for ${new Date(r.buyDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })}.`}</p>
        </div>
        <div className="flex items-center gap-3 text-[13px] text-ink/50">
          <span>{plan.saving === "saving" ? "Saving…" : plan.saving === "saved" ? "Saved" : ""}</span>
          {snap && snap.items.length > 0 && <button onClick={refresh} disabled={syncing} className="btn-secondary h-9 px-4 text-[13px]">{syncing ? "Syncing…" : `Sync · ${fmtWhen(snap.lastSyncedAt)}`}</button>}
        </div>
      </div>

      <Calculator inputs={plan.plan.inputs} onChange={plan.update} metro={plan.metro} onMetroChange={plan.changeMetro} market={plan.market} linked={linkedState} onFollow={plan.setFollow} />

      <div className="grid lg:grid-cols-[1.1fr_.9fr] gap-5">
        {/* Cash flow */}
        <section className="panel">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[17px] font-semibold tracking-[-0.3px]">What you really save</h2>
            {report && report.cashflow.savingsRate !== null && <span className="text-[13px] text-ink/60"><b className="text-[#0052FF]">{report.cashflow.savingsRate.toFixed(0)}%</b> of income</span>}
          </div>
          {snap && snap.items.length === 0 ? (
            <div className="mt-3">
              <p className="text-[14.5px] text-ink/65 leading-relaxed">Link your bank and MyOwnHome reads income, bills, spending and what you move into your home fund every month, so the buy date tracks reality instead of a typed number.</p>
              {snap.plaidEnabled === false ? <p className="mt-3 text-[13px] text-ink/50">Bank linking opens to beta users soon.</p> : <button onClick={() => link.open({ onDone: afterLink })} disabled={link.busy} className="btn-primary mt-4">Link a bank</button>}
              {link.message && <p className="mt-2 text-[13px] text-ink/60">{link.message}</p>}
            </div>
          ) : !hasData ? (
            <p className="mt-3 text-[14.5px] text-ink/65">Transactions are still loading from your bank. Give it a minute, then sync again.</p>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                {([["Income", current?.income ?? 0, ""], ["Bills", current?.bills ?? 0, ""], ["Spending", current?.spending ?? 0, ""], ["Saved", current?.saved ?? 0, "text-[#0052FF]"]] as const).map(([k, v, c]) => (
                  <div key={k} className="rounded-[16px] bg-[#f5f8fc] py-3"><div className={`text-[17px] font-semibold tabular-nums ${c}`}>{fmt$(v)}</div><div className="text-[11.5px] text-ink/50">{k} · {current ? fmtMonth(current.month).split(" ")[0] : ""}</div></div>
                ))}
              </div>
              <div className="mt-5 grid gap-2 items-end h-[140px]" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
                {months.map((m) => (
                  <div key={m.month} className="flex flex-col justify-end h-full gap-0.5" title={`${fmtMonth(m.month)}: income ${fmt$(m.income)}, bills ${fmt$(m.bills)}, spending ${fmt$(m.spending)}, saved ${fmt$(m.saved)}`}>
                    <div className="w-full rounded-md bg-[#0052FF]" style={{ height: `${(Math.max(0, m.saved) / max) * 100}%` }} />
                    <div className="w-full rounded-md bg-[#8eaed8]" style={{ height: `${(m.spending / max) * 100}%` }} />
                    <div className="w-full rounded-md bg-[#002664]" style={{ height: `${(m.bills / max) * 100}%` }} />
                    <div className={`text-center text-[11px] ${m.partial ? "text-ink/35" : "text-ink/50"}`}>{fmtMonth(m.month).split(" ")[0]}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-ink/60"><span><i className="inline-block w-2 h-2 rounded-full bg-[#002664] mr-1.5" />Bills</span><span><i className="inline-block w-2 h-2 rounded-full bg-[#8eaed8] mr-1.5" />Spending</span><span><i className="inline-block w-2 h-2 rounded-full bg-[#0052FF] mr-1.5" />Saved to home fund</span></div>
              <p className="mt-3 text-[12.5px] text-ink/50">Averages over {report!.cashflow.fullMonths} full month{report!.cashflow.fullMonths === 1 ? "" : "s"}: income {fmt$(report!.cashflow.avg.income)}, bills {fmt$(report!.cashflow.avg.bills)}, spending {fmt$(report!.cashflow.avg.spending)}, saved {fmt$(report!.cashflow.avg.saved)}. {snap?.homeFund === null ? <Link href="/accounts" className="text-[#0052FF] underline">Mark your home-fund accounts</Link> : null}</p>
              <Link href="/transactions" className="group inline-flex items-center gap-1.5 mt-3 text-[14px] font-medium">Review transactions <span className="transition-transform group-hover:translate-x-1"><Arrow /></span></Link>
            </>
          )}
        </section>

        {/* Advisor box + accounts summary */}
        <div className="grid gap-5">
          <section className="panel">
            <h2 className="text-[17px] font-semibold tracking-[-0.3px]">Ask the advisor</h2>
            <form className="mt-3 relative" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/advisor?q=${encodeURIComponent(q.trim())}`); }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What if I pay off my car first?" aria-label="Question" className="field pr-12" />
              <button className="absolute right-1.5 top-1.5 w-8 h-8 rounded-full bg-brand-600 text-white grid place-items-center" aria-label="Ask"><Arrow size={15} /></button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">{SUGGESTIONS.map((s) => <Link key={s} href={`/advisor?q=${encodeURIComponent(s)}`} className="chip">{s}</Link>)}</div>
          </section>

          <section className="panel">
            <div className="flex items-baseline justify-between"><h2 className="text-[17px] font-semibold tracking-[-0.3px]">Accounts</h2><Link href="/accounts" className="text-[13.5px] font-medium text-[#0052FF]">Manage</Link></div>
            {!snap ? <div className="mt-3 h-16 rounded-[16px] skeleton" /> : snap.accounts.length === 0 ? (
              <p className="mt-2 text-[14px] text-ink/60">No accounts linked yet.</p>
            ) : (
              <div className="mt-2 divide-y divide-ink/5 text-[14px]">
                {snap.accounts.filter((a) => a.role !== "ignore").slice(0, 6).map((a) => (
                  <div key={a.id} className="flex items-center gap-2 py-2">
                    <div className="min-w-0"><span className="font-medium block truncate">{a.name}{a.mask ? ` ··${a.mask}` : ""}</span><span className="text-[12px] text-ink/45">{a.institution_name ?? a.type}</span></div>
                    {a.role === "home_fund" && <span className="h-5 px-2 rounded-full bg-[#0052FF]/10 text-[#0052FF] text-[10.5px] font-medium inline-flex items-center">Home fund</span>}
                    <span className="ml-auto tabular-nums">{a.type === "credit" || a.type === "loan" ? `−${fmt$(a.balance)}` : fmt$(a.balance)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2.5 font-semibold"><span>{snap.homeFund !== null ? "Home fund" : "Cash"}</span><span className="tabular-nums">{fmt$(snap.homeFund ?? snap.cash)}</span></div>
              </div>
            )}
            {snap && snap.items.some((i) => i.status !== "ok") && <p className="mt-2 text-[13px] text-amber-700">A connection needs attention. <Link href="/accounts" className="underline">Fix it</Link></p>}
          </section>
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return <div className="space-y-5"><div className="h-10 w-64 rounded-full skeleton" /><div className="grid lg:grid-cols-2 gap-5"><div className="h-[520px] rounded-[24px] skeleton" /><div className="h-[520px] rounded-[24px] skeleton" /></div></div>;
}
