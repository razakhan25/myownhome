// Market assumptions for any US metro: Zillow ZHVI by metro (data/metros.json, refreshed monthly by
// scripts/build-metros.mjs), state cost averages (data/states.json), live 30-yr rate from FRED.
import metrosFile from "@/data/metros.json";
import statesFile from "@/data/states.json";

export interface Metro {
  id: string; name: string; state: string | null; rank: number;
  mid: number; bottom: number | null; midDate: string; bottomDate: string | null;
  mid12moPct: number | null; bottom12moPct: number | null;
}
export interface StateCosts { name: string; propertyTaxPct: number; insuranceAnnual: number; closingPct: number }

type MetrosFile = { asOf: string; source: string; sourceUrl: string; retrieved: string; metros: Metro[] };
type StatesFile = { retrieved: string; sources: Record<string, { name: string; url: string; asOf: string; note?: string }>; us: Omit<StateCosts, "name">; states: Record<string, StateCosts> };

const METROS = (metrosFile as MetrosFile).metros;
const STATES = statesFile as StatesFile;
export const MARKET_SOURCES = { metros: metrosFile as MetrosFile, states: STATES.sources, statesRetrieved: STATES.retrieved };

// NAIC averages lag ~3 years; 2026 quotes run roughly 1.5x (NerdWallet May 2026: US $2,490 at $400K dwelling vs NAIC 2022 $1,569)
const INSURANCE_UPLIFT = 1.5;
// Title, settlement and transfer taxes (LodeStar) plus lender fees and prepaids buyers also bring to closing
const LENDER_AND_PREPAIDS_PCT = 2.0;

export const US_METRO: Metro = METROS.find((m) => m.id === "us") ?? { id: "us", name: "United States", state: null, rank: 0, mid: 365000, bottom: 230000, midDate: "2026-09-30", bottomDate: "2026-09-30", mid12moPct: null, bottom12moPct: null };

export function findMetro(id: string | null | undefined): Metro | undefined {
  if (!id) return undefined;
  return METROS.find((m) => m.id === id);
}

export function searchMetros(q: string, limit = 8): Metro[] {
  const s = q.trim().toLowerCase();
  if (!s) return METROS.filter((m) => m.id !== "us").slice(0, limit);
  const starts = (m: Metro) => m.name.toLowerCase().startsWith(s);
  const word = (m: Metro) => m.name.toLowerCase().split(/[\s,-]+/).some((w) => w.startsWith(s));
  const hits = METROS.filter((m) => m.id !== "us" && (starts(m) || word(m) || m.name.toLowerCase().includes(s)));
  hits.sort((a, b) => Number(starts(b)) - Number(starts(a)) || Number(word(b)) - Number(word(a)) || a.rank - b.rank);
  return hits.slice(0, limit);
}

export function stateCosts(state: string | null | undefined): StateCosts {
  const s = state ? STATES.states[state.toUpperCase()] : undefined;
  return s ?? { name: "United States", ...STATES.us };
}

export interface MarketAssumptions {
  metro: Metro;
  stateName: string;
  medianPrice: number;        // ZHVI mid tier
  starterPrice: number | null;// ZHVI bottom tier
  asOf: string;
  propertyTaxRate: number;    // %/yr
  insuranceRate: number;      // %/yr of price
  insuranceAnnual: number;    // $ at the median price
  closingPct: number;         // % of price, all-in
  labels: { price: string; tax: string; insurance: string; closing: string };
}

export function assumptionsFor(metroId: string | null | undefined): MarketAssumptions {
  const metro = findMetro(metroId) ?? US_METRO;
  const sc = stateCosts(metro.state);
  const insuranceAnnual = Math.round(sc.insuranceAnnual * INSURANCE_UPLIFT);
  const insuranceRate = clamp((insuranceAnnual / metro.mid) * 100, 0.25, 2.5);
  const closingPct = clamp(sc.closingPct + LENDER_AND_PREPAIDS_PCT, 2, 6);
  const scope = metro.state ? sc.name : "US";
  return {
    metro, stateName: sc.name, medianPrice: metro.mid, starterPrice: metro.bottom, asOf: metro.midDate,
    propertyTaxRate: round2(sc.propertyTaxPct), insuranceRate: round2(insuranceRate), insuranceAnnual, closingPct: round2(closingPct),
    labels: {
      price: `Zillow Home Value Index, ${metro.name}, ${fmtAsOf(metro.midDate)}`,
      tax: `${scope} effective rate, Census ACS 2020–2024`,
      insurance: `${scope} average premium (NAIC) adjusted to 2026`,
      closing: `${scope} title and taxes (LodeStar 2025) plus lender fees and prepaids`,
    },
  };
}

export const RATE_FALLBACK = { rate: 7.24, asOf: "2026-10-29", source: "Freddie Mac PMMS via FRED (MORTGAGE30US)" };

// Latest weekly 30-yr fixed average from FRED (keyless CSV), cached for a day; falls back to the last known value.
export async function currentRate(): Promise<{ rate: number; asOf: string; source: string }> {
  try {
    const res = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=MORTGAGE30US", { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(String(res.status));
    const lines = (await res.text()).trim().split("\n").reverse();
    for (const line of lines) {
      const [date, val] = line.split(",");
      const n = Number(val);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(n) && n > 0) return { rate: n, asOf: date, source: RATE_FALLBACK.source };
    }
  } catch {
    // FRED unreachable; the fallback is dated so the UI still labels it honestly
  }
  return RATE_FALLBACK;
}

export const fmtAsOf = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round2 = (n: number) => Math.round(n * 100) / 100;
