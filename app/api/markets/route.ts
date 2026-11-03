import { NextResponse } from "next/server";
import { assumptionsFor, currentRate, searchMetros } from "@/lib/markets";

// GET /api/markets?q=dal  → metro search
// GET /api/markets?id=dallas-tx → assumptions for a metro (prices, tax, insurance, closing) + the live rate
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  if (q !== null) {
    return NextResponse.json({ metros: searchMetros(q).map((m) => ({ id: m.id, name: m.name, state: m.state, mid: m.mid, bottom: m.bottom })) });
  }
  const a = assumptionsFor(url.searchParams.get("id"));
  const rate = await currentRate();
  return NextResponse.json({ ...a, rate });
}
