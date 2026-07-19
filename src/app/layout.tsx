import type { Metadata } from "next";
import { getSetting, SETTING_KEYS } from "@/shared/settings/settings";
import { brandingStyle, type BrandingConfig } from "@/shared/branding";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Axivo",
    template: "%s · Axivo",
  },
  description: "Axivo — self-hosted IT operations platform.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Brand colors override the design tokens at the body level so every surface
  // — including dialogs rendered through portals — picks them up (Doc 03 Ch2).
  let branding: BrandingConfig = {};
  try {
    branding = await getSetting<BrandingConfig>(SETTING_KEYS.BRANDING);
  } catch {
    // Database unavailable (e.g. first boot): fall back to default tokens.
  }
  return (
    <html lang="en">
      <body className="min-h-screen font-sans" style={brandingStyle(branding) as React.CSSProperties}>
        {children}
      </body>
    </html>
  );
}
