import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";
import { getItem, snapshot, syncItem, syncUserItems, type ItemSyncResult } from "@/lib/sync";
import { plaidConfigured } from "@/lib/plaid";
import { refreshPlanFromLinked } from "@/lib/plan-sync";

export const maxDuration = 60;

// GET = cached snapshot, POST = refresh from Plaid
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  return NextResponse.json({ ...(await snapshot(supabase, user.id)), plaidEnabled: plaidConfigured() });
}

// Body optional: { item_id } syncs that one Item whatever its status (after Link update mode, since Plaid
// only sends LOGIN_REPAIRED when the repair happened outside this app).
export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    let results: ItemSyncResult[];
    if (typeof body?.item_id === "string") {
      const item = await getItem(supabase, user.id, body.item_id);
      if (!item) return NextResponse.json({ error: "Unknown item" }, { status: 404 });
      results = [await syncItem(supabase, item)];
    } else {
      results = await syncUserItems(supabase, user.id);
    }
    try {
      await refreshPlanFromLinked(supabase, user.id);
    } catch (e: any) {
      console.warn("refreshPlanFromLinked failed:", e?.message);
    }
    return NextResponse.json({ ...(await snapshot(supabase, user.id)), results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.response?.data?.error_message ?? e?.message ?? "Sync failed" }, { status: 500 });
  }
}
