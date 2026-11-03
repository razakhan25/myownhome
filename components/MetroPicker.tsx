"use client";
import { useEffect, useRef, useState } from "react";

export type MetroOption = { id: string; name: string; state: string | null; mid?: number; bottom?: number | null };

// Search any of Zillow's ~900 US metros. Fetches /api/markets?q= as you type.
export default function MetroPicker({ value, onChange, placeholder = "City or metro, e.g. Austin, TX", className = "", autoFocus, size = "md" }:
  { value: MetroOption | null; onChange: (m: MetroOption) => void; placeholder?: string; className?: string; autoFocus?: boolean; size?: "md" | "lg" }) {
  const [q, setQ] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<MetroOption[]>([]);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQ(value?.name ?? ""); }, [value?.id, value?.name]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const search = (s: string) => {
    setQ(s); setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/markets?q=${encodeURIComponent(s)}`);
      if (r.ok) { setHits((await r.json()).metros); setActive(0); }
    }, 120);
  };
  const pick = (m: MetroOption) => { onChange(m); setQ(m.name); setOpen(false); };

  const h = size === "lg" ? "h-14 text-[17px] px-6" : "h-11 text-[15px] px-4";
  return (
    <div ref={box} className={`relative ${className}`}>
      <div className="relative">
        <svg className={`absolute ${size === "lg" ? "left-5 top-[19px] w-[18px] h-[18px]" : "left-3.5 top-[14px] w-4 h-4"} text-ink/40 pointer-events-none`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
        <input value={q} onChange={(e) => search(e.target.value)} onFocus={() => { setOpen(true); if (!hits.length) search(q); }} autoFocus={autoFocus}
          placeholder={placeholder} aria-label="Metro" autoComplete="off"
          onKeyDown={(e) => {
            if (!open || !hits.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === "Enter") { e.preventDefault(); pick(hits[active]); }
            if (e.key === "Escape") setOpen(false);
          }}
          className={`field ${h} ${size === "lg" ? "pl-12" : "pl-10"} bg-white shadow-[0_0_0_1px_rgba(0,12,31,.08)]`} />
      </div>
      {open && hits.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 mt-2 bg-white rounded-[20px] p-2 shadow-[0_30px_60px_-30px_rgba(0,30,80,.35),0_0_0_1px_rgba(0,12,31,.06)] max-h-[320px] overflow-auto pop-in" role="listbox">
          {hits.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(m)} onMouseEnter={() => setActive(i)}
                className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-[14px] text-left text-[15px] ${i === active ? "bg-[#eef3fa]" : ""}`}>
                <span className="font-medium">{m.name}</span>
                {m.mid && <span className="text-[13px] text-ink/50 tabular-nums">${Math.round(m.mid / 1000)}K typical</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
