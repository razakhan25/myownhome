import Link from "next/link";

// MyOwnHome mark (grid house with a coin dropping into the roof, Flipy face) and the Avenir Next wordmark in Propmatrix blue
export function Mark({ className = "h-8 w-auto" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/mascot.svg" alt="" aria-hidden="true" className={className} />;
}

export function Logo({ size = "md", href = "/" }: { size?: "md" | "sm"; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2" aria-label="MyOwnHome home">
      <Mark className={size === "sm" ? "h-7 w-auto" : "h-[32px] lg:h-[clamp(32px,2.4vw,50px)] w-auto"} />
      <span className={`font-logo font-medium tracking-[-0.01em] text-[#0052FF] ${size === "sm" ? "text-[20px]" : "hidden min-[400px]:inline text-[22px] lg:text-[clamp(22px,1.75vw,36px)]"}`}>MyOwnHome</span>
    </Link>
  );
}

export const Arrow = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

export const Check = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

export function Footer() {
  return (
    <footer className="max-w-[2400px] mx-auto px-8 lg:px-[3.2vw] pt-14 pb-10 text-[14px] text-ink/65">
      <div className="flex flex-wrap gap-6 sm:gap-12 justify-between">
        <Logo size="sm" />
        <nav className="flex flex-wrap items-center gap-x-7 gap-y-3">
          <Link href="/#calculator" className="hover:text-ink">Calculator</Link>
          <Link href="/#faq" className="hover:text-ink">FAQ</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <a href="https://flipy.propmatrix.ai" className="hover:text-ink">Flipy</a>
          <a href="https://chatadu.propmatrix.ai" className="hover:text-ink">ChatADU</a>
          <a href="https://propmatrix.ai" className="hover:text-ink">A Propmatrix company</a>
        </nav>
      </div>
      <p className="mt-8 max-w-[820px] text-[12.5px] leading-relaxed text-ink/45">
        MyOwnHome gives estimates for planning. It is not a lender, does not make loan offers, and is not financial, tax or legal advice. Bank connections are read-only through Plaid; we can never move money. Rates: Freddie Mac PMMS via FRED. Home values: Zillow Home Value Index. Taxes, insurance and closing costs are state or county averages you can edit.
      </p>
    </footer>
  );
}
