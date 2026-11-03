"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mark, Arrow } from "@/components/Brand";

type Msg = { role: "user" | "assistant"; content: string; steps?: string[] };
const SUGGESTIONS = ["How do I buy sooner?", "FHA or conventional for me?", "Should I pay off debt first?", "Where is my money going each month?", "Is buying better than renting over 7 years?", "What can I cut to save $300 more a month?"];

export default function AdvisorPage() {
  return <Suspense fallback={<div className="h-64 rounded-[24px] skeleton" />}><Advisor /></Suspense>;
}

function Advisor() {
  const params = useSearchParams();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [thinking, setThinking] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  const ask = async (text: string, base: Msg[] = msgs) => {
    if (!text.trim()) return;
    const next: Msg[] = [...base, { role: "user", content: text.trim() }];
    setMsgs(next); setQ(""); setThinking(true);
    try {
      const r = await fetch("/api/advisor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }) });
      const j = await r.json();
      setMsgs([...next, { role: "assistant", content: r.ok ? j.reply : j.error, steps: j.steps }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "The advisor couldn't be reached. Try again." }]);
    }
    setThinking(false);
  };

  useEffect(() => {
    const q0 = params.get("q");
    if (q0 && !asked.current) { asked.current = true; ask(q0, []); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, thinking]);

  return (
    <div className="max-w-[820px] mx-auto flex flex-col min-h-[calc(100vh-140px)]">
      <div className="flex items-center gap-3">
        <Mark className="h-10 w-auto" />
        <div><h1 className="font-serif text-[30px] sm:text-[36px] leading-none tracking-[-0.7px]">Advisor</h1><p className="text-[13.5px] text-ink/55">Reads your plan and accounts. Every number comes from the calculators.</p></div>
      </div>

      <div className="flex-1 mt-6 space-y-4">
        {msgs.length === 0 && !thinking && (
          <div className="panel">
            <p className="text-[15px] text-ink/70">Ask about your buy date, loan types, debts, or where your money goes. The advisor shows the steps it ran under each answer.</p>
            <div className="mt-4 flex flex-wrap gap-2">{SUGGESTIONS.map((s) => <button key={s} onClick={() => ask(s)} className="chip">{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`pop-in ${m.role === "user" ? "flex justify-end" : ""}`}>
            {m.role === "user" ? (
              <div className="max-w-[85%] bg-brand-600 text-white rounded-[22px] rounded-br-md px-4 py-3 text-[15px] whitespace-pre-wrap">{m.content}</div>
            ) : (
              <div className="max-w-[94%]">
                {m.steps && m.steps.length > 0 && <div className="mb-1.5 text-[12px] text-ink/45 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#0052FF]" />{m.steps.join(" · ")}</div>}
                <div className="bg-white rounded-[22px] rounded-bl-md px-4 py-3 text-[15px] leading-[1.5] shadow-[0_1px_2px_rgba(0,12,31,.04),0_20px_40px_-28px_rgba(0,20,60,.18)] whitespace-pre-wrap">{m.content}</div>
              </div>
            )}
          </div>
        ))}
        {thinking && <div className="text-[14px] text-ink/50 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#0052FF] animate-ping" />Running the numbers…</div>}
        <div ref={end} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="sticky bottom-[76px] lg:bottom-4 mt-6">
        <div className="relative bg-white rounded-full shadow-[0_20px_40px_-20px_rgba(0,30,80,.35)] ring-1 ring-ink/[.06] p-1.5">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about your plan" aria-label="Question" className="field h-11 pr-14 bg-white" />
          <button disabled={thinking || !q.trim()} className="absolute right-2.5 top-2.5 w-9 h-9 rounded-full bg-brand-600 text-white grid place-items-center disabled:opacity-40" aria-label="Ask"><Arrow size={16} /></button>
        </div>
        <p className="mt-2 text-center text-[11.5px] text-ink/40">Not a lender or financial advisor. Check big decisions with a licensed professional.</p>
      </form>
    </div>
  );
}
