"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import Calculator from "@/components/Calculator";
import { DFW_DEFAULTS, fmt$, type PlanInputs } from "@/lib/calc";
import { browserClient } from "@/lib/supabase";

type Snap = { cash: number; monthlyDebtPayments: number; accounts: { name: string; type: string; subtype: string | null; balance: number }[]; institutions: string[]; plaidEnabled?: boolean };
type Msg = { role: "user" | "assistant"; content: string; steps?: string[] };

declare global { interface Window { Plaid?: any } }

function loadPlaidScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Plaid) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Plaid"));
    document.head.appendChild(s);
  });
}

const SUGGESTIONS = [
  "How do I buy sooner?",
  "FHA or conventional for me?",
  "Should I pay off debt first?",
  "Is buying better than renting over 7 years?",
];

export default function Dashboard() {
  const router = useRouter();
  const supabase = useRef(browserClient()).current;
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [inputs, setInputs] = useState<PlanInputs | null>(null);
  const [saved, setSaved] = useState<"" | "saving" | "saved">("");
  const [snap, setSnap] = useState<Snap | null>(null);
  const [linked, setLinked] = useState<{ savings?: boolean; debts?: boolean }>({});
  const [bankMsg, setBankMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [thinking, setThinking] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return router.replace("/login");
      setUserId(data.user.id);
      setEmail(data.user.email ?? "");
      const { data: plan } = await supabase.from("plans").select("inputs").eq("user_id", data.user.id).maybeSingle();
      let draft: Partial<PlanInputs> = {};
      try { draft = JSON.parse(localStorage.getItem("myownhome:draft") ?? "{}"); } catch {}
      const start = { ...DFW_DEFAULTS, ...(plan?.inputs ?? draft) } as PlanInputs;
      setInputs(start);
      if (!plan) await supabase.from("plans").insert({ user_id: data.user.id, inputs: start });
      const r = await fetch("/api/plaid/sync");
      if (r.ok) setSnap(await r.json());
    })();
  }, [router, supabase]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, thinking]);

  const update = useCallback((p: PlanInputs) => {
    setInputs(p);
    setSaved("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!userId) return;
      await supabase.from("plans").upsert({ user_id: userId, inputs: p, updated_at: new Date().toISOString() });
      setSaved("saved");
    }, 600);
  }, [supabase, userId]);

  async function linkBank() {
    setBankMsg(""); setBusy(true);
    try {
      const t = await fetch("/api/plaid/link-token", { method: "POST" });
      const tj = await t.json();
      if (!t.ok) throw new Error(tj.error);
      await loadPlaidScript();
      const handler = window.Plaid.create({
        token: tj.link_token,
        onSuccess: async (public_token: string, metadata: any) => {
          setBankMsg("Syncing your accounts…");
          const r = await fetch("/api/plaid/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ public_token, institution: metadata?.institution?.name }) });
          const j = await r.json();
          if (!r.ok) { setBankMsg(j.error); return; }
          setSnap((s) => ({ ...j, plaidEnabled: s?.plaidEnabled ?? true }));
          setBankMsg("Linked. Use these numbers in your plan?");
        },
        onExit: () => setBusy(false),
      });
      handler.open();
    } catch (e: any) {
      setBankMsg(e.message ?? "Could not link a bank");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    const r = await fetch("/api/plaid/sync", { method: "POST" });
    const j = await r.json();
    if (r.ok) setSnap((s) => ({ ...j, plaidEnabled: s?.plaidEnabled })); else setBankMsg(j.error);
    setBusy(false);
  }

  function applySnap() {
    if (!snap || !inputs) return;
    update({ ...inputs, savings: snap.cash, monthlyDebts: snap.monthlyDebtPayments });
    setLinked({ savings: true, debts: true });
    setBankMsg("Plan updated from your accounts.");
  }

  async function ask(text: string) {
    if (!text.trim() || !inputs) return;
    const next: Msg[] = [...msgs, { role: "user", content: text.trim() }];
    setMsgs(next); setQ(""); setThinking(true);
    try {
      const r = await fetch("/api/advisor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs, messages: next.map(({ role, content }) => ({ role, content })) }) });
      const j = await r.json();
      setMsgs([...next, { role: "assistant", content: r.ok ? j.reply : j.error, steps: j.steps }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "The advisor couldn't be reached. Try again." }]);
    }
    setThinking(false);
  }

  async function signOut() { await supabase.auth.signOut(); router.replace("/"); }

  if (!inputs) return <div className="wrap"><Nav right={<span />} /><div className="center"><p style={{ color: "var(--muted)" }}>Loading your plan…</p></div></div>;

  return (
    <div className="wrap">
      <Nav right={<><span style={{ color: "var(--muted)", fontSize: 14 }}>{saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : email}</span><button className="btn btn-ghost" onClick={signOut}>Sign out</button></>} />
      <h1 style={{ fontSize: 34, margin: "6px 0 4px" }}>Your home plan</h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>Change anything and your buy date updates. Your plan saves automatically.</p>

      <div className="dash-grid">
        <Calculator inputs={inputs} onChange={update} linked={linked} />

        <div className="side">
          <div className="card">
            <h3>Linked accounts</h3>
            {snap && snap.accounts.length > 0 ? (
              <>
                {snap.accounts.map((a, i) => <div className="acct" key={i}><span>{a.name}</span><span>{fmt$(a.balance)}</span></div>)}
                <div className="acct" style={{ fontWeight: 600 }}><span>Cash in checking + savings</span><span>{fmt$(snap.cash)}</span></div>
                <div className="acct" style={{ fontWeight: 600 }}><span>Monthly debt payments</span><span>{fmt$(snap.monthlyDebtPayments)}</span></div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button className="btn btn-primary" onClick={applySnap}>Use in my plan</button>
                  <button className="btn btn-ghost" onClick={refresh} disabled={busy}>Refresh</button>
                  {snap.plaidEnabled && <button className="btn btn-ghost" onClick={linkBank} disabled={busy}>Add bank</button>}
                </div>
              </>
            ) : snap?.plaidEnabled === false ? (
              <p style={{ color: "var(--muted)", margin: 0 }}>Bank linking opens to beta users soon. Your plan works with the numbers you enter.</p>
            ) : (
              <>
                <p style={{ color: "var(--muted)", marginTop: 0 }}>Keep your savings and debts current automatically. Read-only through Plaid; we can never move money.</p>
                <button className="btn btn-primary" onClick={linkBank} disabled={busy}>Link a bank</button>
              </>
            )}
            {bankMsg && <p className="note">{bankMsg}</p>}
          </div>

          <div className="card">
            <h3>Ask the advisor</h3>
            <div className="chat">
              {msgs.length === 0 && <p style={{ color: "var(--muted)", margin: 0, fontSize: 14.5 }}>Ask anything about buying in DFW. Answers use your plan and run the math with real calculators.</p>}
              {msgs.map((m, i) => (
                <div key={i}>
                  {m.steps && m.steps.length > 0 && <div className="steps-trace">{m.steps.join(" · ")}</div>}
                  <div className={"msg " + (m.role === "user" ? "user" : "bot")}>{m.content}</div>
                </div>
              ))}
              {thinking && <div className="msg bot" style={{ color: "var(--muted)" }}>Running the numbers…</div>}
              <div ref={chatEnd} />
            </div>
            {msgs.length === 0 && <div className="chips">{SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>)}</div>}
            <form className="ask" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
              <textarea value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question" aria-label="Question"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q); } }} />
              <button className="btn btn-primary" disabled={thinking || !q.trim()}>Ask</button>
            </form>
            <p className="note">Not a lender or financial advisor. Check big decisions with a licensed professional.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
