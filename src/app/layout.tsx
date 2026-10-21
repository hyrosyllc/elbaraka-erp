import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-interface",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-data",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Elbaraka Operations",
  description: "Inventory, production, orders, and dispatch for Elbaraka Epices.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${plexMono.variable}`}>{children}</body>
    </html>
  );
}
