// Round H-12 — URL-as-project source. The browser can't crawl arbitrary
// sites (CORS), so the simplest no-API-keys flow is: user pastes the URL,
// LF builds a mega-prompt that tells Claude/GPT to go look at the URL and
// return the same JSON shape an intake scan would produce. Pasted JSON
// flows through the normal Research → Concepts pipeline.

import type { Platform } from "./scheduleExport";

export function buildUrlIntakePrompt(args: {
  url: string;
  businessTypeHint?: string;
  platformHint?: Platform | "tbd";
}): string {
  const { url, businessTypeHint, platformHint } = args;
  return [
    `# LaunchFoundry URL intake`,
    ``,
    `Visit this website and return a JSON object describing the business as if I'd run an intake scan against the project's source files. Skip narration — just the JSON.`,
    ``,
    `## Website to research`,
    `${url}`,
    ``,
    businessTypeHint ? `## Business-type hint (from the user)\n${businessTypeHint}\n` : ``,
    platformHint ? `## Marketing platform target\n${platformHint}\n` : ``,
    `## Return strictly this JSON shape`,
    "```json",
    `{`,
    `  "brand": {`,
    `    "businessName": "...",`,
    `    "websiteUrl": "${url}",`,
    `    "category": "what kind of business this is",`,
    `    "oneLiner": "one sentence describing what they do",`,
    `    "offerSummary": "what the actual offer / service / product is",`,
    `    "targetCustomer": "who the customer is",`,
    `    "tone": "how they talk — formal, warm, energetic, etc.",`,
    `    "colors": ["#hex", "#hex"],`,
    `    "fonts": ["FontName1", "FontName2"],`,
    `    "proofPoints": ["specific claims they make", "..."],`,
    `    "differentiators": ["what makes them stand out", "..."],`,
    `    "avoidClaims": ["claims they should NOT make in ads", "..."],`,
    `    "cta": "the primary call-to-action they want from a visitor"`,
    `  },`,
    `  "concepts": [`,
    `    {`,
    `      "id": "concept-1",`,
    `      "title": "Concept name",`,
    `      "platform": "${platformHint ?? "facebook"}",`,
    `      "targetAudience": "specific audience for this concept",`,
    `      "angle": "the story angle / hook",`,
    `      "hook": "first 1-2s opening line",`,
    `      "promise": "what the viewer gets if they click",`,
    `      "format": "reel|carousel|single-image|video",`,
    `      "durationSeconds": 30,`,
    `      "scenes": [`,
    `        { "id": "s1", "startSecond": 0, "endSecond": 3, "visual": "...", "assetIds": [], "textOverlay": "...", "voiceover": "..." }`,
    `      ],`,
    `      "recommendedAssets": ["filenames you'd want — e.g. logo.png, hero.jpg"],`,
    `      "missingAssets": [],`,
    `      "caption": "the post caption",`,
    `      "cta": "click-through CTA",`,
    `      "score": { "audienceFit": 4, "platformFit": 4, "assetFit": 3, "clarity": 4, "effort": 3, "total": 18, "reason": "why this score" }`,
    `    }`,
    `  ]`,
    `}`,
    "```",
    ``,
    `Generate 3 concept entries. No preamble, just the JSON.`,
  ].filter(Boolean).join("\n");
}

/** Normalize a user-pasted URL — strip whitespace, prefix https:// if no scheme. */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Cheap sniff that the input looks like a URL (used to enable the Send button). */
export function looksLikeUrl(input: string): boolean {
  const normalized = normalizeUrl(input);
  try {
    const u = new URL(normalized);
    return !!u.host && u.host.includes(".");
  } catch {
    return false;
  }
}
