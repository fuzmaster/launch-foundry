// Quick brand-token extraction from CSS text. Reads any number of CSS files
// and produces a best-guess BrandTokens object — colors with role assignments,
// font-family declarations, and a suggested motif.

export type BrandTokens = {
  background: string;
  surface: string;
  text: string;
  textSoft: string;
  accent: string;
  accentSoft: string;
  fontDisplay: string;
  fontBody: string;
  googleFontsHref: string;
  motif: Motif;
  layout?: Layout;
};

export type Motif =
  | "graph-paper" | "editorial" | "gradient" | "minimal" | "blueprint" | "mono"
  | "dot-grid"           // softer than graph paper, designer-shop feel
  | "vintage-paper"      // warm grain texture for crafts / restoration
  | "terminal-green"     // CRT phosphor green on near-black
  | "scan-lines";        // horizontal CRT scan-line overlay

/** Scene-structure pattern. Determines the Remotion composition shape. */
export type Layout =
  | "step-walkthrough"   // current: title + N numbered steps + endcard, photo per step
  | "kinetic-text"       // pure typography reel, no images
  | "parallax-hero"      // one hero image, layered zoom/pan, text crawl
  | "quote-card"         // big italic quote + attribution, no image needed
  | "before-after"       // two images split by a diagonal brass wipe
  | "big-number"         // one enormous stat with context, optionally chained
  | "code-reveal"        // typewriter-style code lines + an output line
  | "device-frame";      // a screenshot in iPhone / laptop / browser chrome

export const DEFAULT_TOKENS: BrandTokens = {
  background: "#14110d",
  surface: "#1c1814",
  text: "#f0ebe3",
  textSoft: "rgba(240, 235, 227, 0.65)",
  accent: "#b8864e",
  accentSoft: "rgba(184, 134, 78, 0.18)",
  fontDisplay: "'Playfair Display', Georgia, serif",
  fontBody: "'Inter', system-ui, sans-serif",
  googleFontsHref:
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700;800&display=swap",
  motif: "editorial",
  layout: "step-walkthrough",
};

const HEX_RE = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;
const FONT_FAMILY_RE = /font-family\s*:\s*([^;}\n]+)[;}\n]/gi;

function normalizeHex(h: string): string {
  if (h.length === 4) {
    return "#" + h.slice(1).split("").map(c => c + c).join("").toLowerCase();
  }
  return h.toLowerCase();
}

function luminance(hex: string): number {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function saturation(hex: string): number {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function hexToRgbA(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Pull a small set of well-known Google Fonts CSS family names out of
 * a font-family declaration. Quoted names take precedence.
 */
function extractFontFamily(decl: string): string | null {
  const m = decl.match(/['"]([^'"]+)['"]/);
  if (m) return m[1]!;
  // Bare token before fallback, e.g. "Inter, system-ui" → "Inter"
  const first = decl.split(",")[0]?.trim().replace(/[;}]/g, "");
  if (first && !/^var\(|inherit$|initial$|system-ui$|sans-serif$|serif$|monospace$/i.test(first)) {
    return first;
  }
  return null;
}

const GOOGLE_FONT_SLUGS: Record<string, string> = {
  "Inter": "Inter:wght@400;500;600;700",
  "Roboto Slab": "Roboto+Slab:wght@500;700;900",
  "Roboto Mono": "Roboto+Mono:wght@400;500;700",
  "Roboto": "Roboto:wght@400;500;700",
  "Playfair Display": "Playfair+Display:wght@600;700;800",
  "Fraunces": "Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900",
  "Space Grotesk": "Space+Grotesk:wght@400;500;700",
  "JetBrains Mono": "JetBrains+Mono:wght@400;500;700",
  "IBM Plex Sans": "IBM+Plex+Sans:wght@400;500;600;700",
  "IBM Plex Mono": "IBM+Plex+Mono:wght@400;500;700",
  "Lora": "Lora:wght@400;500;600;700",
  "Source Sans 3": "Source+Sans+3:wght@400;500;700",
  "Source Serif 4": "Source+Serif+4:wght@500;700",
  "EB Garamond": "EB+Garamond:wght@500;700;800",
  "Crimson Pro": "Crimson+Pro:wght@500;700;900",
  "Manrope": "Manrope:wght@400;500;700",
  "Outfit": "Outfit:wght@400;500;700",
  "Work Sans": "Work+Sans:wght@400;500;700",
};

function buildGoogleFontsHref(display: string, body: string): string {
  const families = new Set<string>();
  for (const f of [display, body]) {
    const bare = f.replace(/['"]/g, "").split(",")[0]!.trim();
    if (GOOGLE_FONT_SLUGS[bare]) families.add(GOOGLE_FONT_SLUGS[bare]);
  }
  if (families.size === 0) return DEFAULT_TOKENS.googleFontsHref;
  return `https://fonts.googleapis.com/css2?family=${[...families].join("&family=")}&display=swap`;
}

/**
 * Given a bunch of concatenated CSS, extract role-assigned brand tokens.
 */
export function extractBrandTokens(cssTexts: string[]): BrandTokens {
  const combined = cssTexts.join("\n");

  // ── Colors ───────────────────────────────────────────────
  const matches = combined.match(HEX_RE) ?? [];
  const counts = new Map<string, number>();
  for (const raw of matches) {
    const norm = normalizeHex(raw);
    counts.set(norm, (counts.get(norm) ?? 0) + 1);
  }
  // Sort by count desc; if tie, by "prominence" (saturation × abs(luminance - 0.5))
  const ranked = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return saturation(b[0]) - saturation(a[0]);
  }).map(([hex]) => hex);

  // Heuristic role assignment.
  // 1. Background: most-used color closest to grayscale and either very light or very dark
  //    AND repeated more than once.
  const backgroundCandidate =
    ranked.find(h => saturation(h) < 0.25 && (luminance(h) > 0.85 || luminance(h) < 0.2))
    ?? ranked[0]
    ?? DEFAULT_TOKENS.background;
  const bgLum = luminance(backgroundCandidate);
  const isDark = bgLum < 0.5;

  // 2. Text: a near-mono color with opposite luminance to bg.
  const textCandidate =
    ranked.find(h => h !== backgroundCandidate && saturation(h) < 0.25 && (isDark ? luminance(h) > 0.7 : luminance(h) < 0.3))
    ?? (isDark ? "#f5f5f5" : "#111111");

  // 3. Accent: the most-saturated color that's neither bg nor text.
  const accentCandidate =
    ranked.find(h => h !== backgroundCandidate && h !== textCandidate && saturation(h) > 0.35)
    ?? ranked.find(h => h !== backgroundCandidate && h !== textCandidate)
    ?? DEFAULT_TOKENS.accent;

  // 4. Surface: slight shift from background toward text.
  const surface = shiftToward(backgroundCandidate, textCandidate, 0.08);

  // ── Fonts ────────────────────────────────────────────────
  const fontDecls = [...combined.matchAll(FONT_FAMILY_RE)].map(m => m[1]!);
  const families = fontDecls
    .map(extractFontFamily)
    .filter((f): f is string => !!f)
    // dedupe while preserving order
    .filter((f, i, arr) => arr.indexOf(f) === i);
  // Heuristic: serif/slab/display fonts are "display", sans/mono are "body".
  const looksDisplay = (f: string) => /serif|slab|playfair|fraunces|garamond|lora|crimson|tiempos|merriweather/i.test(f);
  const display = families.find(looksDisplay) ?? families[0] ?? "Playfair Display";
  const body = families.find(f => f !== display && !looksDisplay(f)) ?? families.find(f => f !== display) ?? "Inter";

  const fontDisplay = `'${display}', Georgia, serif`;
  const fontBody = `'${body}', system-ui, sans-serif`;
  const googleFontsHref = buildGoogleFontsHref(display, body);

  // ── Motif ────────────────────────────────────────────────
  // Light-bg + slab serif → graph-paper (engineering notebook feel)
  // Dark-bg + serif → editorial
  // Bright-saturated accent + light bg → gradient
  // Mono fonts → mono
  const motif: Motif =
    /mono/i.test(display) || /mono/i.test(body) ? "mono"
    : isDark ? "editorial"
    : /slab|fraunces|garamond/i.test(display) ? "graph-paper"
    : saturation(accentCandidate) > 0.5 ? "gradient"
    : "minimal";

  return {
    background: backgroundCandidate,
    surface,
    text: textCandidate,
    textSoft: hexToRgbA(textCandidate, isDark ? 0.65 : 0.55),
    accent: accentCandidate,
    accentSoft: hexToRgbA(accentCandidate, 0.18),
    fontDisplay,
    fontBody,
    googleFontsHref,
    motif,
  };
}

// Linearly interpolate two hex colors by t (0–1).
function shiftToward(a: string, b: string, t: number): string {
  const ax = parseHex(a);
  const bx = parseHex(b);
  const r = Math.round(ax.r + (bx.r - ax.r) * t);
  const g = Math.round(ax.g + (bx.g - ax.g) * t);
  const bb = Math.round(ax.b + (bx.b - ax.b) * t);
  return `#${[r, g, bb].map(n => n.toString(16).padStart(2, "0")).join("")}`;
}
function parseHex(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace("#", "");
  return {
    r: parseInt(m.slice(0, 2), 16),
    g: parseInt(m.slice(2, 4), 16),
    b: parseInt(m.slice(4, 6), 16),
  };
}
