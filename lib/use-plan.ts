"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_DEFAULTS, type PlanInputs } from "./calc";
import type { Market } from "@/components/Calculator";
import type { MetroOption } from "@/components/MetroPicker";

export const DRAFT_KEY = "myownhome:draft";

// Loads a metro's assumptions and applies them to the plan (rate, tax, insurance, closing). Shared by the landing and the app.
export async function loadMarket(metroId: string | null): Promise<Market | null> {
  const r = await fetch(`/api/markets?id=${encodeURIComponent(metroId ?? "us")}`);
  return r.ok ? ((await r.json()) as Market) : null;
}

export function applyMarket(p: PlanInputs, m: Market): PlanInputs {
  return { ...p, rate: m.rate.rate, propertyTaxRate: m.propertyTaxRate, insuranceRate: m.insuranceRate, closingPct: m.closingPct };
}

// The visitor's draft plan: localStorage only, no account needed.
export function useDraftPlan() {
  const [inputs, setInputs] = useState<PlanInputs>(BASE_DEFAULTS);
  const [metro, setMetro] = useState<MetroOption | null>(null);
  const [market, setMarket] = useState<Market | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    let draft: { inputs?: Partial<PlanInputs>; metro?: MetroOption | null } = {};
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}"); } catch {}
    const start = { ...BASE_DEFAULTS, ...(draft.inputs ?? {}) };
    setInputs(start);
    setMetro(draft.metro ?? null);
    loaded.current = true;
    loadMarket(draft.metro?.id ?? null).then((m) => {
      if (!m) return;
      setMarket(m);
      // a fresh visitor gets the live rate and the metro's assumptions; a returning one keeps their edits
      if (!draft.inputs) setInputs(applyMarket(start, m));
    });
  }, []);

  const save = useCallback((p: PlanInputs, m: MetroOption | null) => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ inputs: p, metro: m })); } catch {}
  }, []);
  const update = useCallback((p: PlanInputs) => { setInputs(p); save(p, metro); }, [metro, save]);
  const changeMetro = useCallback(async (m: MetroOption) => {
    setMetro(m);
    const mk = await loadMarket(m.id);
    if (mk) {
      setMarket(mk);
      setInputs((p) => { const next = applyMarket(p, mk); save(next, m); return next; });
    } else save(inputs, m);
  }, [inputs, save]);

  return { inputs, metro, market, update, changeMetro, ready: loaded.current };
}
