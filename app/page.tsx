"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import Calculator from "@/components/Calculator";
import { DFW_DEFAULTS, type PlanInputs } from "@/lib/calc";
import { browserClient } from "@/lib/supabase";

const KEY = "myownhome:draft";

export default function Home() {
  const [inputs, setInputs] = useState<PlanInputs>(DFW_DEFAULTS);
  const [email, setEmail] = useState("");
  const [wl, setWl] = useState<"" | "ok" | "err" | "busy">("");

  useEffect(() => {
    try { const s = localStorage.getItem(KEY); if (s) setInputs({ ...DFW_DEFAULTS, ...JSON.parse(s) }); } catch {}
  }, []);
  const update = (p: PlanInputs) => { setInputs(p); try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} };

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setWl("busy");
    const { error } = await browserClient().from("waitlist").insert({ email: email.trim().toLowerCase() });
    setWl(error && !String(error.code).startsWith("23505") ? "err" : "ok");
  }

  return (
    <div className="wrap">
      <Nav />
      <header className="hero">
        <div className="eyebrow">For first-time buyers in Dallas–Fort Worth</div>
        <h1>Find out the month you can buy your first home.</h1>
        <p>Enter a few numbers. See what you can really afford in DFW, the cash you need to close, and your buy date. Free, no sign-up.</p>
      </header>

      <Calculator inputs={inputs} onChange={update} />

      <section className="section">
        <h2 style={{ fontSize: 32 }}>Turn the estimate into a plan</h2>
        <div className="steps">
          <div className="card"><div className="n">01</div><b>Save your plan</b><p>Your buy date updates as your savings grow, so you always know where you stand.</p></div>
          <div className="card"><div className="n">02</div><b>Link your accounts</b><p>Read-only bank connection through Plaid keeps savings and debts current. We can never move money.</p></div>
          <div className="card"><div className="n">03</div><b>Ask the advisor</b><p>“What if I pay off my car first?” Every answer is calculated from your real numbers.</p></div>
        </div>
        <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn btn-primary" href="/login">Save my plan, free</Link>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <h2 style={{ fontSize: 26 }}>Coming next: matching you to new-construction homes in DFW</h2>
        <p style={{ color: "var(--muted)", maxWidth: 620 }}>Builders often offer rate buydowns and closing-cost credits. Join the list and we’ll match homes to your plan when it opens.</p>
        <form className="waitlist" onSubmit={join}>
          <input type="email" required placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
          <button className="btn btn-primary" disabled={wl === "busy"}>Join</button>
        </form>
        {wl === "ok" && <p className="ok">You’re on the list.</p>}
        {wl === "err" && <p className="err">Something went wrong. Try again.</p>}
      </section>

      <footer>
        MyOwnHome gives estimates for planning. It is not a lender, does not make loan offers, and is not financial advice. Rates: Freddie Mac PMMS (Oct 29 2026). DFW median: Zillow via Opendoor (spring 2026). Taxes and insurance are estimates; check your county and quotes.
      </footer>
    </div>
  );
}
