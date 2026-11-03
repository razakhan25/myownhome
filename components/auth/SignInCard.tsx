"use client";

import { useState } from "react";
import { browserClient } from "@/lib/supabase";

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const GOOGLE = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";

// Continue with Google (when the provider is switched on), or get a sign-in link by email. Both land on /auth/callback.
export default function SignInCard({ next = "/dashboard", heading = "Sign in to MyOwnHome", sub }: { next?: string; heading?: string; sub?: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"" | "google" | "email">("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const google = async () => {
    setBusy("google");
    setError("");
    const { error } = await browserClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback() } });
    if (error) {
      setError(error.message.includes("not enabled") ? "Google sign-in isn't switched on yet. Use your email for now." : error.message);
      setBusy("");
    }
  };

  const byEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("email");
    setError("");
    const { error } = await browserClient().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: callback() } });
    setBusy("");
    if (error) setError(/rate|security purposes/i.test(error.message) ? "Too many emails just now. Wait a minute and try again." : error.message);
    else setSent(true);
  };

  if (sent) {
    return (
      <div className="text-center py-2">
        <div className="mx-auto w-14 h-14 rounded-full bg-[#eef3ff] text-[#0052FF] grid place-items-center" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
        </div>
        <p className="mt-4 font-serif text-[32px] leading-none tracking-[-0.6px]">Check your email</p>
        <p className="mt-3 text-[15.5px] text-ink/65">We sent a sign-in link to <b className="font-semibold text-ink">{email}</b>. Open it on this device to finish.</p>
        <button type="button" onClick={() => setSent(false)} className="mt-5 text-[14px] font-medium text-[#0052FF]">Use a different email</button>
      </div>
    );
  }

  return (
    <div>
      <p className="font-serif text-[32px] sm:text-[36px] leading-none tracking-[-0.8px]">{heading}</p>
      {sub && <p className="mt-3 text-[15.5px] text-ink/65">{sub}</p>}
      {GOOGLE && (
        <>
          <button type="button" onClick={google} disabled={!!busy}
            className="mt-6 w-full h-12 rounded-full bg-white text-ink text-[15.5px] font-medium flex items-center justify-center gap-3 shadow-[0_0_0_1px_rgba(0,12,31,.14)] hover:shadow-[0_0_0_2px_#002664] transition disabled:opacity-60">
            <GoogleMark /> {busy === "google" ? "Opening Google…" : "Continue with Google"}
          </button>
          <div className="my-5 flex items-center gap-3 text-[13px] text-ink/40"><span className="h-px flex-1 bg-ink/10" />or<span className="h-px flex-1 bg-ink/10" /></div>
        </>
      )}
      <form onSubmit={byEmail} className={`space-y-3 ${GOOGLE ? "" : "mt-6"}`}>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" autoComplete="email"
          className="w-full h-12 rounded-full px-5 text-[16px] text-ink placeholder:text-ink/45 outline-none bg-[#f3f3f3] focus:bg-white focus:ring-2 focus:ring-brand-200 transition" />
        <button type="submit" disabled={!!busy} className="w-full h-12 rounded-full bg-brand-600 hover:bg-brand-500 text-white text-[15px] font-medium transition disabled:opacity-60">
          {busy === "email" ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
      {error && <p className="mt-3 text-[14px] text-red-600">{error}</p>}
      <p className="mt-4 text-[12px] text-ink/45 text-center">New here? This creates your free account. No password needed.</p>
    </div>
  );
}
