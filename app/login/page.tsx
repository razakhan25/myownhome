import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SignInCard from "@/components/auth/SignInCard";
import { Logo, Mark } from "@/components/Brand";
import { requireUser } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in — MyOwnHome" };

const safeNext = (n?: string) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard");

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const { user } = await requireUser();
  if (user) redirect(next);
  return (
    <div className="min-h-screen bg-white text-ink overflow-x-clip">
      <div className="px-2 sm:px-4 lg:px-[1.8vw] pt-3 sm:pt-4 lg:pt-[1.8vw]">
        <section className="max-w-[2400px] mx-auto min-h-[calc(100vh-24px)] rounded-[32px] sm:rounded-[48px] bg-gradient-to-b from-[#eaf1f8] via-[#f3f7fb] to-white pb-24">
          <header className="px-5 sm:px-9 lg:px-[2.8vw] py-5 sm:py-6 lg:py-[1.9vw]"><Logo /></header>
          <div className="px-4 pt-6 sm:pt-12">
            <div className="max-w-[440px] mx-auto bg-white rounded-[32px] p-7 sm:p-9 shadow-[0_30px_60px_-30px_rgba(0,30,80,.35),0_0_0_1px_rgba(0,12,31,.05)]">
              <Mark className="h-12 w-auto" />
              <div className="mt-4">
                <SignInCard next={next} sub="Your plan, linked accounts and advisor, saved to your account." />
              </div>
              {sp.error && <p className="mt-4 text-[14px] text-red-600">{sp.error.slice(0, 160)}</p>}
            </div>
            <p className="mt-6 text-center text-[12.5px] text-ink/45">By continuing you agree to the <a href="/terms" className="underline">terms</a> and <a href="/privacy" className="underline">privacy policy</a>.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
