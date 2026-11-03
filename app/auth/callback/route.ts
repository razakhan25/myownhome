import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Only same-site paths are allowed as the place to land after signing in
const safeNext = (n: string | null | undefined) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard");

// GET /auth/callback?code=...&next=/dashboard — email links (and Google, when enabled) come back here
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await serverClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) return NextResponse.redirect(new URL(next, url.origin));
    console.error("auth callback failed:", error?.message);
  }
  const reason = url.searchParams.get("error_description") ?? "That sign-in link didn't work. Request a new one.";
  return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(reason.slice(0, 160))}`, url.origin));
}
