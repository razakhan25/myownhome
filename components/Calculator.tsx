"use client";
import { useMemo } from "react";
import { computePlan, fmt$, fmtDate, DFW_CONTEXT, type PlanInputs } from "@/lib/calc";

function Money({ value, onChange, suffix, step = 50 }: { value: number; onChange: (n: number) => void; suffix?: string; step?: number }) {
  return (
    <div className={"money" + (suffix ? " pct" : "")}>
      {!suffix && <span>$</span>}
      <input type="number" inputMode="decimal" min={0} step={step} value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} />
      {suffix && <span className="suffix">{suffix}</span>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}{hint && <small>{hint}</small>}</label>
      {children}
    </div>
  );
}

function Ring({ score }: { score: number }) {
  const r = 48, c = 2 * Math.PI * r;
  const color = score >= 75 ? "var(--green)" : score >= 50 ? "var(--warn)" : "var(--terra)";
  return (
    <div className="ring" aria-label={`Readiness ${score} of 100`}>
      <svg width="112" height="112" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
        <circle cx="56" cy="56" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ transition: "stroke-dashoffset .4s" }} />
      </svg>
      <div className="num"><div><b>{score}</b><small>Readiness</small></div></div>
    </div>
  );
}

export default function Calculator({ inputs, onChange, linked }: { inputs: PlanInputs; onChange: (p: PlanInputs) => void; linked?: { savings?: boolean; debts?: boolean } }) {
  const r = useMemo(() => computePlan(inputs), [inputs]);
  const set = <K extends keyof PlanInputs>(k: K) => (v: PlanInputs[K]) => onChange({ ...inputs, [k]: v });
  const p = r.payment;
  const parts = [
    { k: "Principal & interest", v: p.principalInterest, c: "var(--green)" },
    { k: "Property tax", v: p.tax, c: "var(--terra)" },
    { k: "Insurance", v: p.insurance, c: "#8a9a5b" },
    { k: inputs.loanType === "fha" ? "FHA mortgage insurance" : "PMI", v: p.mortgageInsurance, c: "#b58a3c" },
    { k: "HOA", v: p.hoa, c: "#7a8c96" },
  ].filter((x) => x.v > 0.5);
  const cashPct = Math.min(100, (inputs.savings / Math.max(1, r.cash.total)) * 100);
  const dtiClass = r.dtiBack <= 36 ? "good" : r.dtiBack <= 43 ? "warn" : "bad";
  const priceVsMedian = r.targetPrice / DFW_CONTEXT.medianPrice;

  let tip = "";
  if (r.months === null) tip = "Add a monthly savings amount to get a buy date.";
  else if (r.months === 0) tip = "You already have enough cash to close at this price. Next step: get pre-approved and compare at least three lenders.";
  else if (r.dtiBack > 43) tip = "Your debts push the payment past the 43% limit many lenders use. Paying down a card or car loan raises your price more than saving the same amount.";
  else if (r.savingsRate < 10) tip = `Saving ${fmt$(inputs.monthlySavings + 300)} a month instead of ${fmt$(inputs.monthlySavings)} would move your date to about ${fmtDate(computePlan({ ...inputs, monthlySavings: inputs.monthlySavings + 300 }).buyDate)}.`;
  else tip = `Texas has down-payment assistance (TDHCA, plus city programs in Dallas and Fort Worth) that can shrink your ${fmt$(r.gap)} gap. Ask a lender which you qualify for.`;

  return (
    <div className="calc">
      <div className="card">
        <div className="group">
          <div className="group-title">Your money</div>
          <Field label="Household income" hint="Before tax, per year"><Money value={inputs.annualIncome} onChange={set("annualIncome")} step={1000} /></Field>
          <Field label="Monthly debt payments" hint={linked?.debts ? "From your linked accounts" : "Cards, car, student loans"}><Money value={inputs.monthlyDebts} onChange={set("monthlyDebts")} /></Field>
          <Field label="Saved for the home" hint={linked?.savings ? "From your linked accounts" : undefined}><Money value={inputs.savings} onChange={set("savings")} step={500} /></Field>
          <Field label="Saving each month"><Money value={inputs.monthlySavings} onChange={set("monthlySavings")} /></Field>
          <Field label="Current rent"><Money value={inputs.rent} onChange={set("rent")} /></Field>
        </div>
        <div className="group">
          <div className="group-title">The home</div>
          <Field label="Target price" hint={inputs.targetPrice ? "Set 0 to use your comfortable max" : "Using your comfortable max"}>
            <Money value={inputs.targetPrice} onChange={set("targetPrice")} step={5000} />
          </Field>
          <Field label="Loan type">
            <div className="seg">
              <button className={inputs.loanType === "fha" ? "on" : ""} onClick={() => onChange({ ...inputs, loanType: "fha", downPct: Math.max(3.5, inputs.downPct) })}>FHA</button>
              <button className={inputs.loanType === "conventional" ? "on" : ""} onClick={() => set("loanType")("conventional")}>Conventional</button>
            </div>
          </Field>
          <Field label="Down payment" hint={inputs.loanType === "fha" ? "FHA minimum 3.5%" : "Conventional from 3% for first-time buyers"}>
            <Money value={inputs.downPct} onChange={set("downPct")} suffix="%" step={0.5} />
          </Field>
          <details style={{ marginTop: 10 }}>
            <summary>Rate, taxes and other assumptions</summary>
            <Field label="Mortgage rate" hint="30-yr avg, Freddie Mac, Oct 29 2026"><Money value={inputs.rate} onChange={set("rate")} suffix="%" step={0.125} /></Field>
            <Field label="Property tax" hint="DFW estimate; varies by city and school district"><Money value={inputs.propertyTaxRate} onChange={set("propertyTaxRate")} suffix="%" step={0.05} /></Field>
            <Field label="Home insurance" hint="% of price per year, estimate"><Money value={inputs.insuranceRate} onChange={set("insuranceRate")} suffix="%" step={0.05} /></Field>
            <Field label="HOA" hint="Per month"><Money value={inputs.hoaMonthly} onChange={set("hoaMonthly")} step={10} /></Field>
            <Field label="Closing costs" hint="% of price"><Money value={inputs.closingPct} onChange={set("closingPct")} suffix="%" step={0.25} /></Field>
            <Field label="Reserves after closing" hint="Months of payment"><Money value={inputs.reserveMonths} onChange={set("reserveMonths")} suffix="mo" step={1} /></Field>
            <Field label="Interest on savings" hint="APY"><Money value={inputs.savingsApy} onChange={set("savingsApy")} suffix="%" step={0.25} /></Field>
          </details>
        </div>
      </div>

      <div className="card" aria-live="polite">
        <div className="result-top">
          <Ring score={r.score} />
          <div>
            <div className="headline">
              {r.months === null ? <>Set a monthly savings amount</> : r.months === 0 ? <>You could buy a <em>{fmt$(r.targetPrice)}</em> home now</> : <>You could buy a <em>{fmt$(r.targetPrice)}</em> home by <em>{fmtDate(r.buyDate)}</em></>}
            </div>
            <div className="sub">
              {r.months ? `${r.months} months of saving at ${fmt$(inputs.monthlySavings)}/mo closes a ${fmt$(r.gap)} gap.` : r.months === 0 ? "Your savings cover the cash to close." : ""}
              {" "}That's {Math.round(priceVsMedian * 100)}% of the DFW median ({fmt$(DFW_CONTEXT.medianPrice)}).
            </div>
          </div>
        </div>

        <div className="stats">
          <div className="stat"><div className="k">Comfortable max</div><div className="v">{fmt$(r.comfortable)}</div></div>
          <div className="stat"><div className="k">Stretch max</div><div className="v">{fmt$(r.stretch)}</div></div>
          <div className="stat"><div className="k">Debt-to-income</div><div className={"v " + dtiClass}>{r.dtiBack.toFixed(0)}%</div></div>
        </div>

        <div className="section-label">Monthly payment <span>{fmt$(p.total)}/mo · {r.rentVsPayment >= 0 ? "+" : "−"}{fmt$(Math.abs(r.rentVsPayment))} vs rent</span></div>
        <div className="bar">{parts.map((x) => <div key={x.k} style={{ width: `${(x.v / p.total) * 100}%`, background: x.c }} title={`${x.k}: ${fmt$(x.v)}`} />)}</div>
        <div className="legend">{parts.map((x) => <span key={x.k}><i style={{ background: x.c }} />{x.k} {fmt$(x.v)}</span>)}</div>

        <div className="section-label">Cash to close <span>{fmt$(inputs.savings)} of {fmt$(r.cash.total)}</span></div>
        <div className="progress"><div style={{ width: `${cashPct}%` }} /></div>
        <div className="legend">
          <span>Down payment {fmt$(r.cash.downPayment)}</span><span>Closing costs {fmt$(r.cash.closing)}</span><span>Reserves {fmt$(r.cash.reserves)}</span>
        </div>

        {tip && <div className="tip">{tip}</div>}
        <div className="note">Estimates for planning, not a loan offer. Comfortable = 28% of income on housing and 36% on all debts; stretch = 43% on all debts.</div>
      </div>
    </div>
  );
}
