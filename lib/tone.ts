/**
 * Resolving the design system's status colours for contexts that cannot use CSS.
 *
 * The five lifecycle tones are defined once, as `oklch()` custom properties in
 * `app/globals.css`, because that is the only place they need to be for the
 * DOM. MapLibre, however, paints in JavaScript and cannot read a custom
 * property — so the map would either need a second copy of the palette (which
 * is exactly the drift this codebase avoids everywhere else) or a conversion.
 *
 * This module is the conversion. It reads the live computed values, so if a
 * token is retuned the map follows automatically, and it handles the dark
 * theme for free because the computed value changes with the theme.
 */

/** A tone's resolved colour, as `#rrggbb`. */
export type ToneHex = `#${string}`;

/**
 * OKLCH → sRGB hex.
 *
 * The CSS Color 4 conversion, done by hand because there is no synchronous
 * browser API for it: `getComputedStyle` returns the `oklch()` text rather than
 * a serialised RGB value, and the canvas trick returns `color(srgb …)`, which
 * is not what MapLibre's parser wants.
 *
 * Out-of-gamut results are clamped per channel rather than gamut-mapped. That is
 * a deliberate simplification: the five tones in this palette are authored to sit
 * in sRGB, so the clamp only ever engages on a token someone has deliberately
 * pushed out of gamut, and a clamped near-miss is a better failure than a
 * silently wrong hue.
 */
export function oklchToHex(input: string): ToneHex | null {
  const match =
    /^oklch\(\s*([+-]?[\d.]+%?)\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)(?:deg)?\s*(?:\/\s*([+-]?[\d.]+%?)\s*)?\)$/i.exec(
      input.trim(),
    );
  if (!match) return null;

  const [, rawL, rawC, rawH, rawAlpha] = match;

  const L = rawL.endsWith("%") ? parseFloat(rawL) / 100 : parseFloat(rawL);
  const C = parseFloat(rawC);
  const H = (parseFloat(rawH) * Math.PI) / 180;
  const alpha = rawAlpha
    ? rawAlpha.endsWith("%")
      ? parseFloat(rawAlpha) / 100
      : parseFloat(rawAlpha)
    : 1;

  if (![L, C, H, alpha].every(Number.isFinite)) return null;

  // OKLCH → OKLab
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);

  // OKLab → LMS cone responses, then the non-linearity.
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS → linear sRGB
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  // Linear → sRGB gamma
  const encode = (c: number) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  };

  const hex = [encode(lr), encode(lg), encode(lb)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");

  return `#${hex}` as ToneHex;
}

/**
 * Last-resort palette, matching `app/globals.css` in the light theme.
 *
 * Only reached if the CSS has not loaded, or a token has been retuned into a
 * syntax this parser does not recognise. Rendering a slightly stale colour is
 * better than rendering no map.
 */
export const FALLBACK_TONE_HEX: Record<string, ToneHex> = {
  "status-broken": "#c4402b",
  "status-confirmed": "#c47a1f",
  "status-active": "#3a68c4",
  "status-inspection": "#8b46c4",
  "status-resolved": "#21925c",
};

/**
 * Reads the live `--status-*` tokens off the document root.
 *
 * Reads the root element rather than a rendered component so the palette is
 * available before any case has loaded, and so a `dark` class toggled anywhere
 * in the tree is picked up without this module knowing about themes.
 *
 * Must be called in the browser: it touches `document` and `getComputedStyle`.
 */
export function readToneHex(): Record<string, ToneHex> {
  const resolved: Record<string, ToneHex> = { ...FALLBACK_TONE_HEX };
  if (typeof document === "undefined") return resolved;

  const styles = getComputedStyle(document.documentElement);
  for (const name of Object.keys(FALLBACK_TONE_HEX)) {
    const raw = styles.getPropertyValue(`--${name}`).trim();
    if (!raw) continue;
    const hex = oklchToHex(raw);
    if (hex) resolved[name] = hex;
  }
  return resolved;
}

/** Reads one tone by its CSS token name, e.g. `status-broken`. */
export function toneToken(tone: string): string {
  return `status-${tone}`;
}
