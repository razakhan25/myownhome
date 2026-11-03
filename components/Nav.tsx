import Link from "next/link";

export default function Nav({ right }: { right?: React.ReactNode }) {
  return (
    <nav className="nav">
      <Link href="/" className="brand">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-8.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        MyOwnHome
      </Link>
      <div className="nav-links">{right ?? <Link className="btn btn-ghost" href="/login">Sign in</Link>}</div>
    </nav>
  );
}
