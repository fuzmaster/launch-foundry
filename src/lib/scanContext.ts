import type { BrandProfile, CampaignConcept, CampaignPrompt, Platform, ProjectAsset } from "../types";
import type { PromptContext } from "./prompts";

function humanize(folderName: string): string {
  if (!folderName) return "Untitled Project";
  return folderName
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(w => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

const PLACEHOLDER = "(infer from the scan)";

function stubBrand(projectName: string): BrandProfile {
  return {
    projectName,
    businessName: projectName,
    category: PLACEHOLDER,
    oneLiner: PLACEHOLDER,
    offerSummary: "(infer from README.md, index.html, package.json description, or other source files in the scan)",
    targetCustomer: PLACEHOLDER,
    tone: PLACEHOLDER,
    colors: [],
    fonts: [],
    proofPoints: [],
    differentiators: [],
    avoidClaims: [
      "No pricing unless explicitly stated in the scan",
      "No guarantees not present in source files",
      "No claims unsupported by the scanned assets",
    ],
    cta: PLACEHOLDER,
  };
}

function stubConcept(platform: Platform): CampaignConcept {
  return {
    id: "concept-pending",
    title: "(to be generated in step 5)",
    platform,
    targetAudience: "",
    angle: "",
    hook: "",
    promise: "",
    format: "",
    durationSeconds: 0,
    scenes: [],
    recommendedAssets: [],
    missingAssets: [],
    caption: "",
    cta: "",
    score: { audienceFit: 0, platformFit: 0, assetFit: 0, clarity: 0, effort: 0, total: 0, reason: "" },
  };
}

/**
 * Build a PromptContext that asks the LLM to infer the brand and concepts from
 * the scan itself, instead of riffing on whichever static project happened to
 * be selected when the scan ran.
 *
 * Also blanks the campaign prompt's goal + hints — those belong to the
 * previously-selected project and would otherwise contaminate a scan of a
 * completely different folder (e.g. scanning AC Quote Check while the project
 * dropdown still says Crop Check).
 */
export function buildScanStubContext(
  detectedRoot: string,
  scannedAssets: ProjectAsset[],
  prompt: CampaignPrompt,
  platform: Platform
): PromptContext {
  const projectName = humanize(detectedRoot || "Untitled Project");
  const brand = stubBrand(projectName);
  const concept = stubConcept(platform);
  const scrubbedPrompt: CampaignPrompt = {
    id: prompt.id,
    projectName,
    platform,
    goal: `Generate a ${platformLabel(platform)} campaign for ${projectName}. Infer everything — audience, tone, offer, proof points, concepts — from the source files inlined below. Do not assume any prior project context.`,
    audienceHint: PLACEHOLDER,
    toneHint: PLACEHOLDER,
    offerHint: PLACEHOLDER,
    constraints: [
      "Stay inside the brand-safety rules in the inferred brand profile.",
      "No claims unsupported by the source-file excerpts.",
    ],
    createdAt: prompt.createdAt,
  };
  return {
    brand,
    prompt: scrubbedPrompt,
    assets: scannedAssets,
    concept,
    platform,
  };
}

function platformLabel(p: Platform): string {
  switch (p) {
    case "facebook_reel": return "Facebook Reels";
    case "instagram_reel": return "Instagram Reels";
    case "youtube_short": return "YouTube Shorts";
    case "linkedin_post": return "LinkedIn";
    case "facebook_post": return "Facebook";
    case "carousel": return "carousel";
    case "website_hero": return "website hero";
    case "email": return "email";
  }
}

export { humanize as humanizeFolderName };
