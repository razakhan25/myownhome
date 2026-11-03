"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { BASE_DEFAULTS, type CashflowSummary, type LinkableField, type LinkedValues, type PlanInputs } from "@/lib/calc";
import { applyMarket, DRAFT_KEY, loadMarket } from "@/lib/use-plan";
import type { Market } from "@/components/Calculator";
import type { MetroOption } from "@/components/MetroPicker";

/* ---------- linked-account snapshot (GET /api/plaid/sync) ---------- */
export type Snap = {
  cash: number; homeFund: number | null; monthlyDebtPayments: number;
  accounts: { id: string; item_id: string; name: string; official_name: string | null; mask: string | null; type: string; subtype: string | null; balance: number; available: number | null; limit: number | null; role: string; institution_name: string | null }[];
  liabilities: { account_id: string; kind: string; minimum_payment: number | null; apr: number | null; next_payment_due_date: string | null; last_statement_balance: number | null }[];
  items: { item_id: string; institution_name: string | null; institution_id: string | null; status: string; error: string | null; last_synced_at: string | null; transactions_synced: boolean; account_count: number }[];
  lastSyncedAt: string | null; transactionCount: number; plaidEnabled?: boolean;
};

export function useSnapshot() {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/plaid/sync");
    if (r.ok) setSnap(await r.json()); else setError((await r.json()).error ?? "Could not load accounts");
  }, []);
  useEffect(() => { load(); }, [load]);
  const sync = useCallback(async () => {
    const r = await fetch("/api/plaid/sync", { method: "POST" });
    const j = await r.json();
    if (r.ok) setSnap((s) => ({ ...j, plaidEnabled: s?.plaidEnabled ?? true })); else setError(j.error ?? "Sync failed");
    return r.ok;
  }, []);
  return { snap, setSnap, error, reload: load, sync };
}

/* ---------- cash flow report (GET /api/cashflow) ---------- */
export type Report = { cashflow: CashflowSummary; linked: LinkedValues; accountCount: number };
export function useReport() {
  const [report, setReport] = useState<Report | null>(null);
  const load = useCallback(async () => { const r = await fetch("/api/cashflow"); if (r.ok) setReport(await r.json()); }, []);
  useEffect(() => { load(); }, [load]);
  return { report, reload: load };
}

/* ---------- the saved plan (plans row), autosaved ---------- */
export type PlanRow = { inputs: PlanInputs; linked: Partial<Record<LinkableField, boolean>>; metro_id: string | null; onboarded_at: string | null };

export function useSavedPlan() {
  const supabase = useRef(browserClient()).current;
  const [userId, setUserId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [market, setMarket] = useState<Market | null>(null);
  const [saving, setSaving] = useState<"" | "saving" | "saved">("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setUserId(data.user.id);
      const { data: row } = await supabase.from("plans").select("inputs, linked, metro_id, onboarded_at").eq("user_id", data.user.id).maybeSingle();
      let draft: { inputs?: Partial<PlanInputs>; metro?: MetroOption | null } = {};
      try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}"); } catch {}
      const next: PlanRow = row
        ? { inputs: { ...BASE_DEFAULTS, ...(row.inputs as Partial<PlanInputs>) }, linked: (row.linked as PlanRow["linked"]) ?? {}, metro_id: row.metro_id, onboarded_at: row.onboarded_at }
        : { inputs: { ...BASE_DEFAULTS, ...(draft.inputs ?? {}) }, linked: {}, metro_id: draft.metro?.id ?? null, onboarded_at: null };
      setPlan(next);
      if (!row) await supabase.from("plans").insert({ user_id: data.user.id, inputs: next.inputs, metro_id: next.metro_id });
      const m = await loadMarket(next.metro_id);
      if (m) setMarket(m);
    })();
  }, [supabase]);

  const persist = useCallback((p: PlanRow) => {
    setSaving("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (!userId) return;
      await supabase.from("plans").upsert({ user_id: userId, inputs: p.inputs, linked: p.linked, metro_id: p.metro_id, onboarded_at: p.onboarded_at, updated_at: new Date().toISOString() });
      setSaving("saved");
    }, 500);
  }, [supabase, userId]);

  const update = useCallback((inputs: PlanInputs) => setPlan((p) => { if (!p) return p; const n = { ...p, inputs }; persist(n); return n; }), [persist]);
  const setFollow = useCallback((f: LinkableField, follow: boolean) => setPlan((p) => { if (!p) return p; const n = { ...p, linked: { ...p.linked, [f]: follow } }; persist(n); return n; }), [persist]);
  const changeMetro = useCallback(async (m: MetroOption) => {
    const mk = await loadMarket(m.id);
    if (mk) setMarket(mk);
    setPlan((p) => { if (!p) return p; const n = { ...p, metro_id: m.id, inputs: mk ? applyMarket(p.inputs, mk) : p.inputs }; persist(n); return n; });
  }, [persist]);
  const markOnboarded = useCallback(() => setPlan((p) => { if (!p) return p; const n = { ...p, onboarded_at: new Date().toISOString() }; persist(n); return n; }), [persist]);
  const reload = useCallback(async () => {
    if (!userId) return;
    const { data: row } = await supabase.from("plans").select("inputs, linked, metro_id, onboarded_at").eq("user_id", userId).maybeSingle();
    if (row) setPlan({ inputs: { ...BASE_DEFAULTS, ...(row.inputs as Partial<PlanInputs>) }, linked: (row.linked as PlanRow["linked"]) ?? {}, metro_id: row.metro_id, onboarded_at: row.onboarded_at });
  }, [supabase, userId]);

  const metro: MetroOption | null = market ? market.metro : plan?.metro_id ? { id: plan.metro_id, name: plan.metro_id, state: null } : null;
  return { userId, plan, market, metro, saving, update, setFollow, changeMetro, markOnboarded, reload };
}

/* ---------- Plaid Link (CDN script, same as v1) ---------- */
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

export function usePlaidLink() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // itemId → update mode (reconnect); onDone gets the fresh snapshot after a new link
  const open = useCallback(async (opts: { itemId?: string; onDone?: (snap: Snap) => void } = {}) => {
    setMessage(""); setBusy(true);
    try {
      const t = await fetch("/api/plaid/link-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: opts.itemId }) });
      const tj = await t.json();
      if (!t.ok) throw new Error(tj.error);
      await loadPlaidScript();
      const handler = window.Plaid.create({
        token: tj.link_token,
        onSuccess: async (public_token: string, metadata: any) => {
          if (opts.itemId) { setMessage("Reconnected. Syncing…"); const r = await fetch("/api/plaid/sync", { method: "POST" }); const j = await r.json(); if (r.ok) opts.onDone?.(j); setBusy(false); return; }
          setMessage("Linked. Reading your accounts…");
          const r = await fetch("/api/plaid/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ public_token, institution: metadata?.institution }) });
          const j = await r.json();
          if (!r.ok) { setMessage(j.error ?? "Link failed"); setBusy(false); return; }
          setMessage("");
          opts.onDone?.(j);
          setBusy(false);
        },
        onExit: (err: any) => { if (err?.display_message) setMessage(err.display_message); setBusy(false); },
      });
      handler.open();
    } catch (e: any) {
      setMessage(e.message ?? "Could not open bank linking");
      setBusy(false);
    }
  }, []);
  return { open, busy, message, setMessage };
}

export const fmtWhen = (iso: string | null) => {
  if (!iso) return "never";
  const d = new Date(iso), diff = (Date.now() - d.getTime()) / 60000;
  if (diff < 2) return "just now";
  if (diff < 60) return `${Math.round(diff)} min ago`;
  if (diff < 36 * 60) return `${Math.round(diff / 60)} h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
