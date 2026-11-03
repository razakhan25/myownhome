import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";
import { chunk, must } from "@/lib/sync";
import { refreshPlanFromLinked } from "@/lib/plan-sync";

// Plaid personal_finance_category primary values
const PRIMARY = new Set([
  "INCOME",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "LOAN_PAYMENTS",
  "BANK_FEES",
  "ENTERTAINMENT",
  "FOOD_AND_DRINK",
  "GENERAL_MERCHANDISE",
  "HOME_IMPROVEMENT",
  "MEDICAL",
  "PERSONAL_CARE",
  "GENERAL_SERVICES",
  "GOVERNMENT_AND_NON_PROFIT",
  "TRANSPORTATION",
  "TRAVEL",
  "RENT_AND_UTILITIES",
]);

type Fields = { category_primary?: string; category_detailed?: string | null; is_transfer?: boolean; excluded?: boolean; user_note?: string | null };

function parse(body: any): Fields | string {
  const f: Fields = {};
  if ("category_primary" in body) {
    if (typeof body.category_primary !== "string" || !PRIMARY.has(body.category_primary)) return "category_primary must be a Plaid primary category";
    f.category_primary = body.category_primary;
  }
  if ("category_detailed" in body) {
    if (body.category_detailed !== null && (typeof body.category_detailed !== "string" || body.category_detailed.length > 80)) return "category_detailed must be a string";
    f.category_detailed = body.category_detailed;
  }
  if ("is_transfer" in body) {
    if (typeof body.is_transfer !== "boolean") return "is_transfer must be a boolean";
    f.is_transfer = body.is_transfer;
  }
  if ("excluded" in body) {
    if (typeof body.excluded !== "boolean") return "excluded must be a boolean";
    f.excluded = body.excluded;
  }
  if ("user_note" in body) {
    if (body.user_note !== null && (typeof body.user_note !== "string" || body.user_note.length > 200)) return "user_note must be at most 200 characters";
    f.user_note = body.user_note;
  }
  return Object.keys(f).length ? f : "Nothing to update";
}

// Body: any of category_primary, category_detailed, is_transfer, excluded, user_note; remember: true also saves a
// merchant rule and applies it to the user's other (unedited) transactions from the same merchant.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const fields = parse(body);
  if (typeof fields === "string") return NextResponse.json({ error: fields }, { status: 400 });
  const now = new Date().toISOString();
  try {
    const { data: row, error } = await supabase
      .from("transactions")
      .update({ ...fields, user_edited: true, updated_at: now })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, name, merchant_name")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return NextResponse.json({ error: "Unknown transaction" }, { status: 404 });
    let updated = 1;

    const { user_note: _note, ...rule } = fields; // notes aren't rules
    if (body.remember === true && Object.keys(rule).length) {
      const match = String(row.merchant_name ?? row.name).toLowerCase();
      must(await supabase.from("merchant_rules").upsert({ user_id: user.id, match, ...rule }, { onConflict: "user_id,match" }));
      // ilike narrows server-side (no lower() in PostgREST filters); the exact lower-case compare happens here
      const pattern = match.replace(/[\\%_]/g, (c) => `\\${c}`);
      const others = () => supabase.from("transactions").select("id, name, merchant_name").eq("user_id", user.id).eq("user_edited", false).neq("id", id);
      const [byMerchant, byName] = await Promise.all([others().ilike("merchant_name", pattern), others().is("merchant_name", null).ilike("name", pattern)]);
      const ids = [...(must(byMerchant) as { id: string; name: string; merchant_name: string | null }[]), ...(must(byName) as { id: string; name: string; merchant_name: string | null }[])]
        .filter((t) => String(t.merchant_name ?? t.name).toLowerCase() === match)
        .map((t) => t.id);
      for (const part of chunk(ids, 200)) {
        const rows = must(await supabase.from("transactions").update({ ...rule, updated_at: now }).eq("user_id", user.id).in("id", part).select("id")) as { id: string }[];
        updated += rows.length;
      }
    }
    try {
      await refreshPlanFromLinked(supabase, user.id);
    } catch (e: any) {
      console.warn("refreshPlanFromLinked failed:", e?.message);
    }
    return NextResponse.json({ ok: true, updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 });
  }
}
