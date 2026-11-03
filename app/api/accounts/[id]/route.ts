import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";
import { refreshPlanFromLinked } from "@/lib/plan-sync";

const ROLES = ["home_fund", "spending", "ignore"];

// Body: { role: 'home_fund' | 'spending' | 'ignore' }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const role = body?.role;
  if (typeof role !== "string" || !ROLES.includes(role)) return NextResponse.json({ error: `role must be one of ${ROLES.join(", ")}` }, { status: 400 });
  const { data, error } = await supabase.from("accounts").update({ role }).eq("id", id).eq("user_id", user.id).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Unknown account" }, { status: 404 });
  try {
    await refreshPlanFromLinked(supabase, user.id);
  } catch (e: any) {
    console.warn("refreshPlanFromLinked failed:", e?.message);
  }
  return NextResponse.json({ ok: true });
}
