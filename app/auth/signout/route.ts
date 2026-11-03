import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// POST /auth/signout — ends the session and goes home
export async function POST(req: NextRequest) {
  const supabase = await serverClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", req.nextUrl.origin), { status: 303 });
}
