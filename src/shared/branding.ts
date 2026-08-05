/**
 * Runtime branding helpers (SDS Doc 03 Ch2/9). The brand colors are fixed
 * product constants (no longer administrator-configurable): they propagate
 * across the application by overriding the design-token CSS variables - layout,
 * spacing and typography are never affected.
 */

/** Fixed brand colors. Applied everywhere (app shell, emails, generated PDFs). */
export const BRAND_PRIMARY = "#232323";
export const BRAND_SECONDARY = "#121212";

/** Convert a #rrggbb hex color to the "H S% L%" triple used by the tokens. */
export function hexToHslTriple(hex: string): string | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1]!, 16);
  const r = ((value >> 16) & 0xff) / 255;
  const g = ((value >> 8) & 0xff) / 255;
  const b = (value & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;
  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    else if (max === g) hue = ((b - r) / delta + 2) / 6;
    else hue = ((r - g) / delta + 4) / 6;
  }
  return `${Math.round(hue * 360)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

/** Raise the lightness of an "H S% L%" triple, clamped to legal values. */
function lighten(triple: string, byPercent: number): string {
  const [hue, saturation, lightness] = triple.split(" ");
  const value = Math.min(100, Number.parseInt(lightness ?? "0", 10) + byPercent);
  return `${hue} ${saturation} ${value}%`;
}

export interface BrandingConfig {
  systemName?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

/**
 * CSS-variable overrides applied to the app shell for the fixed brand colors.
 * The argument is accepted for backwards compatibility but the colors are now
 * product constants, so stored/legacy values never change the theme.
 */
export function brandingStyle(_branding?: BrandingConfig): Record<string, string> {
  const style: Record<string, string> = {};
  const primary = hexToHslTriple(BRAND_PRIMARY);
  const secondary = hexToHslTriple(BRAND_SECONDARY);
  if (primary) {
    style["--primary"] = primary;
    style["--ring"] = primary;
  }
  if (secondary) {
    style["--secondary"] = secondary;
    // The navigation rail has always been painted by the configured secondary
    // color, so it keeps following it. Its border and active surface are
    // derived a few steps lighter than the ground rather than being separate
    // settings, which is what an administrator would have to reason about.
    style["--rail"] = secondary;
    style["--rail-border"] = lighten(secondary, 9);
    style["--rail-active"] = lighten(secondary, 7);
  }
  return style;
}
