import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MyOwnHome — When can you buy your first home in DFW?",
  description: "Free first-time homebuyer calculator for Dallas–Fort Worth: what you can afford, how much cash you need, and the month you can buy.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
