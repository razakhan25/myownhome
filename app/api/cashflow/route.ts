import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";
import { linkedReport } from "@/lib/plan-sync";

export const dynamic = "force-dynamic";

// GET /api/cashflow — monthly income / bills / spending / saved from linked transactions, plus the values the plan follows
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  return NextResponse.json(await linkedReport(supabase, user.id));
}
