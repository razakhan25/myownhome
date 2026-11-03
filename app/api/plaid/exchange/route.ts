import { NextResponse } from "next/server";
import { plaid } from "@/lib/plaid";
import { encrypt } from "@/lib/crypto";
import { requireUser } from "@/lib/supabase-server";
import { PLAID_ITEM_COLUMNS, snapshot, syncItem, type PlaidItemRow } from "@/lib/sync";
import { refreshPlanFromLinked } from "@/lib/plan-sync";

export const maxDuration = 60;

// Body: { public_token, institution } where institution is Plaid Link's metadata.institution ({ name, institution_id }) or a plain name.
export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { public_token, institution } = await req.json().catch(() => ({}));
  if (typeof public_token !== "string") return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const name = typeof institution === "string" ? institution : institution?.name;
  const institutionId = typeof institution === "object" && typeof institution?.institution_id === "string" ? institution.institution_id : null;
  try {
    const ex = await plaid().itemPublicTokenExchange({ public_token });
    const { data: item, error } = await supabase
      .from("plaid_items")
      .insert({
        user_id: user.id,
        item_id: ex.data.item_id,
        access_token: encrypt(ex.data.access_token),
        institution_name: typeof name === "string" ? name.slice(0, 120) : null,
        institution_id: institutionId,
      })
      .select(PLAID_ITEM_COLUMNS)
      .single();
    if (error) throw error;
    await syncItem(supabase, item as PlaidItemRow);
    try {
      await refreshPlanFromLinked(supabase, user.id);
    } catch (e: any) {
      console.warn("refreshPlanFromLinked failed:", e?.message);
    }
    return NextResponse.json(await snapshot(supabase, user.id));
  } catch (e: any) {
    return NextResponse.json({ error: e?.response?.data?.error_message ?? e?.message ?? "Link failed" }, { status: 500 });
  }
}
