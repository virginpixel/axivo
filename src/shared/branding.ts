/**
 * Runtime branding helpers (SDS Doc 03 Ch2/9): configured brand colors
 * propagate across the application by overriding the design-token CSS
 * variables — layout, spacing and typography are never affected.
 */

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

export interface BrandingConfig {
  systemName?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

/** CSS-variable overrides applied to the app shell for configured brand colors. */
export function brandingStyle(branding: BrandingConfig): Record<string, string> {
  const style: Record<string, string> = {};
  const primary = branding.primaryColor ? hexToHslTriple(branding.primaryColor) : null;
  const secondary = branding.secondaryColor ? hexToHslTriple(branding.secondaryColor) : null;
  if (primary) {
    style["--primary"] = primary;
    style["--ring"] = primary;
  }
  if (secondary) {
    style["--secondary"] = secondary;
  }
  return style;
}
