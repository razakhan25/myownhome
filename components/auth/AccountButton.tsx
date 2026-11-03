"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Me = { signedIn: boolean; email?: string };

// Header pill: "Sign in" for visitors, "My plan" for signed-in users (reads /api/me so the landing can stay static).
export default function AccountButton({ className = "" }: { className?: string }) {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then(setMe).catch(() => setMe({ signedIn: false }));
  }, []);
  const base = "inline-flex items-center h-10 sm:h-11 lg:h-[clamp(44px,3.1vw,60px)] px-4 sm:px-5 lg:px-[clamp(20px,1.6vw,32px)] rounded-full text-[14px] sm:text-[15px] lg:text-[clamp(15px,1.1vw,20px)] font-medium transition";
  if (!me) return <span className={`${base} w-[88px] skeleton ${className}`} aria-hidden="true" />;
  return me.signedIn ? (
    <Link href="/dashboard" className={`${base} bg-brand-600 hover:bg-brand-500 text-white hover:-translate-y-px ${className}`}>My plan</Link>
  ) : (
    <Link href="/login" className={`${base} bg-white/80 hover:bg-white text-ink ring-1 ring-ink/10 ${className}`}>Sign in</Link>
  );
}
