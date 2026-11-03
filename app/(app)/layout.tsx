import { redirect } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { requireUser } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Signed-in area: sidebar on desktop, bottom tabs on mobile (middleware already redirects visitors to /login)
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  if (!user) redirect("/login");
  return <AppShell email={user.email ?? ""}>{children}</AppShell>;
}
