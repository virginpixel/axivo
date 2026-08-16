import type { Metadata } from "next";
import { Figtree, Caprasimo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/*
 * Type roles: Figtree for the interface, Caprasimo (a display serif) for
 * headings, mono for the register (asset tags, request numbers, employee IDs).
 * Self-hosted by next/font at build time, so no request ever leaves the
 * deployment.
 */
const sans = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const display = Caprasimo({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-display",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

/*
 * Set the theme class before first paint so there is no light/dark flash. The
 * stored preference is "light" | "dark" | "system"; "system" follows the OS.
 */
const themeScript = `(function(){try{var t=localStorage.getItem('axivo-theme')||'system';var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export const metadata: Metadata = {
  title: {
    default: "Axivo",
    template: "%s · Axivo",
  },
  description: "Axivo: self-hosted IT operations platform.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
