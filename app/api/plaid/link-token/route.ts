import { NextResponse } from "next/server";
import { CountryCode, Products, type LinkTokenCreateRequest } from "plaid";
import { plaid, plaidConfigured, webhookUrl } from "@/lib/plaid";
import { decrypt } from "@/lib/crypto";
import { requireUser } from "@/lib/supabase-server";
import { getItem } from "@/lib/sync";

// Body optional: { item_id } creates an update-mode token for that Item (re-auth after ITEM_LOGIN_REQUIRED / pending expiration).
export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!plaidConfigured()) return NextResponse.json({ error: "Bank linking is coming soon" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const itemId = typeof body?.item_id === "string" ? body.item_id : null;
  try {
    const base: LinkTokenCreateRequest = {
      user: { client_user_id: user.id },
      client_name: "MyOwnHome",
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: webhookUrl(),
      ...(process.env.PLAID_REDIRECT_URI ? { redirect_uri: process.env.PLAID_REDIRECT_URI } : {}),
    };
    let request: LinkTokenCreateRequest;
    if (itemId) {
      const item = await getItem(supabase, user.id, itemId);
      if (!item) return NextResponse.json({ error: "Unknown item" }, { status: 404 });
      request = { ...base, access_token: decrypt(item.access_token) }; // update mode: no products
    } else {
      request = {
        ...base,
        products: [Products.Transactions],
        required_if_supported_products: [Products.Liabilities],
        transactions: { days_requested: 730 },
      };
    }
    const res = await plaid().linkTokenCreate(request);
    return NextResponse.json({ link_token: res.data.link_token });
  } catch (e: any) {
    return NextResponse.json({ error: e?.response?.data?.error_message ?? e?.message ?? "Could not start bank link" }, { status: 500 });
  }
}
