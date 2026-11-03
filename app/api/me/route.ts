import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// GET /api/me — who's signed in, for the header's account button
export async function GET() {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ signedIn: false });
  return NextResponse.json({ signedIn: true, email: user.email ?? null });
}
