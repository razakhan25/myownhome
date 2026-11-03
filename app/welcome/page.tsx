"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo, Mark, Arrow, Check } from "@/components/Brand";
import MetroPicker from "@/components/MetroPicker";
import { Money } from "@/components/Calculator";
import { usePlaidLink, useSavedPlan, useSnapshot, type Snap } from "@/components/app/hooks";
import { computePlan, fmt$, fmtDate } from "@/lib/calc";

// First run: where + the basics → link a bank (optional) → mark the home-fund accounts → plan
export default function Welcome() {
  const router = useRouter();
  const plan = useSavedPlan();
  const { snap, setSnap } = useSnapshot();
  const link = usePlaidLink();
  const [step, setStep] = useState(1);
  const [roles, setRoles] = useState<Record<string, string>>({});

  useEffect(() => { if (plan.plan?.onboarded_at) router.replace("/dashboard"); }, [plan.plan?.onboarded_at, router]);
  useEffect(() => { if (snap) setRoles(Object.fromEntries(snap.accounts.map((a) => [a.id, a.role]))); }, [snap]);

  if (!plan.plan) return <Shell><div className="h-64 rounded-[24px] skeleton" /></Shell>;
  const p = plan.plan.inputs;
  const r = computePlan(p);
  const set = (k: keyof typeof p) => (v: number) => plan.update({ ...p, [k]: v });
  const depository = (snap?.accounts ?? []).filter((a) => a.type === "depository");

  const finish = async () => {
    await Promise.all(Object.entries(roles).filter(([id, role]) => snap?.accounts.find((a) => a.id === id)?.role !== role).map(([id, role]) =>
      fetch(`/api/accounts/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) })));
    plan.markOnboarded();
    setTimeout(() => router.replace("/dashboard"), 600);
  };

  return (
    <Shell>
      <div className="flex items-center gap-2 text-[13px] text-ink/50 mb-6">
        {["Where and the basics", "Link your bank", "Your home fund"].map((s, i) => (
          <span key={s} className={`flex items-center gap-2 ${i + 1 === step ? "text-ink font-medium" : ""}`}>
            <span className={`w-6 h-6 rounded-full grid place-items-center text-[12px] ${i + 1 < step ? "bg-[#0052FF] text-white" : i + 1 === step ? "bg-brand-600 text-white" : "bg-[#eef2f7] text-ink/50"}`}>{i + 1 < step ? <Check className="w-3 h-3" /> : i + 1}</span>
            <span className="hidden sm:inline">{s}</span>
            {i < 2 && <span className="w-6 h-px bg-ink/10" />}
          </span>
        ))}
      </div>

      {step === 1 && (
        <div className="grid lg:grid-cols-[1fr_.8fr] gap-6 items-start">
          <div className="panel">
            <h1 className="font-serif text-[34px] leading-none tracking-[-0.6px]">Where do you want to buy?</h1>
            <div className="mt-4"><MetroPicker value={plan.metro} onChange={plan.changeMetro} autoFocus /></div>
            {plan.market && <p className="mt-2 text-[13px] text-ink/55">Typical home in {plan.market.metro.name}: {fmt$(plan.market.medianPrice)}{plan.market.starterPrice ? `, starter homes ${fmt$(plan.market.starterPrice)}` : ""}. Rate {plan.market.rate.rate}%.</p>}
            <h2 className="mt-8 text-[17px] font-semibold">A few numbers to start</h2>
            <p className="text-[13.5px] text-ink/55">Rough is fine. Link your bank in the next step and these fill in from real data.</p>
            <div className="mt-3 divide-y divide-ink/5">
              {([["Household income, before tax, per year", "annualIncome", 1000], ["Monthly debt payments", "monthlyDebts", 50], ["Saved for the home so far", "savings", 500], ["Saving each month", "monthlySavings", 50], ["Current rent", "rent", 50]] as const).map(([label, k, step]) => (
                <div key={k} className="grid grid-cols-[1fr_150px] items-center gap-3 py-2"><label className="text-[15px]">{label}</label><Money value={p[k]} onChange={set(k)} step={step} /></div>
              ))}
            </div>
            <div className="mt-6 flex justify-end"><button onClick={() => setStep(2)} disabled={!plan.metro} className="btn-primary">Next <Arrow /></button></div>
            {!plan.metro && <p className="mt-2 text-right text-[12.5px] text-ink/45">Pick a metro to continue.</p>}
          </div>
          <Preview r={r} monthly={p.monthlySavings} />
        </div>
      )}

      {step === 2 && (
        <div className="max-w-[640px] mx-auto panel text-center">
          <Mark className="h-16 w-auto mx-auto" />
          <h1 className="mt-4 font-serif text-[34px] leading-none tracking-[-0.6px]">Link your bank</h1>
          <p className="mt-3 text-[15.5px] text-ink/65 leading-relaxed">Read-only, through Plaid. MyOwnHome reads balances, two years of transactions and minimum payments so your income, savings rate and debts stay real. We never see your password and can never move money. Unlink any time and the data is deleted.</p>
          {snap?.plaidEnabled === false ? (
            <p className="mt-5 text-[14px] text-ink/50">Bank linking opens to beta users soon. You can finish with the numbers you typed.</p>
          ) : (
            <button onClick={() => link.open({ onDone: (s: Snap) => { setSnap({ ...s, plaidEnabled: true }); setStep(3); } })} disabled={link.busy} className="btn-primary mt-6 h-12 px-7">{link.busy ? "Opening…" : "Connect with Plaid"}</button>
          )}
          {link.message && <p className="mt-3 text-[13.5px] text-ink/60">{link.message}</p>}
          <div className="mt-6 flex items-center justify-center gap-5 text-[14px]">
            <button onClick={() => setStep(1)} className="text-ink/55 hover:text-ink">Back</button>
            <button onClick={finish} className="font-medium text-[#0052FF]">Skip for now</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="max-w-[640px] mx-auto panel">
          <h1 className="font-serif text-[34px] leading-none tracking-[-0.6px]">Which accounts are your home fund?</h1>
          <p className="mt-3 text-[15px] text-ink/65">Money moved into these counts as saved toward the house. Everything else is everyday spending. You can change this any time under Accounts.</p>
          <div className="mt-5 divide-y divide-ink/5">
            {depository.map((a) => (
              <div key={a.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1"><p className="font-medium truncate">{a.name}{a.mask ? ` ··${a.mask}` : ""}</p><p className="text-[12.5px] text-ink/50">{a.institution_name ?? ""} · {a.subtype ?? a.type} · {fmt$(a.balance)}</p></div>
                <div className="inline-flex bg-[#f3f5f8] rounded-full p-1">
                  {([["home_fund", "Home fund"], ["spending", "Spending"], ["ignore", "Ignore"]] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setRoles((x) => ({ ...x, [a.id]: v }))} className={`h-8 px-3 rounded-full text-[12.5px] font-medium transition ${roles[a.id] === v ? "bg-white shadow-sm" : "text-ink/55"}`}>{l}</button>
                  ))}
                </div>
              </div>
            ))}
            {depository.length === 0 && <p className="py-3 text-[14px] text-ink/55">No checking or savings accounts came through yet. You can set this later.</p>}
          </div>
          <div className="mt-6 flex items-center justify-between">
            <button onClick={() => link.open({ onDone: (s: Snap) => setSnap({ ...s, plaidEnabled: true }) })} disabled={link.busy} className="text-[14px] font-medium text-[#0052FF]">+ Add another bank</button>
            <button onClick={finish} className="btn-primary">See my plan <Arrow /></button>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Preview({ r, monthly }: { r: ReturnType<typeof computePlan>; monthly: number }) {
  return (
    <div className="rounded-[28px] bg-gradient-to-b from-[#cfe0f3] via-[#e4eef8] to-[#f3f8fc] p-6 lg:sticky lg:top-6">
      <p className="text-[12px] font-semibold uppercase tracking-[.08em] text-[#0052FF]">Your first estimate</p>
      <p className="mt-2 font-serif text-[28px] leading-[1.05] tracking-[-0.5px]">{r.months === null ? "Add a monthly savings amount" : r.months === 0 ? <>A <span className="text-[#0052FF]">{fmt$(r.targetPrice)}</span> home, now</> : <>A <span className="text-[#0052FF]">{fmt$(r.targetPrice)}</span> home by <span className="text-[#0052FF]">{fmtDate(r.buyDate)}</span></>}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[13px]">
        {[["Payment", `${fmt$(r.payment.total)}/mo`], ["Cash to close", fmt$(r.cash.total)], ["Gap", fmt$(r.gap)], ["At", `${fmt$(monthly)}/mo`]].map(([k, v]) => <div key={k} className="rounded-[14px] bg-white/80 px-3 py-2"><div className="text-ink/50">{k}</div><div className="font-semibold tabular-nums">{v}</div></div>)}
      </div>
      <p className="mt-4 text-[12.5px] text-ink/55">Updates as you type. The full calculator with every assumption is on your Home page.</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f8fc] text-ink">
      <header className="px-5 sm:px-8 py-5"><Logo href="/dashboard" /></header>
      <main className="max-w-[1080px] mx-auto px-4 sm:px-6 pb-20">{children}</main>
    </div>
  );
}
