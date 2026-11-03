import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";
import { adminClient, adminConfigured } from "@/lib/supabase-admin";
import { plaid, plaidConfigured } from "@/lib/plaid";
import { decrypt } from "@/lib/crypto";

export const maxDuration = 60;

// POST /api/account/delete — remove every Plaid Item, every row, then the auth user
export async function POST() {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { data: items } = await supabase.from("plaid_items").select("item_id, access_token").eq("user_id", user.id);
  if (plaidConfigured()) {
    for (const it of items ?? []) {
      try { await plaid().itemRemove({ access_token: decrypt(it.access_token) }); } catch (e: any) { console.error("item/remove failed", it.item_id, e?.response?.data?.error_code ?? e?.message); }
    }
  }
  for (const t of ["transactions", "recurring_streams", "balance_snapshots", "merchant_rules", "advisor_memory", "liabilities", "accounts", "plaid_items", "plans"]) {
    const { error } = await supabase.from(t).delete().eq("user_id", user.id);
    if (error) return NextResponse.json({ error: `Could not delete ${t}: ${error.message}` }, { status: 500 });
  }
  if (adminConfigured()) {
    const { error } = await adminClient().auth.admin.deleteUser(user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true, authDeleted: adminConfigured() });
}
