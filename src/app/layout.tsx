import type { Metadata, Viewport } from "next";
import { PwaProvider } from "@/components/pwa/PwaProvider";
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
  title: "Elbaraka Epices | Store orders",
  description: "Browse products and place orders with Elbaraka Epices.",
  applicationName: "Elbaraka",
  appleWebApp: { capable: true, title: "Elbaraka", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1f6041" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1f17" },
  ],
};

const themeScript = `try{var t=localStorage.getItem('elbaraka-theme-v1');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${manrope.variable} ${plexMono.variable}`}>{children}<PwaProvider /></body>
    </html>
  );
}
