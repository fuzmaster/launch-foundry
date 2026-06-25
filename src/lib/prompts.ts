import brandReader from "../../prompts/01_brand_reader.md?raw";
import assetScanner from "../../prompts/02_asset_scanner.md?raw";
import audienceStrategy from "../../prompts/03_audience_strategy.md?raw";
import platformFacebook from "../../prompts/04_platform_strategy_facebook.md?raw";
import campaignConcepts from "../../prompts/05_campaign_concept_generator.md?raw";
import storyboard from "../../prompts/06_storyboard_writer.md?raw";
import renderSpecWriter from "../../prompts/07_render_spec_writer.md?raw";
import publishingPackWriter from "../../prompts/08_publishing_pack_writer.md?raw";
import qaChecker from "../../prompts/09_qa_checker.md?raw";

import type { BrandProfile, CampaignConcept, CampaignPrompt, Platform, ProjectAsset } from "../types";

export type PromptId =
  | "brand_reader"
  | "asset_scanner"
  | "audience_strategy"
  | "platform_strategy"
  | "campaign_concepts"
  | "storyboard"
  | "render_spec"
  | "publishing_pack"
  | "qa_checker";

export type PromptDefinition = {
  id: PromptId;
  label: string;
  step: number;
  body: string;
  uses: ReadonlyArray<"brand" | "prompt" | "assets" | "concept" | "platform">;
};

export const PROMPTS: ReadonlyArray<PromptDefinition> = [
  { id: "brand_reader",       step: 1, label: "Brand Reader",          body: brandReader,           uses: ["prompt", "brand", "assets"] },
  { id: "asset_scanner",      step: 2, label: "Asset Scanner",         body: assetScanner,          uses: ["brand", "assets", "platform"] },
  { id: "audience_strategy",  step: 3, label: "Audience Strategist",   body: audienceStrategy,      uses: ["prompt", "brand", "platform"] },
  { id: "platform_strategy",  step: 4, label: "Platform Strategist",   body: platformFacebook,      uses: ["prompt", "brand", "platform"] },
  { id: "campaign_concepts",  step: 5, label: "Campaign Concepts",     body: campaignConcepts,      uses: ["prompt", "brand", "assets", "platform"] },
  { id: "storyboard",         step: 6, label: "Storyboard Writer",     body: storyboard,            uses: ["concept", "brand", "assets", "platform"] },
  { id: "render_spec",        step: 7, label: "Render Spec Writer",    body: renderSpecWriter,      uses: ["concept", "brand", "assets", "platform"] },
  { id: "publishing_pack",    step: 8, label: "Publishing Pack Writer", body: publishingPackWriter, uses: ["concept", "brand", "platform"] },
  { id: "qa_checker",         step: 9, label: "QA Checker",            body: qaChecker,             uses: ["concept", "brand", "assets", "platform"] },
];

export type PromptContext = {
  brand: BrandProfile;
  prompt: CampaignPrompt;
  assets: ProjectAsset[];
  concept: CampaignConcept;
  platform: Platform;
};

const platformLabel: Record<Platform, string> = {
  facebook_reel: "Facebook Reel",
  instagram_reel: "Instagram Reel",
  youtube_short: "YouTube Short",
  linkedin_post: "LinkedIn Post",
  facebook_post: "Facebook Post",
  carousel: "Carousel",
  website_hero: "Website Hero",
  email: "Email",
};

export function renderPrompt(id: PromptId, ctx: PromptContext): string {
  const def = PROMPTS.find(p => p.id === id);
  if (!def) throw new Error(`Unknown prompt id: ${id}`);
  const json = (v: unknown) => JSON.stringify(v, null, 2);
  return def.body
    .replaceAll("{{brand_json}}", json(ctx.brand))
    .replaceAll("{{prompt_json}}", json(ctx.prompt))
    .replaceAll("{{assets_json}}", json(ctx.assets))
    .replaceAll("{{concept_json}}", json(ctx.concept))
    .replaceAll("{{platform}}", platformLabel[ctx.platform]);
}

// Strip variable placeholder blocks + the ## Inputs / ## Output headers
// so each step contributes only its instructions to the mega prompt.
function instructionsOnly(body: string): string {
  // Drop everything from "## Inputs" through the end of the first fenced code block
  // (which contains the {{variable_json}} placeholders).
  return body
    .replace(/##\s*Inputs[\s\S]*?(?=\n##\s|\n---\s|\n#\s|$)/gi, "")
    .replace(/```[a-z]*\n[\s\S]*?\n```/g, "")
    .trim();
}

// JSON output shape per step — used by the custom combo builder to derive the schema.
const STEP_OUTPUT_KEYS: Record<PromptId, string> = {
  brand_reader: '"brand": BrandProfile',
  asset_scanner: '"assetScan": { "bestOpenerIds": string[]; "bestProofIds": string[]; "bestEndCardIds": string[]; "weakAssetIds": Array<{ id: string; reason: string }>; "missingAssets": string[]; "readiness": "ready" | "thin" | "blocked"; "readinessReason": string }',
  audience_strategy: '"audience": { "segments": Array<{ rank: "primary" | "secondary"; label: string; platformBehavior: string; painOrDesire: string; stopScrollTrigger: string; skipTrigger: string }>; "messageAngles": string[]; "avoid": string[] }',
  platform_strategy: '"platformStrategy": { "platform": Platform; "aspectRatio": string; "hookWindow": { seconds: number; visual: string; overlay: string }; "soundStrategy": "voiceover" | "sound_off_text" | "ambient"; "pace": "slow" | "medium" | "fast"; "recommendedDurationSeconds": number; "durationReason": string; "endCard": string; "captionLength": "short" | "medium" | "long"; "doNotDo": string[] }',
  campaign_concepts: '"concepts": CampaignConcept[]; "recommendation": string',
  storyboard: '"storyboard": { conceptId: string; durationSeconds: number; scenes: Scene[]; missingAssets: string[]; pacingNote: string }',
  render_spec: '"renderSpec": RenderSpec',
  publishing_pack: '"publishingPack": PublishingPack',
  qa_checker: '"qa": QAReport',
};

/**
 * Build a custom mega-prompt containing only the selected step instructions
 * and a derived output JSON spec with just those step outputs.
 */
export function renderCustomMegaPrompt(
  ctx: PromptContext,
  selectedIds: ReadonlyArray<PromptId>,
  sourceExcerpts?: Record<string, string>
): string {
  const json = (v: unknown) => JSON.stringify(v, null, 2);
  const selectedSet = new Set(selectedIds);
  const selectedSteps = PROMPTS.filter(p => selectedSet.has(p.id));
  if (selectedSteps.length === 0) return "(No steps selected.)";

  const stepBlocks = selectedSteps
    .map(p => `### Step ${p.step} — ${p.label}\n\n${instructionsOnly(p.body)}`)
    .join("\n\n---\n\n");

  const excerptKeys = sourceExcerpts ? Object.keys(sourceExcerpts) : [];
  const sourceBlock = excerptKeys.length > 0
    ? `\n\n**Source file excerpts** — Claude, read these. Any inferred brand / audience / concept content MUST come from this content. Do not invent claims that aren't supported here.\n\n${excerptKeys
        .map(k => `\n#### \`${k}\`\n\n\`\`\`\n${sourceExcerpts![k]}\n\`\`\``)
        .join("\n")}`
    : "";

  const outputShape = `{\n${selectedSteps.map(s => `  ${STEP_OUTPUT_KEYS[s.id]},        // step ${s.step}`).join("\n")}\n}`;

  return `# LaunchFoundry — Custom Combined Prompt

Run only the selected pipeline steps below for the project, in order, and return a single JSON object with the keys listed at the bottom. No Markdown narration — pure JSON.

Brand-safety rules apply: do not invent claims, pricing, certifications, guarantees, or proof.

---

## Context

**Campaign prompt**
\`\`\`json
${json(ctx.prompt)}
\`\`\`

**Brand profile**
\`\`\`json
${json(ctx.brand)}
\`\`\`

**Available assets**
\`\`\`json
${json(ctx.assets)}
\`\`\`${sourceBlock}

${ctx.concept.id === "concept-pending" || ctx.concept.scenes.length === 0
  ? "**No concept selected yet.** If you're running steps 6–9, derive the working concept from whatever was produced in step 5 (or, if step 5 isn't included, ask for a concept JSON before continuing)."
  : `**Currently selected concept**\n\`\`\`json\n${json(ctx.concept)}\n\`\`\``}

**Target platform:** ${platformLabel[ctx.platform]}

---

## Steps

${stepBlocks}

---

## Output — one combined JSON object

\`\`\`ts
${outputShape}
\`\`\`

Match the type definitions from the original step prompts.`;
}

/**
 * Multi-platform caption variants. Given one concept, produce captions + hashtags
 * + posting notes tailored to each platform in one round-trip.
 */
export type CaptionPlatform = "facebook_reel" | "instagram_reel" | "youtube_short" | "linkedin_post" | "x_post" | "threads_post";

const CAPTION_PLATFORM_LABELS: Record<CaptionPlatform, string> = {
  facebook_reel: "Facebook Reels",
  instagram_reel: "Instagram Reels",
  youtube_short: "YouTube Shorts",
  linkedin_post: "LinkedIn",
  x_post: "X (Twitter)",
  threads_post: "Threads",
};

export function renderMultiPlatformPrompt(
  ctx: PromptContext,
  platforms: ReadonlyArray<CaptionPlatform>
): string {
  const json = (v: unknown) => JSON.stringify(v, null, 2);
  const list = platforms.length > 0 ? platforms : (["facebook_reel", "instagram_reel", "linkedin_post"] as CaptionPlatform[]);
  const platformLines = list.map(p => `- **${CAPTION_PLATFORM_LABELS[p]}** (\`${p}\`)`).join("\n");

  return `# LaunchFoundry — Multi-Platform Caption Variants

You will produce caption + hashtag + posting-notes variants for **one** concept across multiple social platforms. Same brand, same proof points, same CTA target — but tuned to each platform's voice, length, hashtag etiquette, and audience.

Brand-safety rules apply: stay inside the brand's \`avoidClaims\` list. Do not invent pricing, guarantees, or certifications.

---

## Context

**Brand profile**
\`\`\`json
${json(ctx.brand)}
\`\`\`

**Concept to caption**
\`\`\`json
${json(ctx.concept)}
\`\`\`

---

## Platforms

${platformLines}

---

## Per-platform rules of thumb

- **Facebook Reels**: warmer, conversational, location-anchored. 2–4 lines OK. Light hashtags (3–5). Links auto-link as plain text. Ask a question in roughly half the posts.
- **Instagram Reels**: hook in first 125 chars (feed truncates). 12–22 hashtags, niche + local mix, no repeats within 7 days. Geotag in the post itself.
- **YouTube Shorts**: short caption (1–2 lines) + 3–4 hashtags. First sentence should mirror the on-screen hook.
- **LinkedIn**: business-tone, 3–5 lines, no emoji. End with a soft question. 3–5 hashtags max, professional only.
- **X (Twitter)**: 1–2 lines, 0–2 hashtags. Hook + CTA. Link goes at the very end.
- **Threads**: 1–3 short lines, conversational, 0–2 hashtags, no link bait.

---

## Output

Return ONE JSON object — no Markdown, no commentary outside the JSON:

\`\`\`ts
{
  "captions": Array<{
    "platform": ${list.map(p => `"${p}"`).join(" | ")};
    "caption": string;          // platform-appropriate length & tone
    "hashtags": string[];       // count per platform rules
    "firstComment"?: string;    // optional follow-up (mainly IG)
    "altText"?: string;         // 1–2 sentence alt for the visual
    "postingNotes": string;     // best time + caveats + geotag guidance
    "cta": string;              // one specific CTA
  }>;
  "warnings": string[];         // anything brand-unsafe you avoided
}
\`\`\``;
}

/**
 * One combined prompt that bundles all 9 step instructions, the full context once,
 * and a single unified output JSON spec. Paste this into Claude → get one JSON back
 * that drives the entire pipeline.
 *
 * `sourceExcerpts` (optional) is a map of relative path → text content for files
 * Claude needs to read to infer the brand (README, package.json, index.html, etc.).
 */
export function renderMegaPrompt(ctx: PromptContext, sourceExcerpts?: Record<string, string>): string {
  const json = (v: unknown) => JSON.stringify(v, null, 2);
  const stepBlocks = PROMPTS.map(p => `### Step ${p.step} — ${p.label}\n\n${instructionsOnly(p.body)}`).join("\n\n---\n\n");

  const excerptKeys = sourceExcerpts ? Object.keys(sourceExcerpts) : [];
  const sourceBlock = excerptKeys.length > 0
    ? `\n\n**Source file excerpts** — Claude, read these. The brand profile, audience, and concepts MUST be inferred from this content. Do not invent claims that aren't supported here.\n\n${excerptKeys
        .map(k => `\n#### \`${k}\`\n\n\`\`\`\n${sourceExcerpts![k]}\n\`\`\``)
        .join("\n")}`
    : "";

  // If no concept exists yet, give Claude a clear instruction to derive one from step 5
  // instead of an empty placeholder that wastes tokens and confuses steps 6–9.
  const isEmptyConcept = ctx.concept.id === "concept-pending" || ctx.concept.scenes.length === 0;
  const conceptBlock = isEmptyConcept
    ? `**No concept selected yet.** After generating the 3 concepts in step 5, use the one you rank first (highest \`score.total\`) as the working concept for steps 6–9 (storyboard / render spec / publishing pack / QA). Set the storyboard's \`conceptId\` to that concept's \`id\`.`
    : `**Currently selected concept (for storyboard / render / publishing / QA steps)**
\`\`\`json
${json(ctx.concept)}
\`\`\``;

  return `# LaunchFoundry — Full Campaign Mega Prompt

You will run every step of the LaunchFoundry pipeline in one pass for the project below. Read the **Context**, then follow each numbered step's instructions, and return a **single JSON object** matching the schema at the bottom. Markdown narration is not needed — pure JSON.

Brand-safety rules apply to every step: do not invent claims, pricing, certifications, guarantees, fake proof. Stay inside the brand's avoid-claims list.

---

## Context

**Campaign prompt**
\`\`\`json
${json(ctx.prompt)}
\`\`\`

**Brand profile (may be partial — refine in step 1)**
\`\`\`json
${json(ctx.brand)}
\`\`\`

**Available assets**
\`\`\`json
${json(ctx.assets)}
\`\`\`${sourceBlock}

${conceptBlock}

**Target platform:** ${platformLabel[ctx.platform]}

---

## Steps

${stepBlocks}

---

## Output — one combined JSON object

Return exactly this shape. Do not include Markdown or commentary outside the JSON.

\`\`\`ts
{
  "brand": BrandProfile,                       // step 1 refined output
  "assetScan": {
    "bestOpenerIds": string[],
    "bestProofIds": string[],
    "bestEndCardIds": string[],
    "weakAssetIds": Array<{ id: string; reason: string }>,
    "missingAssets": string[],
    "readiness": "ready" | "thin" | "blocked",
    "readinessReason": string
  },                                            // step 2
  "audience": {
    "segments": Array<{
      "rank": "primary" | "secondary";
      "label": string;
      "platformBehavior": string;
      "painOrDesire": string;
      "stopScrollTrigger": string;
      "skipTrigger": string;
    }>,
    "messageAngles": string[],
    "avoid": string[]
  },                                            // step 3
  "platformStrategy": {
    "platform": "facebook_reel",
    "aspectRatio": "9:16",
    "hookWindow": { "seconds": number; "visual": string; "overlay": string },
    "soundStrategy": "voiceover" | "sound_off_text" | "ambient",
    "pace": "slow" | "medium" | "fast",
    "recommendedDurationSeconds": number,
    "durationReason": string,
    "endCard": string,
    "captionLength": "short" | "medium" | "long",
    "doNotDo": string[]
  },                                            // step 4
  "concepts": CampaignConcept[],                // step 5 — exactly 3, ranked by score.total desc
  "recommendation": string,                     // one sentence — which concept to take forward and why
  "storyboard": {                               // step 6 — full storyboard for the recommended concept
    "conceptId": string;
    "durationSeconds": number;
    "scenes": Scene[];
    "missingAssets": string[];
    "pacingNote": string;
  },
  "renderSpec": RenderSpec,                     // step 7 — for the recommended concept
  "publishingPack": PublishingPack,             // step 8
  "qa": QAReport                                // step 9
}
\`\`\`

Type definitions for \`BrandProfile\`, \`CampaignConcept\`, \`Scene\`, \`RenderSpec\`, \`PublishingPack\`, \`QAReport\` live in the original step prompts above. Match them exactly.

Paste this JSON back into LaunchFoundry to populate every page in one shot.`;
}

