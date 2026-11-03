"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Logo, Mark, Arrow, Footer } from "@/components/Brand";
import AccountButton from "@/components/auth/AccountButton";
import Calculator, { Ring } from "@/components/Calculator";
import MetroPicker, { type MetroOption } from "@/components/MetroPicker";
import { useDraftPlan } from "@/lib/use-plan";
import { BASE_DEFAULTS, computePlan, fmt$, fmtDate } from "@/lib/calc";

type Card = { id: string; name: string; mid: number; bottom: number | null; change: number | null; asOf: string };

const MISSION = "MyOwnHome reads your real income, bills and savings, then tells you the month you can buy, at what price, and what to do this month.".split(" ");

const FAQ = [
  ["Where does MyOwnHome work?", "Every US metro Zillow tracks, about 900 of them. Pick your metro and the typical home price, property tax, insurance and closing costs switch to local figures. Rates come from Freddie Mac's weekly survey."],
  ["Where do the numbers come from?", "Your numbers come from the accounts you link (read-only, through Plaid) or what you type. Market numbers come from Zillow, the Census, state insurance data and Freddie Mac, each labeled with its date. The math is the same deterministic calculator every time; the advisor only reads results, it never invents a figure."],
  ["Is linking my bank safe?", "Plaid connects to 12,000+ US banks and is used by Venmo, Robinhood and most budgeting apps. MyOwnHome gets read-only data: balances, transactions and minimum payments. We never see your bank password and can never move money. Unlink any time and the data is deleted."],
  ["What does it cost?", "The calculator and plan are free. Linking accounts and the advisor are free while we're in beta."],
  ["Is this a loan offer or financial advice?", "No. MyOwnHome is a planning tool. It is not a lender, does not make loan offers, and is not financial, tax or legal advice. When you're ready, take your plan to a lender and compare at least three Loan Estimates."],
];

// Dallas sample: Texas tax/insurance/closing figures from data/states.json, a $320K target (between the comfortable and stretch max)
const SAMPLE = { ...BASE_DEFAULTS, annualIncome: 98000, monthlyDebts: 380, savings: 9800, monthlySavings: 1150, rent: 1790, targetPrice: 320000, propertyTaxRate: 1.49, insuranceRate: 1.0, closingPct: 2.93 };

export default function Landing({ cards, us }: { cards: Card[]; us: { mid: number; bottom: number | null; asOf: string } }) {
  const missionRef = useRef<HTMLParagraphElement>(null);
  const [lit, setLit] = useState(0);
  const plan = useDraftPlan();
  const sample = useMemo(() => computePlan(SAMPLE, new Date("2026-11-01T12:00:00")), []);

  useEffect(() => {
    const paint = () => {
      const el = missionRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.35)));
      setLit(Math.round(p * MISSION.length));
    };
    paint();
    addEventListener("scroll", paint, { passive: true });
    return () => removeEventListener("scroll", paint);
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("shown"); io.unobserve(e.target); } }), { threshold: 0.15 });
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const goCalc = () => document.getElementById("calculator")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const pickMetro = (m: MetroOption) => { plan.changeMetro(m); setTimeout(goCalc, 150); };

  const features = [
    { title: "Link your accounts.", body: "Checking, savings, cards and loans, read-only through Plaid. Mark the accounts that are your home fund and MyOwnHome keeps your savings and debts current every day.", visual: <AccountsVisual /> },
    { title: "See what you really save.", body: "Income, bills, spending and what actually moved into your home fund, month by month, from real transactions instead of a guess.", visual: <CashflowVisual /> },
    { title: "Know your buy date.", body: "Max price under the lending rules, cash to close with reserves, and the month your savings get there. Change anything and the date moves.", visual: <DateVisual sample={sample} /> },
    { title: "Ask anything.", body: "“What if I pay off the car first?” “FHA or conventional?” The advisor runs your plan through the same calculators and shows its steps. It never makes up a number.", visual: <AdvisorVisual /> },
  ];

  return (
    <div className="min-h-screen bg-white text-ink overflow-x-hidden">
      {/* Hero */}
      <div className="px-2 sm:px-4 lg:px-[1.8vw] pt-3 sm:pt-4 lg:pt-[1.8vw]">
        <section className="relative max-w-[2400px] mx-auto rounded-[32px] sm:rounded-[48px] lg:rounded-[clamp(48px,3.2vw,72px)] overflow-hidden pb-16 lg:pb-[clamp(64px,4.5vw,104px)] bg-gradient-to-b from-[#eaf1f8] via-[#f3f7fb] to-white">
          <header className="flex items-center justify-between px-5 sm:px-9 lg:px-[2.8vw] py-5 sm:py-6 lg:py-[1.9vw]">
            <Logo />
            <nav className="flex items-center gap-4 sm:gap-6 lg:gap-[clamp(24px,2vw,40px)]">
              <button onClick={goCalc} className="text-[14px] sm:text-[15px] lg:text-[clamp(15px,1.1vw,20px)] text-ink/65 hover:text-ink">Calculator</button>
              <a href="#faq" className="hidden sm:inline text-[14px] sm:text-[15px] lg:text-[clamp(15px,1.1vw,20px)] text-ink/65 hover:text-ink">FAQ</a>
              <Link href="/login" className="hidden sm:inline-flex items-center h-10 sm:h-11 lg:h-[clamp(44px,3.1vw,60px)] px-4 sm:px-5 lg:px-[clamp(20px,1.6vw,32px)] rounded-full bg-brand-600 hover:bg-brand-500 text-white text-[14px] sm:text-[15px] lg:text-[clamp(15px,1.1vw,20px)] font-medium transition hover:-translate-y-px">Start my plan</Link>
              <AccountButton />
            </nav>
          </header>

          <div className="px-4 pt-6 sm:pt-10 text-center">
            <button onClick={goCalc} className="inline-flex items-center gap-2 mb-5 sm:mb-6 lg:mb-[1.8vw] min-h-8 py-1.5 sm:py-0 max-w-full text-left leading-snug lg:h-[clamp(32px,2.3vw,44px)] px-3.5 lg:px-[clamp(14px,1.1vw,22px)] rounded-full bg-white/80 border border-ink/5 text-[13px] sm:text-[14px] lg:text-[clamp(14px,1vw,19px)] text-ink/75 hover:text-ink transition">
              <span className="relative flex shrink-0 w-2 h-2"><span className="absolute inset-0 rounded-full bg-[#0052FF] opacity-60 animate-ping" /><span className="relative w-2 h-2 rounded-full bg-[#0052FF]" /></span>
              Free for first-time buyers in every US metro
            </button>
            <div className="flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-5 lg:gap-x-[1.2vw]">
              <h1 className="font-serif text-[38px] sm:text-[64px] lg:text-[clamp(64px,6.4vw,144px)] leading-none tracking-[-2px] lg:tracking-[-0.03em]">Hello, I&apos;m MyOwnHome</h1>
              <Mark className="h-[52px] sm:h-[84px] lg:h-[clamp(84px,7.2vw,164px)] w-auto animate-float" />
            </div>
            <p className="mt-5 sm:mt-6 lg:mt-[1.6vw] text-[17px] sm:text-[20px] lg:text-[clamp(20px,1.65vw,34px)] text-ink/65">Your AI guide to buying your first home.</p>
          </div>

          <div className="relative max-w-[688px] lg:max-w-[max(688px,min(56vw,1300px))] mx-auto mt-12 lg:mt-[3.6vw] px-4 lg:px-0">
            <div className="absolute left-3 right-3 sm:left-7 sm:right-7 -top-5 lg:-top-[1.2vw] lg:left-[1.8vw] lg:right-[1.8vw] z-10">
              <div className="rounded-full bg-white shadow-[0_20px_40px_-20px_rgba(0,30,80,.35)] p-1.5 sm:p-2">
                <MetroPicker value={plan.metro} onChange={pickMetro} placeholder="Where do you want to buy? Try Austin, TX" size="lg" className="[&_input]:shadow-none [&_input]:bg-white" />
              </div>
            </div>
            <div className="relative rounded-[40px] sm:rounded-[56px] lg:rounded-[clamp(56px,4.2vw,96px)] overflow-hidden shadow-[0_30px_60px_-30px_rgba(0,30,80,.35)] bg-gradient-to-b from-[#cfe0f3] via-[#e4eef8] to-[#f3f8fc] pt-16 sm:pt-20 lg:pt-[5.5vw] pb-6 sm:pb-9 lg:pb-[2.6vw] px-4 sm:px-9 lg:px-[2.6vw]">
              <SceneCard sample={sample} />
            </div>
          </div>
        </section>
      </div>

      {/* Mission */}
      <section className="max-w-[1100px] lg:max-w-[min(78vw,1600px)] mx-auto px-6 pt-28 sm:pt-36 lg:pt-[9vw] pb-24 sm:pb-32 lg:pb-[7vw] text-center">
        <p ref={missionRef} className="font-serif text-[40px] sm:text-[72px] lg:text-[clamp(80px,6vw,132px)] leading-[1.04] tracking-[-2.5px] lg:tracking-[-0.03em]">
          {MISSION.map((w, k) => (
            <span key={k}>
              <span className={`mission-word ${k < lit ? "in" : ""}`}>{w}</span>
              {k === 0 && (
                <span className="inline-flex align-middle mx-[.12em] -translate-y-[.06em]" aria-hidden="true">
                  <Mark className="h-[.8em] w-auto" />
                </span>
              )}{" "}
            </span>
          ))}
        </p>
      </section>

      {/* Calculator */}
      <section id="calculator" className="px-2 sm:px-4 lg:px-[1.8vw] scroll-mt-4">
        <div className="max-w-[2400px] mx-auto rounded-[32px] sm:rounded-[48px] lg:rounded-[clamp(48px,3.2vw,72px)] bg-[#f5f8fc] px-4 sm:px-10 lg:px-[3vw] py-14 sm:py-20 lg:py-[5vw]">
          <div className="max-w-[1180px] mx-auto">
            <div className="text-center max-w-[720px] mx-auto">
              <p className="text-[15px] font-medium text-[#0052FF]">Free calculator, no sign-up</p>
              <h2 className="mt-3 font-serif text-[40px] sm:text-[56px] lg:text-[clamp(56px,4.2vw,96px)] leading-[1] tracking-[-0.03em]">Find the month you can buy.</h2>
              <p className="mt-5 text-[17px] sm:text-[20px] text-ink/65 leading-[1.35]">Pick a metro, enter a few numbers. Your draft saves in this browser; sign in to keep it, link your accounts and ask the advisor.</p>
            </div>
            <div className="mt-10">
              <Calculator inputs={plan.inputs} onChange={plan.update} metro={plan.metro} onMetroChange={plan.changeMetro} market={plan.market} />
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/login" className="btn-primary h-14 px-8 text-[16px]">Save my plan, free <Arrow /></Link>
              <span className="text-[14px] text-ink/55">Sign in with your email. Link accounts after.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Feature stack */}
      <section className="flex flex-col items-center gap-24 sm:gap-32 lg:gap-[8vw] px-6 pt-28 lg:pt-[8vw] pb-36 lg:pb-[9vw]">
        {features.map((f) => (
          <article key={f.title} className="reveal w-full max-w-[448px] lg:max-w-[clamp(448px,32vw,640px)]">
            <div className="relative aspect-square rounded-[48px] overflow-hidden">{f.visual}</div>
            <div className="pt-10 px-2 sm:px-16">
              <h2 className="text-[28px] lg:text-[clamp(28px,2vw,40px)] font-medium tracking-[-0.8px] leading-[1.15]">{f.title}</h2>
              <p className="mt-3.5 text-[19px] sm:text-[22px] lg:text-[clamp(22px,1.55vw,30px)] leading-[1.3] text-ink/65">{f.body}</p>
              <Link href="/login" className="group inline-flex items-center gap-1.5 mt-7 font-medium">Start my plan <span className="transition-transform group-hover:translate-x-1"><Arrow /></span></Link>
            </div>
          </article>
        ))}
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-[880px] lg:max-w-[min(56vw,1200px)] mx-auto px-6 pt-4 lg:pt-[2vw] pb-10 scroll-mt-6">
        <h2 className="reveal font-serif text-[40px] sm:text-[56px] lg:text-[clamp(56px,4vw,96px)] tracking-[-0.03em] text-center">Questions</h2>
        <div className="mt-10 divide-y divide-ink/10 border-y border-ink/10">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-6">
              <summary className="flex items-center justify-between gap-6 cursor-pointer list-none text-[19px] sm:text-[22px] lg:text-[clamp(22px,1.5vw,30px)] font-medium tracking-[-0.4px]">
                {q}
                <span className="shrink-0 w-9 h-9 rounded-full bg-[#f3f3f3] grid place-items-center transition group-open:rotate-45">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                </span>
              </summary>
              <p className="mt-4 pr-14 text-[17px] sm:text-[19px] lg:text-[clamp(19px,1.25vw,25px)] leading-[1.45] text-ink/65">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing CTA + metro marquee */}
      <section className="mt-24 bg-[#f7f7f7] overflow-hidden pt-24 pb-28 text-center">
        <h2 className="reveal font-serif text-[34px] sm:text-[48px] lg:text-[clamp(48px,3.8vw,84px)] tracking-[-1.4px] lg:tracking-[-0.03em]">Your first home starts with one month</h2>
        <p className="reveal max-w-[520px] lg:max-w-[clamp(520px,38vw,820px)] mx-auto mt-4 lg:mt-[1.2vw] px-4 text-[18px] sm:text-[20px] lg:text-[clamp(20px,1.5vw,30px)] leading-[1.35] text-ink/65">The one you can buy in. Find it, then let MyOwnHome keep you on pace.</p>
        <Link href="/login" className="reveal inline-flex items-center h-14 px-7 mt-9 rounded-full bg-black hover:bg-[#1c1c1c] text-white font-medium">Start my plan</Link>

        <div className="mt-20 flex gap-7 w-max items-center hover:[animation-play-state:paused]" style={{ animation: "scroll-x 70s linear infinite" }}>
          {[...cards, ...cards].map((c, k) => (
            <button key={k} onClick={() => pickMetro({ id: c.id, name: c.name, state: null })} className="w-[240px] shrink-0 bg-white rounded-[20px] p-4 text-left text-[12px] shadow-[0_1px_2px_rgba(0,0,0,.04),0_20px_40px_-24px_rgba(0,20,60,.18)] hover:-translate-y-0.5 transition">
              <h4 className="text-[13px] font-medium mb-2.5">{c.name}</h4>
              {([["Typical home", "Zillow mid tier", fmt$(c.mid)], ["Starter homes", "Bottom third", c.bottom ? fmt$(c.bottom) : "—"], ["12 months", "Change", c.change === null ? "—" : `${c.change > 0 ? "+" : ""}${c.change.toFixed(1)}%`]] as const).map(([tag, line, val]) => (
                <div key={tag} className="flex items-center gap-2 py-2 border-t first:border-t-0 border-ink/5">
                  <div className="min-w-0"><b className="font-semibold">{tag}</b><div className="text-ink/45 truncate">{line}</div></div>
                  <span className="ml-auto h-[22px] px-2.5 rounded-full bg-brand-600 text-white text-[11px] inline-flex items-center whitespace-nowrap tabular-nums">{val}</span>
                </div>
              ))}
            </button>
          ))}
        </div>
        <p className="mt-8 text-[12px] text-ink/40">Zillow Home Value Index, {new Date(us.asOf + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })}. US typical home {fmt$(us.mid)}.</p>
      </section>

      <Footer />
    </div>
  );
}

/* ---------- hero scene: a sample plan, every number from lib/calc ---------- */
function SceneCard({ sample }: { sample: ReturnType<typeof computePlan> }) {
  return (
    <div className="grid sm:grid-cols-[1.15fr_.85fr] gap-4 text-left">
      <div className="bg-white/95 backdrop-blur rounded-[28px] p-5 sm:p-6 shadow-[0_20px_40px_-24px_rgba(0,20,60,.25)]">
        <div className="flex items-center gap-4">
          <Ring score={sample.score} size={88} />
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[.08em] text-[#0052FF]">Sample plan · Dallas, TX</p>
            <p className="mt-1 font-serif text-[22px] sm:text-[26px] leading-[1.05] tracking-[-0.4px]">A <span className="text-[#0052FF]">{fmt$(sample.targetPrice)}</span> home by <span className="text-[#0052FF]">{fmtDate(sample.buyDate)}</span></p>
          </div>
        </div>
        <div className="mt-4 flex items-baseline justify-between text-[12px] text-ink/60"><span>Cash to close</span><span><b className="text-ink">{fmt$(SAMPLE.savings)}</b> of {fmt$(sample.cash.total)}</span></div>
        <div className="mt-1.5 h-2.5 rounded-full bg-[#eef2f7] overflow-hidden"><div className="h-full rounded-full bg-[#0052FF]" style={{ width: `${Math.min(100, (SAMPLE.savings / sample.cash.total) * 100)}%` }} /></div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
          {[["Payment", `${fmt$(sample.payment.total)}/mo`], ["Comfortable", fmt$(sample.comfortable)], ["DTI", `${sample.dtiBack.toFixed(0)}%`]].map(([k, v]) => (
            <div key={k} className="rounded-[14px] bg-[#f5f8fc] px-3 py-2"><div className="text-ink/50">{k}</div><div className="font-semibold tabular-nums">{v}</div></div>
          ))}
        </div>
      </div>
      <div className="grid gap-4">
        <div className="bg-white/95 backdrop-blur rounded-[28px] p-5 shadow-[0_20px_40px_-24px_rgba(0,20,60,.25)] text-[13px]">
          <p className="text-[12px] font-semibold uppercase tracking-[.08em] text-ink/50">Linked accounts</p>
          {[["Everyday Checking", "Chase", "$4,210", ""], ["Online Savings", "Ally", "$21,400", "Home fund"], ["Quicksilver", "Capital One", "−$1,120", ""]].map(([n, b, v, tag]) => (
            <div key={n} className="flex items-center gap-2 py-2 border-t first:border-t-0 border-ink/5">
              <div className="min-w-0"><b className="font-medium">{n}</b><div className="text-ink/45 text-[12px]">{b}</div></div>
              {tag && <span className="h-5 px-2 rounded-full bg-[#0052FF]/10 text-[#0052FF] text-[10.5px] font-medium inline-flex items-center">{tag}</span>}
              <span className="ml-auto tabular-nums font-medium">{v}</span>
            </div>
          ))}
        </div>
        <div className="bg-white/95 backdrop-blur rounded-[28px] p-5 shadow-[0_20px_40px_-24px_rgba(0,20,60,.25)] text-[13px]">
          <p className="text-[12px] font-semibold uppercase tracking-[.08em] text-ink/50">October</p>
          <div className="mt-2 grid grid-cols-4 gap-2 text-center">
            {[["Income", "$6,480"], ["Bills", "$2,610"], ["Spending", "$2,320"], ["Saved", "$1,150"]].map(([k, v], i) => (
              <div key={k}><div className={`text-[14px] font-semibold tabular-nums ${i === 3 ? "text-[#0052FF]" : ""}`}>{v}</div><div className="text-[11px] text-ink/50">{k}</div></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- feature visuals ---------- */
function Panel({ children }: { children: React.ReactNode }) {
  return <div className="w-full h-full bg-gradient-to-br from-[#eaf1f8] to-[#f8fbfe] p-7 sm:p-10 flex flex-col justify-center">{children}</div>;
}
function AccountsVisual() {
  const rows: [string, string, string, string][] = [["Everyday Checking ··4821", "Chase", "$4,210", "Spending"], ["Online Savings ··0193", "Ally", "$21,400", "Home fund"], ["High-Yield Savings ··7730", "Marcus", "$6,050", "Home fund"], ["Quicksilver ··5512", "Capital One", "−$1,120", "Card"], ["Auto loan ··9901", "Toyota Financial", "−$11,800", "$318/mo"]];
  return (
    <Panel>
      <div className="bg-white rounded-[28px] p-5 sm:p-6 shadow-[0_20px_40px_-24px_rgba(0,20,60,.25)]">
        <p className="text-[13px] font-medium text-ink/55">Accounts · synced this morning</p>
        <div className="mt-3 divide-y divide-ink/5">
          {rows.map(([k, b, v, tag]) => (
            <div key={k} className="flex items-center gap-3 py-2.5 text-[14px]">
              <div className="min-w-0"><span className="font-medium block truncate">{k}</span><span className="text-[12px] text-ink/45">{b}</span></div>
              <span className={`ml-auto shrink-0 h-6 px-2.5 rounded-full text-[11px] font-medium inline-flex items-center ${tag === "Home fund" ? "bg-[#0052FF]/10 text-[#0052FF]" : "bg-[#f3f5f8] text-ink/60"}`}>{tag}</span>
              <span className="shrink-0 w-[76px] text-right tabular-nums">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
function CashflowVisual() {
  const months = [["May", 6300, 2600, 2500, 900], ["Jun", 6480, 2610, 2900, 800], ["Jul", 6480, 2610, 2150, 1300], ["Aug", 6900, 2620, 2400, 1150], ["Sep", 6480, 2610, 2250, 1200], ["Oct", 6480, 2610, 2320, 1150]] as const;
  const max = 7000;
  return (
    <Panel>
      <div className="bg-white rounded-[28px] p-5 sm:p-6 shadow-[0_20px_40px_-24px_rgba(0,20,60,.25)]">
        <div className="flex items-baseline justify-between"><p className="text-[13px] font-medium text-ink/55">Six months</p><p className="text-[13px]"><b className="text-[#0052FF]">$1,083</b> <span className="text-ink/50">saved / mo</span></p></div>
        <div className="mt-4 grid grid-cols-6 gap-2 items-end h-[150px]">
          {months.map(([m, inc, bills, spend, saved]) => (
            <div key={m} className="flex flex-col justify-end h-full gap-1">
              <div className="w-full rounded-md bg-[#0052FF]" style={{ height: `${(saved / max) * 100}%` }} title={`Saved $${saved}`} />
              <div className="w-full rounded-md bg-[#8eaed8]" style={{ height: `${(spend / max) * 100}%` }} title={`Spending $${spend}`} />
              <div className="w-full rounded-md bg-[#002664]" style={{ height: `${(bills / max) * 100}%` }} title={`Bills $${bills}`} />
              <div className="text-center text-[11px] text-ink/50">{m}<span className="sr-only"> income ${inc}</span></div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-[12px] text-ink/60"><span><i className="inline-block w-2 h-2 rounded-full bg-[#002664] mr-1.5" />Bills</span><span><i className="inline-block w-2 h-2 rounded-full bg-[#8eaed8] mr-1.5" />Spending</span><span><i className="inline-block w-2 h-2 rounded-full bg-[#0052FF] mr-1.5" />Saved to home fund</span></div>
      </div>
      <div className="mt-4 bg-white rounded-full px-5 py-3 text-[14px] shadow-[0_20px_40px_-24px_rgba(0,20,60,.25)] flex justify-between"><span className="text-ink/60">Savings rate</span><b>16.7% of income</b></div>
    </Panel>
  );
}
function DateVisual({ sample }: { sample: ReturnType<typeof computePlan> }) {
  return (
    <Panel>
      <div className="bg-white rounded-[28px] p-5 sm:p-6 shadow-[0_20px_40px_-24px_rgba(0,20,60,.25)]">
        <div className="flex items-center gap-4">
          <Ring score={sample.score} size={96} />
          <div><p className="text-[13px] text-ink/55">Buy date</p><p className="font-serif text-[30px] leading-none tracking-[-0.5px] text-[#0052FF]">{fmtDate(sample.buyDate)}</p><p className="mt-1 text-[13px] text-ink/55">{sample.months} months at {fmt$(SAMPLE.monthlySavings)}/mo</p></div>
        </div>
        <div className="mt-5 space-y-2.5 text-[13.5px]">
          {[["Down payment (3.5% FHA)", fmt$(sample.cash.downPayment)], ["Closing costs", fmt$(sample.cash.closing)], ["Reserves, 2 months", fmt$(sample.cash.reserves)]].map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-ink/65">{k}</span><span className="tabular-nums">{v}</span></div>)}
          <div className="flex justify-between pt-2.5 border-t border-ink/5 font-semibold"><span>Cash to close</span><span className="tabular-nums">{fmt$(sample.cash.total)}</span></div>
        </div>
      </div>
      <div className="mt-4 bg-white rounded-full px-5 py-3 text-[14px] shadow-[0_20px_40px_-24px_rgba(0,20,60,.25)] flex justify-between"><span className="text-ink/60">+$250/mo moves it to</span><b>{fmtDate(computePlan({ ...SAMPLE, monthlySavings: SAMPLE.monthlySavings + 250 }, new Date("2026-11-01T12:00:00")).buyDate)}</b></div>
    </Panel>
  );
}
function AdvisorVisual() {
  return (
    <Panel>
      <div className="space-y-3">
        <div className="ml-auto max-w-[85%] bg-brand-600 text-white rounded-[22px] rounded-br-md px-4 py-3 text-[14.5px]">What if I pay off the car loan before I buy?</div>
        <div className="text-[12px] text-ink/45 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#0052FF]" />Read your plan · Ran 2 what-ifs</div>
        <div className="max-w-[92%] bg-white rounded-[22px] rounded-bl-md px-4 py-3 text-[14.5px] leading-[1.4] shadow-[0_20px_40px_-24px_rgba(0,20,60,.25)]">
          Paying the $11,800 off first delays your date by 10 months, but it drops your debt-to-income from 34% to 29% and lifts your comfortable max from $312,000 to $348,000. If you want the bigger budget, do it. If you want the keys sooner, keep paying the $318 a month and buy in June 2028.
          <div className="mt-3 flex flex-wrap gap-2">{["Show both timelines", "What about a 5% down conventional?"].map((c) => <span key={c} className="chip">{c}</span>)}</div>
        </div>
      </div>
    </Panel>
  );
}

