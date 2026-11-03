import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";
import { syncUser, snapshot } from "@/lib/sync";
import { plaidConfigured } from "@/lib/plaid";

// GET = cached snapshot, POST = refresh from Plaid
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { data: items } = await supabase.from("plaid_items").select("institution_name").eq("user_id", user.id);
  return NextResponse.json({ ...(await snapshot(supabase, user.id, (items ?? []).map((i) => i.institution_name ?? "Bank"))), plaidEnabled: plaidConfigured() });
}

export async function POST() {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  try {
    return NextResponse.json(await syncUser(supabase, user.id));
  } catch (e: any) {
    return NextResponse.json({ error: e?.response?.data?.error_message ?? "Sync failed" }, { status: 500 });
  }
}
