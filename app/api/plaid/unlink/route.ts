import { NextResponse } from "next/server";
import { plaid, plaidError } from "@/lib/plaid";
import { decrypt } from "@/lib/crypto";
import { requireUser } from "@/lib/supabase-server";
import { getItem, must, snapshot } from "@/lib/sync";
import { refreshPlanFromLinked } from "@/lib/plan-sync";

// Body: { item_id }. Removes the Item at Plaid, then every row we hold for it.
export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const itemId = body?.item_id;
  if (typeof itemId !== "string") return NextResponse.json({ error: "Missing item_id" }, { status: 400 });
  try {
    const item = await getItem(supabase, user.id, itemId);
    if (!item) return NextResponse.json({ error: "Unknown item" }, { status: 404 });
    try {
      await plaid().itemRemove({ access_token: decrypt(item.access_token) });
    } catch (e) {
      console.warn(`itemRemove failed for ${itemId} (continuing with local delete):`, plaidError(e).message);
    }
    const uid = user.id;
    const del = (table: string) => supabase.from(table).delete().eq("user_id", uid);
    must(await del("transactions").eq("item_id", itemId));
    must(await del("recurring_streams").eq("item_id", itemId));
    const accountIds = (must(await supabase.from("accounts").select("id").eq("user_id", uid).eq("item_id", itemId)) as { id: string }[]).map((a) => a.id);
    if (accountIds.length) {
      must(await del("balance_snapshots").in("account_id", accountIds));
      must(await del("liabilities").in("account_id", accountIds));
    }
    must(await del("accounts").eq("item_id", itemId));
    must(await del("plaid_items").eq("item_id", itemId));
    try {
      await refreshPlanFromLinked(supabase, uid);
    } catch (e: any) {
      console.warn("refreshPlanFromLinked failed:", e?.message);
    }
    return NextResponse.json(await snapshot(supabase, uid));
  } catch (e: any) {
    return NextResponse.json({ error: e?.response?.data?.error_message ?? e?.message ?? "Unlink failed" }, { status: 500 });
  }
}
