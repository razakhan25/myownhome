"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MetroPicker from "@/components/MetroPicker";
import { useReport, useSavedPlan } from "@/components/app/hooks";
import { browserClient } from "@/lib/supabase";
import { LINKABLE, fmt$ } from "@/lib/calc";

export default function SettingsPage() {
  const router = useRouter();
  const plan = useSavedPlan();
  const { report } = useReport();
  const [email, setEmail] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { browserClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? "")); }, []);

  const relinkAll = () => {
    if (!plan.plan || !report) return;
    const inputs = { ...plan.plan.inputs };
    for (const f of LINKABLE) { const v = report.linked.values[f]; if (v !== undefined) inputs[f] = v; }
    plan.update(inputs);
    for (const f of LINKABLE) plan.setFollow(f, true);
    setMsg("Plan reset to your linked accounts.");
  };

  const deleteAccount = async () => {
    setDeleting(true);
    const r = await fetch("/api/account/delete", { method: "POST" });
    if (r.ok) { try { localStorage.removeItem("myownhome:draft"); } catch {} router.replace("/?deleted=1"); router.refresh(); }
    else { setMsg((await r.json()).error ?? "Could not delete the account"); setDeleting(false); }
  };

  return (
    <div className="max-w-[760px] space-y-5">
      <div><h1 className="font-serif text-[34px] sm:text-[40px] leading-none tracking-[-0.8px]">Settings</h1><p className="mt-2 text-[14.5px] text-ink/60">{email}</p></div>

      <section className="panel">
        <h2 className="text-[17px] font-semibold tracking-[-0.3px]">Where you're buying</h2>
        <p className="mt-1 text-[13.5px] text-ink/55">Changing the metro resets the rate, tax, insurance and closing-cost assumptions to that market's figures.</p>
        <div className="mt-3 max-w-[420px]"><MetroPicker value={plan.metro} onChange={plan.changeMetro} /></div>
        {plan.market && <p className="mt-2 text-[12.5px] text-ink/50">{plan.market.labels.price}. Tax {plan.market.propertyTaxRate}%, insurance about {fmt$(plan.market.insuranceAnnual)}/yr, closing {plan.market.closingPct}%.</p>}
      </section>

      <section className="panel">
        <h2 className="text-[17px] font-semibold tracking-[-0.3px]">Linked data</h2>
        <p className="mt-1 text-[13.5px] text-ink/55">Income, debts, savings and monthly savings follow your accounts until you type over them. Reset to follow them again.</p>
        <div className="mt-3 grid sm:grid-cols-2 gap-2 text-[13.5px]">
          {LINKABLE.map((f) => {
            const v = report?.linked.values[f];
            const follows = plan.plan?.linked[f] !== false;
            return <div key={f} className="rounded-[14px] bg-[#f5f8fc] px-3.5 py-2.5 flex justify-between gap-3"><span className="capitalize">{f.replace(/([A-Z])/g, " $1").toLowerCase()}</span><span className="text-ink/60 tabular-nums">{v === undefined ? "no data" : `${fmt$(v)} · ${follows ? "following" : "edited"}`}</span></div>;
          })}
        </div>
        <button onClick={relinkAll} disabled={!report || report.accountCount === 0} className="btn-secondary mt-4">Reset plan to linked values</button>
        {msg && <p className="mt-2 text-[13.5px] text-ink/60">{msg}</p>}
      </section>

      <section className="panel">
        <h2 className="text-[17px] font-semibold tracking-[-0.3px]">Privacy</h2>
        <p className="mt-1 text-[13.5px] text-ink/55 leading-relaxed">Bank access is read-only and tokens are encrypted at rest. We never sell data. Unlinking a bank deletes its accounts and transactions. Read the <a href="/privacy" className="text-[#0052FF] underline">privacy policy</a> and <a href="/terms" className="text-[#0052FF] underline">terms</a>.</p>
      </section>

      <section className="panel ring-red-100">
        <h2 className="text-[17px] font-semibold tracking-[-0.3px] text-red-700">Delete my account</h2>
        <p className="mt-1 text-[13.5px] text-ink/55">Disconnects every bank at Plaid and permanently deletes your plan, accounts, transactions and sign-in. This cannot be undone.</p>
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder='Type "DELETE"' aria-label="Type DELETE to confirm" className="field h-10 w-[180px] text-[14px]" />
          <button onClick={deleteAccount} disabled={confirmText !== "DELETE" || deleting} className="btn-danger h-10">{deleting ? "Deleting…" : "Delete everything"}</button>
        </div>
      </section>
    </div>
  );
}
