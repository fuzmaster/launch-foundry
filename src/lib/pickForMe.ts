// Round H-3 — "Pick for me" defaults. Given the business type the user
// picked on Project step, return a sensible set of Studio + render
// preferences. Each Studio Card has a small button that calls into here
// and patches just its own slice of state.

import { getBusinessType } from "./businessTypes";
import type { BrandTokens, Motif, Layout } from "./brandExtract";
import type { OutputFormat, QualityPreset } from "./studioScript";

const PALETTES = {
  "#c97a4a": { background: "#1a1410", surface: "#2a1f17", text: "#f5ece1", textSoft: "rgba(245,236,225,0.6)", accent: "#c97a4a", accentSoft: "rgba(201,122,74,0.18)" }, // restaurant
  "#b85c8a": { background: "#1a1018", surface: "#26172a", text: "#f3e9ef", textSoft: "rgba(243,233,239,0.62)", accent: "#b85c8a", accentSoft: "rgba(184,92,138,0.18)" }, // salon
  "#4a8a5c": { background: "#0f1612", surface: "#192319", text: "#e9f0e8", textSoft: "rgba(233,240,232,0.62)", accent: "#4a8a5c", accentSoft: "rgba(74,138,92,0.18)" }, // landscape
  "#d97f3a": { background: "#181210", surface: "#241914", text: "#f3eae0", textSoft: "rgba(243,234,224,0.62)", accent: "#d97f3a", accentSoft: "rgba(217,127,58,0.18)" }, // auto
  "#b8864e": { background: "#14110d", surface: "#1c1814", text: "#f0ebe3", textSoft: "rgba(240,235,227,0.62)", accent: "#b8864e", accentSoft: "rgba(184,134,78,0.18)" }, // realtor / carpentry / fallback
  "#e9a23b": { background: "#18130a", surface: "#241c0f", text: "#f5ecda", textSoft: "rgba(245,236,218,0.62)", accent: "#e9a23b", accentSoft: "rgba(233,162,59,0.18)" }, // artist
  "#3a6bbb": { background: "#0f1320", surface: "#171f30", text: "#e6ecf6", textSoft: "rgba(230,236,246,0.6)",   accent: "#3a6bbb", accentSoft: "rgba(58,107,187,0.18)" }, // consultant
  "#d36b8e": { background: "#1a1014", surface: "#2a1620", text: "#f4e6ec", textSoft: "rgba(244,230,236,0.62)", accent: "#d36b8e", accentSoft: "rgba(211,107,142,0.18)" }, // shop
  "#5c7a4a": { background: "#101410", surface: "#1a201a", text: "#eaf0e3", textSoft: "rgba(234,240,227,0.62)", accent: "#5c7a4a", accentSoft: "rgba(92,122,74,0.18)" }, // teacher
  "#d94a4a": { background: "#180e0e", surface: "#251616", text: "#f4e6e6", textSoft: "rgba(244,230,230,0.62)", accent: "#d94a4a", accentSoft: "rgba(217,74,74,0.18)" }, // trainer
} as const;

const GOOGLE_FONTS_HREF: Record<string, string> = {
  "Playfair Display": "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700;800&display=swap",
  "Roboto Slab":      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto+Slab:wght@500;700;900&display=swap",
  "Fraunces":         "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&display=swap",
  "Inter":            "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
};

export type StudioDefaults = {
  tokens: BrandTokens;
  outputs: OutputFormat[];
  quality: QualityPreset;
  tone: string;
};

export function pickStudioDefaultsFor(businessTypeId: string | null): StudioDefaults {
  const bt = getBusinessType(businessTypeId) ?? getBusinessType("other")!;
  const pal = (PALETTES[bt.accentHint as keyof typeof PALETTES] ?? PALETTES["#b8864e"]);
  const fontDisplay = `'${bt.fontDisplayHint}', Georgia, serif`;
  const fontBody = `'${bt.fontBodyHint}', system-ui, sans-serif`;
  const tokens: BrandTokens = {
    background: pal.background,
    surface: pal.surface,
    text: pal.text,
    textSoft: pal.textSoft,
    accent: pal.accent,
    accentSoft: pal.accentSoft,
    fontDisplay,
    fontBody,
    googleFontsHref: GOOGLE_FONTS_HREF[bt.fontDisplayHint] ?? GOOGLE_FONTS_HREF["Playfair Display"]!,
    motif: bt.motif as Motif,
    layout: bt.layout as Layout,
  };
  return {
    tokens,
    outputs: ["9x16", "1x1"], // sensible default for any small biz
    quality: bt.qualityPreset,
    tone: bt.tone,
  };
}
