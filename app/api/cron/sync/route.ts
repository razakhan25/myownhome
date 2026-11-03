import { NextResponse } from "next/server";
import { adminClient, adminConfigured } from "@/lib/supabase-admin";
import { PLAID_ITEM_COLUMNS, syncItem, type ItemSyncResult, type PlaidItemRow } from "@/lib/sync";
import { refreshPlanFromLinked } from "@/lib/plan-sync";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Vercel cron (vercel.json): least-recently-synced Items first, as many as fit in ~50 s.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || !adminConfigured()) return NextResponse.json({ error: "CRON_SECRET and SUPABASE_SECRET_KEY must be set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = adminClient();
  const { data, error } = await db
    .from("plaid_items")
    .select(PLAID_ITEM_COLUMNS)
    .in("status", ["ok", "pending_expiration"])
    .order("last_synced_at", { ascending: true, nullsFirst: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const items = (data ?? []) as PlaidItemRow[];
  const deadline = Date.now() + 50_000;
  const synced: ItemSyncResult[] = [];
  const users = new Set<string>();
  for (const item of items) {
    if (Date.now() > deadline) break;
    synced.push(await syncItem(db, item));
    users.add(item.user_id);
  }
  for (const userId of users) {
    try {
      await refreshPlanFromLinked(db, userId);
    } catch (e: any) {
      console.warn(`refreshPlanFromLinked failed for ${userId}:`, e?.message);
    }
  }
  return NextResponse.json({ synced, skipped: items.length - synced.length });
}
