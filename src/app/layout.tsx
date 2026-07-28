import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Condensed, IBM_Plex_Mono } from "next/font/google";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { brandingStyle, type BrandingConfig } from "@/shared/branding";
import "./globals.css";

/*
 * Three type roles, one superfamily, so the console reads as a single
 * instrument: condensed for display, sans for the interface, mono for the
 * register (asset tags, request numbers, employee IDs). Self-hosted by
 * next/font at build time, so no request ever leaves the deployment.
 */
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const condensed = IBM_Plex_Sans_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Axivo",
    template: "%s · Axivo",
  },
  description: "Axivo: self-hosted IT operations platform.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Brand colors override the design tokens at the body level so every surface
  // - including dialogs rendered through portals - picks them up (Doc 03 Ch2).
  let branding: BrandingConfig = {};
  try {
    branding = await getSetting<BrandingConfig>(SETTING_KEYS.BRANDING);
  } catch {
    // Database unavailable (e.g. first boot): fall back to default tokens.
  }
  return (
    <html lang="en" className={`${sans.variable} ${condensed.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans" style={brandingStyle(branding) as React.CSSProperties}>
        {children}
      </body>
    </html>
  );
}
