// Round G · platform-pack generators. Three pieces:
//   1. buildRecommendationPrompt — Claude/GPT brief: "given this brand + audience,
//      rank top 3-5 platforms with rationale + audience match"
//   2. composePostForPlatform — sizes a concept's caption + hashtags + CTA to
//      a specific platform's character limits and tone
//   3. buildSetupBrief — for platforms the user doesn't have a profile on,
//      generates a manual setup checklist (bio + avatar spec + link-in-bio
//      strategy + audience tags) sized to that platform's profile fields.
//
// All three are PROMPT GENERATORS — they emit text the user pastes into
// Claude/GPT and gets back JSON to import. No API keys, same paste-out
// /paste-back pattern as the rest of LF.

import type { BrandTokens } from "./brandExtract";
import { PLATFORM_LABEL, type Platform } from "./scheduleExport";

/** Per-platform spec: hard limits + style hints + bio length. */
export const PLATFORM_SPEC: Record<Platform, {
  captionLimit: number;
  hashtagSweetSpot: { min: number; max: number };
  tone: string;
  bioLimit: number;
  profilePicSize: string;
  linkInBio: boolean;
  primaryDemo: string;
}> = {
  instagram: { captionLimit: 2200, hashtagSweetSpot: { min: 5, max: 12 }, tone: "warm + aspirational + lifestyle", bioLimit: 150, profilePicSize: "320×320 (square)", linkInBio: true,  primaryDemo: "25-44, lifestyle + design + craft" },
  tiktok:    { captionLimit: 2200, hashtagSweetSpot: { min: 3, max: 5  }, tone: "energetic + native + earnest",   bioLimit: 80,  profilePicSize: "200×200 (square)", linkInBio: true,  primaryDemo: "18-34, discovery + entertainment" },
  youtube:   { captionLimit: 5000, hashtagSweetSpot: { min: 3, max: 8  }, tone: "explanatory + educational",       bioLimit: 1000, profilePicSize: "800×800 (square)", linkInBio: true,  primaryDemo: "18-49, search + utility" },
  linkedin:  { captionLimit: 3000, hashtagSweetSpot: { min: 3, max: 5  }, tone: "expertise + craft + business",   bioLimit: 220, profilePicSize: "400×400 (square)", linkInBio: false, primaryDemo: "25-54, professional + B2B" },
  x:         { captionLimit: 280,  hashtagSweetSpot: { min: 1, max: 2  }, tone: "punchy + opinionated",            bioLimit: 160, profilePicSize: "400×400 (square)", linkInBio: false, primaryDemo: "25-54, news + opinion" },
  facebook:  { captionLimit: 63206, hashtagSweetSpot: { min: 1, max: 3 }, tone: "story + community",               bioLimit: 101, profilePicSize: "180×180 (square)", linkInBio: false, primaryDemo: "35-65, local + family + community" },
  pinterest: { captionLimit: 500,  hashtagSweetSpot: { min: 4, max: 8  }, tone: "inspirational + actionable",      bioLimit: 160, profilePicSize: "165×165 (square)", linkInBio: false, primaryDemo: "25-54, planning + inspiration" },
};

// ─── 1. Recommendation prompt ───────────────────────────────────────────────

export function buildRecommendationPrompt(args: {
  brandSummary: string;
  audienceHint: string;
  productType: string;
  geo?: string;
}): string {
  const { brandSummary, audienceHint, productType, geo } = args;
  return [
    `# Platform recommendation`,
    ``,
    `You're a social-media strategist. Given the brand below, rank the top 3 to 5 platforms by expected return for this specific brand, and explain the *audience match* in one sentence per pick.`,
    ``,
    `## Brand`,
    brandSummary,
    ``,
    `## Audience hint`,
    audienceHint,
    ``,
    `## Product type`,
    productType,
    ``,
    geo ? `## Geo focus\n${geo}\n` : ``,
    `## Return strictly this JSON shape`,
    "```json",
    `{`,
    `  "recommended": [`,
    `    {`,
    `      "platform": "instagram|tiktok|youtube|linkedin|x|facebook|pinterest",`,
    `      "rank": 1,`,
    `      "audienceMatch": "one-sentence why this brand's audience is here",`,
    `      "contentBias": "what content format dominates here for this niche",`,
    `      "expectedReach": "low | medium | high",`,
    `      "effortToProduce": "low | medium | high"`,
    `    }`,
    `  ],`,
    `  "skipReasons": [`,
    `    { "platform": "platform-name", "reason": "one-sentence why this is NOT a top pick for this brand" }`,
    `  ]`,
    `}`,
    "```",
    ``,
    `Cap "recommended" at 5 entries and "skipReasons" at 3 — no preamble, just the JSON.`,
  ].filter(Boolean).join("\n");
}

export type PlatformRecommendation = {
  platform: Platform;
  rank: number;
  audienceMatch: string;
  contentBias: string;
  expectedReach: "low" | "medium" | "high";
  effortToProduce: "low" | "medium" | "high";
};

export type PlatformRecommendationResult = {
  recommended: PlatformRecommendation[];
  skipReasons: { platform: string; reason: string }[];
};

/** Lenient parser: accepts the JSON shape above OR raw JSON in a fenced block. */
export function parseRecommendation(text: string): PlatformRecommendationResult | null {
  const fenced = text.match(/```json\s*([\s\S]+?)```/i);
  const raw = fenced ? fenced[1]! : text;
  try {
    const obj = JSON.parse(raw.trim());
    if (!obj || !Array.isArray(obj.recommended)) return null;
    return {
      recommended: obj.recommended.filter((r: { platform?: string }) => typeof r?.platform === "string"),
      skipReasons: Array.isArray(obj.skipReasons) ? obj.skipReasons : [],
    };
  } catch {
    return null;
  }
}

// ─── 2. Per-platform composer ──────────────────────────────────────────────

export function composePostForPlatform(args: {
  platform: Platform;
  conceptTitle: string;
  conceptHook: string;
  cta: string;
  url?: string;
  brandTokens: BrandTokens;
  rawCaption?: string;
}): { caption: string; hashtags: string[]; truncated: boolean } {
  const { platform, conceptTitle, conceptHook, cta, url, brandTokens, rawCaption } = args;
  const spec = PLATFORM_SPEC[platform];

  // Build base caption from concept; user can edit after import.
  const base = rawCaption?.trim().length
    ? rawCaption.trim()
    : platform === "x"
      ? `${conceptHook} — ${cta}` // short-form
      : `${conceptTitle}\n\n${conceptHook}\n\n${cta}${url ? `\n${url}` : ""}`;

  // Hashtags from brand + concept keywords. Cheap heuristic: words ≥5 chars
  // from concept title/hook + brand motif.
  const keywords = [conceptTitle, conceptHook].join(" ").toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 5)
    .filter((w, i, arr) => arr.indexOf(w) === i)
    .slice(0, spec.hashtagSweetSpot.max);
  // Always include a brand-anchor tag.
  const brandTag = brandTokens.motif.replace(/-/g, "");
  const hashtags = [...keywords, brandTag].slice(0, spec.hashtagSweetSpot.max).map(w => `#${w}`);

  // Concat hashtags into caption only for platforms where that's conventional.
  const hashtagLine = (platform === "x" || platform === "linkedin")
    ? ` ${hashtags.slice(0, spec.hashtagSweetSpot.min).join(" ")}`
    : `\n\n${hashtags.join(" ")}`;

  let caption = base + hashtagLine;
  const truncated = caption.length > spec.captionLimit;
  if (truncated) caption = caption.slice(0, spec.captionLimit - 1) + "…";
  return { caption, hashtags, truncated };
}

// ─── 3. Profile setup brief ────────────────────────────────────────────────

export function buildSetupBrief(args: {
  platform: Platform;
  brandSummary: string;
  audienceHint: string;
  productType: string;
  homepageUrl?: string;
}): string {
  const { platform, brandSummary, audienceHint, productType, homepageUrl } = args;
  const spec = PLATFORM_SPEC[platform];
  return [
    `# ${PLATFORM_LABEL[platform]} profile setup brief`,
    ``,
    `Generate a complete setup checklist for a new ${PLATFORM_LABEL[platform]} account. Sizes already pulled from spec:`,
    ``,
    `- **Bio** — max ${spec.bioLimit} chars · tone: ${spec.tone}`,
    `- **Profile picture** — ${spec.profilePicSize}`,
    `- **Link** — ${spec.linkInBio ? "link in bio (use a Linktree-style aggregator if multiple URLs needed)" : "no link field — drop the URL into the bio text"}`,
    `- **Primary demo on this platform** — ${spec.primaryDemo}`,
    ``,
    `## Brand`,
    brandSummary,
    ``,
    `## Audience hint`,
    audienceHint,
    ``,
    `## Product type`,
    productType,
    ``,
    homepageUrl ? `## Homepage\n${homepageUrl}\n` : ``,
    `## Return strictly this JSON shape`,
    "```json",
    `{`,
    `  "bio": "<= ${spec.bioLimit} chars, ${spec.tone} tone, includes one CTA",`,
    `  "username": "lowercase, no underscores if avoidable, hint at the brand name",`,
    `  "displayName": "the brand name as it should appear on the platform",`,
    `  "profilePicConcept": "what the avatar should depict — single sentence",`,
    `  "headerOrCover": "what the header image should depict (skip if platform has no header)",`,
    `  "primaryAudienceTags": ["3 to 8 audience keywords/personas worth targeting"],`,
    `  "firstFiveFollows": ["adjacent accounts worth following on day 1"],`,
    `  "linkInBioStrategy": "what link to point to + why",`,
    `  "firstThreePosts": [`,
    `    { "format": "what content type", "purpose": "intro / proof / cta", "caption": "draft caption" }`,
    `  ]`,
    `}`,
    "```",
    ``,
    `No preamble — just the JSON.`,
  ].filter(Boolean).join("\n");
}

export type SetupBriefResult = {
  bio: string;
  username: string;
  displayName: string;
  profilePicConcept: string;
  headerOrCover?: string;
  primaryAudienceTags: string[];
  firstFiveFollows: string[];
  linkInBioStrategy: string;
  firstThreePosts: { format: string; purpose: string; caption: string }[];
};

export function parseSetupBrief(text: string): SetupBriefResult | null {
  const fenced = text.match(/```json\s*([\s\S]+?)```/i);
  const raw = fenced ? fenced[1]! : text;
  try {
    const obj = JSON.parse(raw.trim());
    if (!obj || typeof obj.bio !== "string") return null;
    return obj as SetupBriefResult;
  } catch {
    return null;
  }
}
