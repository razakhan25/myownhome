import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { plaid, plaidConfigured } from "@/lib/plaid";
import { requireUser } from "@/lib/supabase-server";

export async function POST() {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!plaidConfigured()) return NextResponse.json({ error: "Bank linking is coming soon" }, { status: 503 });
  try {
    const res = await plaid().linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "MyOwnHome",
      products: [Products.Transactions],
      required_if_supported_products: [Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    return NextResponse.json({ link_token: res.data.link_token });
  } catch (e: any) {
    return NextResponse.json({ error: e?.response?.data?.error_message ?? "Could not start bank link" }, { status: 500 });
  }
}
