"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Brand";

const NAV = [
  { href: "/dashboard", label: "Home", icon: <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-8.5Z" /> },
  { href: "/transactions", label: "Transactions", icon: <><path d="M4 7h16M4 12h16M4 17h10" /></> },
  { href: "/accounts", label: "Accounts", icon: <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h4" /></> },
  { href: "/advisor", label: "Advisor", icon: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></> },
  { href: "/settings", label: "Settings", icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></> },
];

function Icon({ children, className = "w-[22px] h-[22px]" }: { children: React.ReactNode; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

export default function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(href + "/");
  return (
    <div className="min-h-screen bg-[#f5f8fc] text-ink lg:grid lg:grid-cols-[248px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col sticky top-0 h-screen px-4 py-5 border-r border-ink/[.06] bg-white">
        <div className="px-2"><Logo href="/dashboard" /></div>
        <nav className="mt-8 space-y-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`flex items-center gap-3 h-11 px-3 rounded-[14px] text-[15px] font-medium transition ${active(n.href) ? "bg-[#eef3fa] text-brand-600" : "text-ink/65 hover:bg-[#f5f8fc] hover:text-ink"}`}>
              <Icon>{n.icon}</Icon>{n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-2">
          <p className="text-[12.5px] text-ink/50 truncate" title={email}>{email}</p>
          <form action="/auth/signout" method="post"><button className="mt-1 text-[13px] font-medium text-ink/65 hover:text-ink">Sign out</button></form>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-ink/[.06] px-4 h-14 flex items-center justify-between">
          <Logo size="sm" href="/dashboard" />
          <form action="/auth/signout" method="post"><button className="text-[13px] font-medium text-ink/60">Sign out</button></form>
        </header>

        <main className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 pb-28 lg:pb-12">{children}</main>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-ink/[.06] px-2 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`flex flex-col items-center justify-center gap-0.5 h-[60px] text-[10.5px] font-medium ${active(n.href) ? "text-brand-600" : "text-ink/50"}`}>
              <Icon className="w-6 h-6">{n.icon}</Icon>{n.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
