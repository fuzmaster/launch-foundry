// Round H-2 — Business-type picker source of truth. Each entry maps a
// boomer-friendly business category to the design + content choices the
// Studio + Platforms steps would otherwise ask the user to make. The
// "Pick for me" buttons in H-3 read this table.

import type { Motif, Layout } from "./brandExtract";
import type { Platform } from "./scheduleExport";

export type BusinessType = {
  id: string;
  emoji: string;
  label: string;
  /** Visual style hint shown on the picker card. */
  vibe: string;
  /** Reels Studio defaults — H-3 "Pick for me" reads these. */
  motif: Motif;
  layout: Layout;
  /** Brand-token hints. accent is the dominant brand color suggestion. */
  accentHint: string;
  fontDisplayHint: string;
  fontBodyHint: string;
  /** Round B render preset suggestion. */
  qualityPreset: "draft" | "standard" | "final";
  /** Round G platform recommendations. */
  topPlatforms: Platform[];
  /** Tone hint that goes into prompts. */
  tone: string;
};

export const BUSINESS_TYPES: BusinessType[] = [
  { id: "restaurant", emoji: "🍴", label: "Restaurant or food", vibe: "Warm, mouth-watering, family",
    motif: "vintage-paper", layout: "step-walkthrough", accentHint: "#c97a4a",
    fontDisplayHint: "Playfair Display", fontBodyHint: "Inter", qualityPreset: "standard",
    topPlatforms: ["instagram", "tiktok", "facebook"],
    tone: "warm + appetizing + local + community-friendly" },

  { id: "salon", emoji: "✂️", label: "Salon or barber", vibe: "Stylish, before/after, fresh",
    motif: "minimal", layout: "before-after", accentHint: "#b85c8a",
    fontDisplayHint: "Playfair Display", fontBodyHint: "Inter", qualityPreset: "final",
    topPlatforms: ["instagram", "tiktok", "facebook"],
    tone: "polished + aspirational + confident + sleek" },

  { id: "landscape", emoji: "🏡", label: "Landscaping or lawn care", vibe: "Outdoorsy, before/after, satisfying",
    motif: "graph-paper", layout: "before-after", accentHint: "#4a8a5c",
    fontDisplayHint: "Roboto Slab", fontBodyHint: "Inter", qualityPreset: "standard",
    topPlatforms: ["facebook", "instagram", "tiktok"],
    tone: "honest + reliable + outdoor + local-pride" },

  { id: "auto", emoji: "🔧", label: "Auto shop or mechanic", vibe: "Tough, capable, no-nonsense",
    motif: "mono", layout: "step-walkthrough", accentHint: "#d97f3a",
    fontDisplayHint: "Roboto Slab", fontBodyHint: "Inter", qualityPreset: "standard",
    topPlatforms: ["facebook", "instagram"],
    tone: "no-nonsense + dependable + clear pricing + local" },

  { id: "realtor", emoji: "🏘️", label: "Realtor or real estate", vibe: "Premium, lifestyle, aspirational",
    motif: "editorial", layout: "parallax-hero", accentHint: "#b8864e",
    fontDisplayHint: "Playfair Display", fontBodyHint: "Inter", qualityPreset: "final",
    topPlatforms: ["instagram", "facebook", "linkedin"],
    tone: "aspirational + trustworthy + neighborhood expert" },

  { id: "carpentry", emoji: "🪵", label: "Carpentry or trades", vibe: "Warm craft, brass + walnut",
    motif: "editorial", layout: "step-walkthrough", accentHint: "#b8864e",
    fontDisplayHint: "Playfair Display", fontBodyHint: "Inter", qualityPreset: "final",
    topPlatforms: ["instagram", "facebook", "pinterest"],
    tone: "craftsmanship + heritage + warm + understated" },

  { id: "artist", emoji: "🎨", label: "Artist or maker", vibe: "Showcase, color-forward, distinctive",
    motif: "gradient", layout: "parallax-hero", accentHint: "#e9a23b",
    fontDisplayHint: "Fraunces", fontBodyHint: "Inter", qualityPreset: "final",
    topPlatforms: ["instagram", "pinterest", "tiktok"],
    tone: "creative + bold + portfolio-driven + maker-honest" },

  { id: "consultant", emoji: "💼", label: "Consultant or coach", vibe: "Clean, authoritative, results",
    motif: "minimal", layout: "big-number", accentHint: "#3a6bbb",
    fontDisplayHint: "Inter", fontBodyHint: "Inter", qualityPreset: "standard",
    topPlatforms: ["linkedin", "instagram", "x"],
    tone: "expertise + outcomes + measured + B2B-credible" },

  { id: "shop", emoji: "🛍️", label: "Online shop or product", vibe: "Polished, product-led, vibrant",
    motif: "gradient", layout: "device-frame", accentHint: "#d36b8e",
    fontDisplayHint: "Inter", fontBodyHint: "Inter", qualityPreset: "final",
    topPlatforms: ["instagram", "tiktok", "facebook"],
    tone: "polished + product-led + giftable + lifestyle" },

  { id: "teacher", emoji: "📚", label: "Teacher or course",  vibe: "Friendly, explanatory, supportive",
    motif: "dot-grid", layout: "kinetic-text", accentHint: "#5c7a4a",
    fontDisplayHint: "Fraunces", fontBodyHint: "Inter", qualityPreset: "standard",
    topPlatforms: ["instagram", "youtube", "linkedin"],
    tone: "patient + clear + encouraging + outcome-focused" },

  { id: "trainer", emoji: "💪", label: "Trainer or fitness", vibe: "Energy, motivation, transformation",
    motif: "scan-lines", layout: "before-after", accentHint: "#d94a4a",
    fontDisplayHint: "Roboto Slab", fontBodyHint: "Inter", qualityPreset: "final",
    topPlatforms: ["instagram", "tiktok", "youtube"],
    tone: "energetic + motivating + transformation-focused" },

  { id: "other", emoji: "➕", label: "Something else", vibe: "Pick anything that feels right",
    motif: "editorial", layout: "step-walkthrough", accentHint: "#b8864e",
    fontDisplayHint: "Playfair Display", fontBodyHint: "Inter", qualityPreset: "standard",
    topPlatforms: ["instagram", "facebook"],
    tone: "professional + clear + welcoming" },
];

export function getBusinessType(id: string | null): BusinessType | null {
  if (!id) return null;
  return BUSINESS_TYPES.find(b => b.id === id) ?? null;
}
