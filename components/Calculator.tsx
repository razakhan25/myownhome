"use client";
import { useMemo } from "react";
import { computePlan, fmt$, fmtDate, nextAction, type LinkableField, type PlanInputs } from "@/lib/calc";
import MetroPicker, { type MetroOption } from "./MetroPicker";

export type Market = {
  metro: MetroOption; stateName: string; medianPrice: number; starterPrice: number | null; asOf: string;
  propertyTaxRate: number; insuranceRate: number; insuranceAnnual: number; closingPct: number;
  labels: { price: string; tax: string; insurance: string; closing: string };
  rate: { rate: number; asOf: string; source: string };
};

export type LinkedState = {
  values: Partial<Record<LinkableField, number>>;
  basis: Partial<Record<LinkableField, string>>;
  follow: Partial<Record<LinkableField, boolean>>;   // false = the user typed over the linked value
};

export function Money({ value, onChange, suffix, step = 50, id }: { value: number; onChange: (n: number) => void; suffix?: string; step?: number; id?: string }) {
  return (
    <div className="relative">
      {!suffix && <span className="absolute left-4 top-[11px] text-[15px] text-ink/45 pointer-events-none">$</span>}
      <input id={id} type="number" inputMode="decimal" min={0} step={step} value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        className={`field text-right tabular-nums ${suffix ? "pr-10" : "pl-8"}`} />
      {suffix && <span className="absolute right-4 top-[11px] text-[14px] text-ink/45 pointer-events-none">{suffix}</span>}
    </div>
  );
}

function Field({ label, hint, linked, onRelink, children }: { label: string; hint?: React.ReactNode; linked?: { on: boolean; value?: number; basis?: string }; onRelink?: () => void; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_150px] items-center gap-3 py-2">
      <label className="text-[15px] leading-tight">
        {label}
        {linked?.on && linked.basis ? (
          <small className="block text-[12px] text-[#0052FF] mt-0.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-[#0052FF] mr-1 align-middle" />From your accounts: {linked.basis}</small>
        ) : linked && linked.value !== undefined && !linked.on ? (
          <small className="block text-[12px] text-ink/50 mt-0.5">Edited. <button type="button" onClick={onRelink} className="text-[#0052FF] underline">Use linked {fmt$(linked.value)}</button></small>
        ) : hint ? <small className="block text-[12px] text-ink/50 mt-0.5">{hint}</small> : null}
      </label>
      {children}
    </div>
  );
}

export function Ring({ score, size = 112 }: { score: number; size?: number }) {
  const r = size * 0.43, c = 2 * Math.PI * r;
  const color = score >= 75 ? "#002664" : score >= 50 ? "#0052FF" : "#8eaed8";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`Readiness ${score} of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e6ecf5" strokeWidth={size * 0.09} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={size * 0.09} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} className="ring-draw" style={{ ["--ring-c" as string]: c, transition: "stroke-dashoffset .4s" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div><b className="block font-serif leading-none" style={{ fontSize: size * 0.3 }}>{score}</b><small className="block text-[11px] text-ink/50 uppercase tracking-[.08em] mt-0.5">Ready</small></div>
      </div>
    </div>
  );
}

export default function Calculator({ inputs, onChange, metro, onMetroChange, market, linked, onFollow, compact }: {
  inputs: PlanInputs; onChange: (p: PlanInputs) => void;
  metro: MetroOption | null; onMetroChange: (m: MetroOption) => void; market: Market | null;
  linked?: LinkedState; onFollow?: (f: LinkableField, follow: boolean) => void; compact?: boolean;
}) {
  const r = useMemo(() => computePlan(inputs), [inputs]);
  const set = <K extends keyof PlanInputs>(k: K) => (v: PlanInputs[K]) => {
    onChange({ ...inputs, [k]: v });
    if (linked && (k as string) in linked.values && linked.follow[k as LinkableField] !== false && linked.values[k as LinkableField] !== v) onFollow?.(k as LinkableField, false);
  };
  const lk = (f: LinkableField) => (linked && linked.values[f] !== undefined ? { on: linked.follow[f] !== false, value: linked.values[f], basis: linked.basis[f] } : undefined);
  const relink = (f: LinkableField) => () => { if (linked?.values[f] !== undefined) { onChange({ ...inputs, [f]: linked.values[f]! }); onFollow?.(f, true); } };
  const p = r.payment;
  const parts = [
    { k: "Principal & interest", v: p.principalInterest, c: "#002664" },
    { k: "Property tax", v: p.tax, c: "#0052FF" },
    { k: "Insurance", v: p.insurance, c: "#8eaed8" },
    { k: inputs.loanType === "fha" ? "FHA mortgage insurance" : "PMI", v: p.mortgageInsurance, c: "#FFC98A" },
    { k: "HOA", v: p.hoa, c: "#FFE08F" },
  ].filter((x) => x.v > 0.5);
  const cashPct = Math.min(100, (inputs.savings / Math.max(1, r.cash.total)) * 100);
  const dtiColor = r.dtiBack <= 36 ? "text-emerald-600" : r.dtiBack <= 43 ? "text-amber-600" : "text-red-600";
  const action = nextAction(inputs, r);
  const median = market?.medianPrice;

  return (
    <div className={`grid gap-5 ${compact ? "" : "lg:grid-cols-[minmax(0,.92fr)_minmax(0,1.08fr)]"} items-start`}>
      <div className="panel">
        <div className="eyebrow">Where</div>
        <div className="mt-2"><MetroPicker value={metro} onChange={onMetroChange} /></div>
        {market && (
          <p className="mt-2 text-[12.5px] text-ink/55">
            Typical home in {market.metro.name}: <b className="text-ink">{fmt$(market.medianPrice)}</b>{market.starterPrice ? <> · starter homes <b className="text-ink">{fmt$(market.starterPrice)}</b></> : null}. {market.labels.price.replace(/^Zillow Home Value Index, [^,]+, /, "Zillow, ")}.
          </p>
        )}

        <div className="eyebrow mt-6">Your money</div>
        <div className="mt-1 divide-y divide-ink/5">
          <Field label="Household income" hint="Before tax, per year" linked={lk("annualIncome")} onRelink={relink("annualIncome")}><Money value={inputs.annualIncome} onChange={set("annualIncome")} step={1000} /></Field>
          <Field label="Monthly debt payments" hint="Cards, car, student loans" linked={lk("monthlyDebts")} onRelink={relink("monthlyDebts")}><Money value={inputs.monthlyDebts} onChange={set("monthlyDebts")} /></Field>
          <Field label="Saved for the home" linked={lk("savings")} onRelink={relink("savings")}><Money value={inputs.savings} onChange={set("savings")} step={500} /></Field>
          <Field label="Saving each month" linked={lk("monthlySavings")} onRelink={relink("monthlySavings")}><Money value={inputs.monthlySavings} onChange={set("monthlySavings")} /></Field>
          <Field label="Current rent"><Money value={inputs.rent} onChange={set("rent")} /></Field>
        </div>

        <div className="eyebrow mt-6">The home</div>
        <div className="mt-1 divide-y divide-ink/5">
          <Field label="Target price" hint={inputs.targetPrice ? "Set 0 to use your comfortable max" : "Using your comfortable max"}>
            <Money value={inputs.targetPrice} onChange={set("targetPrice")} step={5000} />
          </Field>
          <Field label="Loan type">
            <div className="inline-flex bg-[#f3f5f8] rounded-full p-1 justify-self-end">
              <button type="button" className={`h-9 px-3.5 rounded-full text-[13.5px] font-medium transition ${inputs.loanType === "fha" ? "bg-white shadow-sm text-ink" : "text-ink/55"}`} onClick={() => onChange({ ...inputs, loanType: "fha", downPct: Math.max(3.5, inputs.downPct) })}>FHA</button>
              <button type="button" className={`h-9 px-3.5 rounded-full text-[13.5px] font-medium transition ${inputs.loanType === "conventional" ? "bg-white shadow-sm text-ink" : "text-ink/55"}`} onClick={() => set("loanType")("conventional")}>Conv.</button>
            </div>
          </Field>
          <Field label="Down payment" hint={inputs.loanType === "fha" ? "FHA minimum 3.5%" : "From 3% for first-time buyers"}>
            <Money value={inputs.downPct} onChange={set("downPct")} suffix="%" step={0.5} />
          </Field>
        </div>

        <details className="mt-4 group">
          <summary className="cursor-pointer list-none text-[14px] font-medium text-ink/60 hover:text-ink flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#f3f5f8] grid place-items-center transition group-open:rotate-45"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></span>
            Rate, taxes and other assumptions{market ? ` · ${market.metro.state ? market.stateName : "US"} averages` : ""}
          </summary>
          <div className="mt-2 divide-y divide-ink/5">
            <Field label="Mortgage rate" hint={market ? `30-yr avg, Freddie Mac, ${new Date(market.rate.asOf + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "30-yr average"}><Money value={inputs.rate} onChange={set("rate")} suffix="%" step={0.125} /></Field>
            <Field label="Property tax" hint={market?.labels.tax ?? "% of price per year"}><Money value={inputs.propertyTaxRate} onChange={set("propertyTaxRate")} suffix="%" step={0.05} /></Field>
            <Field label="Home insurance" hint={market ? `${market.labels.insurance}: about ${fmt$(market.insuranceAnnual)}/yr` : "% of price per year"}><Money value={inputs.insuranceRate} onChange={set("insuranceRate")} suffix="%" step={0.05} /></Field>
            <Field label="HOA" hint="Per month"><Money value={inputs.hoaMonthly} onChange={set("hoaMonthly")} step={10} /></Field>
            <Field label="Closing costs" hint={market?.labels.closing ?? "% of price"}><Money value={inputs.closingPct} onChange={set("closingPct")} suffix="%" step={0.25} /></Field>
            <Field label="Reserves after closing" hint="Months of payment"><Money value={inputs.reserveMonths} onChange={set("reserveMonths")} suffix="mo" step={1} /></Field>
            <Field label="Interest on savings" hint="APY"><Money value={inputs.savingsApy} onChange={set("savingsApy")} suffix="%" step={0.25} /></Field>
          </div>
        </details>
      </div>

      <div className="panel" aria-live="polite">
        <div className="flex items-center gap-5">
          <Ring score={r.score} />
          <div className="min-w-0">
            <p className="font-serif text-[26px] sm:text-[30px] leading-[1.05] tracking-[-0.5px]">
              {r.months === null ? <>Add a monthly savings amount to get a date</> : r.months === 0 ? <>You could buy a <em className="not-italic text-[#0052FF]">{fmt$(r.targetPrice)}</em> home now</> : <>You could buy a <em className="not-italic text-[#0052FF]">{fmt$(r.targetPrice)}</em> home by <em className="not-italic text-[#0052FF]">{fmtDate(r.buyDate)}</em></>}
            </p>
            <p className="mt-2 text-[14px] text-ink/60 leading-snug">
              {r.months ? `${r.months} months of saving ${fmt$(inputs.monthlySavings)}/mo closes a ${fmt$(r.gap)} gap.` : r.months === 0 ? "Your savings cover the cash to close." : ""}
              {median ? ` That's ${Math.round((r.targetPrice / median) * 100)}% of the typical ${market!.metro.name} home.` : ""}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {[["Comfortable max", fmt$(r.comfortable), ""], ["Stretch max", fmt$(r.stretch), ""], ["Debt-to-income", `${r.dtiBack.toFixed(0)}%`, dtiColor]].map(([k, v, c]) => (
            <div key={k} className="rounded-[18px] bg-[#f5f8fc] px-3.5 py-3">
              <div className="text-[11.5px] text-ink/50 uppercase tracking-[.06em]">{k}</div>
              <div className={`mt-1 text-[18px] sm:text-[20px] font-semibold tracking-[-0.4px] tabular-nums ${c}`}>{v}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-baseline justify-between text-[13px]"><span className="eyebrow">Monthly payment</span><span className="text-ink/60"><b className="text-ink">{fmt$(p.total)}</b>/mo · {r.rentVsPayment >= 0 ? "+" : "−"}{fmt$(Math.abs(r.rentVsPayment))} vs rent</span></div>
        <div className="mt-2 flex h-3 rounded-full overflow-hidden bg-[#eef2f7]">{parts.map((x) => <div key={x.k} style={{ width: `${(x.v / p.total) * 100}%`, background: x.c }} title={`${x.k}: ${fmt$(x.v)}`} />)}</div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink/60">{parts.map((x) => <span key={x.k}><i className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: x.c }} />{x.k} {fmt$(x.v)}</span>)}</div>

        <div className="mt-6 flex items-baseline justify-between text-[13px]"><span className="eyebrow">Cash to close</span><span className="text-ink/60"><b className="text-ink">{fmt$(inputs.savings)}</b> of {fmt$(r.cash.total)}</span></div>
        <div className="mt-2 h-3 rounded-full bg-[#eef2f7] overflow-hidden"><div className="h-full rounded-full bg-[#0052FF] transition-all" style={{ width: `${cashPct}%` }} /></div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink/60">
          <span>Down payment {fmt$(r.cash.downPayment)}</span><span>Closing costs {fmt$(r.cash.closing)}</span><span>Reserves {fmt$(r.cash.reserves)}</span>
        </div>

        <div className="mt-6 rounded-[20px] bg-gradient-to-br from-[#eaf1f8] to-[#f6f9fc] p-4">
          <div className="text-[12px] font-semibold uppercase tracking-[.08em] text-[#0052FF]">This month</div>
          <p className="mt-1 text-[15px] font-medium">{action.title}</p>
          <p className="mt-1 text-[13.5px] text-ink/65 leading-snug">{action.body}</p>
        </div>
        <p className="mt-4 text-[12px] text-ink/45 leading-relaxed">Estimates for planning, not a loan offer. Comfortable = 28% of income on housing and 36% on all debts; stretch = 43% on all debts. FHA adds 1.75% upfront and 0.55%/yr mortgage insurance.</p>
      </div>
    </div>
  );
}
