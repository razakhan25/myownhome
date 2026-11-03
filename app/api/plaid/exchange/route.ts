import { NextResponse } from "next/server";
import { plaid } from "@/lib/plaid";
import { encrypt } from "@/lib/crypto";
import { requireUser } from "@/lib/supabase-server";
import { syncUser } from "@/lib/sync";

export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { public_token, institution } = await req.json();
  if (typeof public_token !== "string") return NextResponse.json({ error: "Missing token" }, { status: 400 });
  try {
    const ex = await plaid().itemPublicTokenExchange({ public_token });
    const { error } = await supabase.from("plaid_items").insert({
      user_id: user.id,
      item_id: ex.data.item_id,
      access_token: encrypt(ex.data.access_token),
      institution_name: typeof institution === "string" ? institution.slice(0, 120) : null,
    });
    if (error) throw error;
    const snap = await syncUser(supabase, user.id);
    return NextResponse.json(snap);
  } catch (e: any) {
    return NextResponse.json({ error: e?.response?.data?.error_message ?? e?.message ?? "Link failed" }, { status: 500 });
  }
}
