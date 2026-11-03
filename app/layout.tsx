import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "MyOwnHome — When can you buy your first home?",
  description: "Link your accounts, see what you really save, and get the month you can buy your first home: max price, cash to close, and an advisor that runs the numbers for any US metro.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://myownhome.propmatrix.ai"),
  icons: { icon: [{ url: "/brand/mascot.svg", type: "image/svg+xml" }], apple: "/brand/apple-icon.png" },
  openGraph: { title: "MyOwnHome", description: "Find out the month you can buy your first home.", type: "website" },
};

export const viewport: Viewport = { themeColor: "#002664", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Nunito:wght@600;700&family=Inter+Tight:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
