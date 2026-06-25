import type { BrandTokens } from "./brandExtract";

export type ImagePromptInputs = {
  subject: string;          // what's in the shot, e.g. "a precision ruler on graph paper"
  context: string;          // why it's there, e.g. "step 1 of a planning tool walkthrough"
  brandName: string;
  tokens: BrandTokens;
  /** "vertical" for 9:16 Reel scenes; "square" or "landscape" for variants. */
  aspect?: "vertical" | "square" | "landscape";
};

export type ImageProvider = "midjourney" | "dalle" | "sora" | "flux" | "ideogram";

const ASPECT_CLAUSES: Record<NonNullable<ImagePromptInputs["aspect"]>, string> = {
  vertical: "vertical 9:16 composition, generous top and bottom margins for text overlays",
  square: "square 1:1 composition, centered subject",
  landscape: "wide 16:9 composition, cinematic letterboxing",
};

function motifPhrase(motif: BrandTokens["motif"]): string {
  switch (motif) {
    case "graph-paper": return "engineering notebook on warm cream graph paper, hand-tool aesthetic, precision-instrument photography";
    case "blueprint": return "technical blueprint, thin white linework on deep navy, drafting-board aesthetic";
    case "editorial": return "editorial magazine photography, generous negative space, thin accent rules";
    case "gradient": return "soft warm radial gradient background, premium product photography lighting";
    case "minimal": return "minimal white background, single-subject product photography, even soft lighting";
    case "mono": return "monochrome studio photography, single accent color highlight";
    default: return "editorial photography";
  }
}

function colorClause(t: BrandTokens): string {
  return `dominant palette ${t.background} as background and ${t.accent} as accent color, no other dominant hues`;
}

function neutralBlock(): string {
  return "no people, no faces, no logos, no text, no UI mockups, no watermarks, no trendy filters";
}

/**
 * Build a single rich-prose prompt that works as a starting point for any provider.
 */
export function buildImagePrompt(inputs: ImagePromptInputs): string {
  const aspect = inputs.aspect ?? "vertical";
  const parts = [
    inputs.subject,
    motifPhrase(inputs.tokens.motif),
    colorClause(inputs.tokens),
    ASPECT_CLAUSES[aspect],
    `context: ${inputs.context}`,
    neutralBlock(),
  ];
  return parts.join(", ");
}

/**
 * Provider-specific suffixes. The base prompt is identical; the suffix
 * carries the platform-specific flags / style hints.
 */
export function flavorForProvider(provider: ImageProvider, aspect: ImagePromptInputs["aspect"] = "vertical"): string {
  const arRatio = aspect === "vertical" ? "9:16" : aspect === "square" ? "1:1" : "16:9";
  switch (provider) {
    case "midjourney":
      return `--ar ${arRatio} --style raw --v 6.1 --quality 1 --no text watermark UI`;
    case "dalle":
      return `\n(Aspect ratio ${arRatio}; high detail; documentary photography style)`;
    case "sora":
      return `\n(Render as a still image, aspect ratio ${arRatio}, no motion, no UI)`;
    case "flux":
      return `\n[Flux.1 Pro · ${arRatio} · ultra-detailed · no text]`;
    case "ideogram":
      return `\n--aspect ${arRatio} --style photo --no-text`;
  }
}

export function fullPrompt(inputs: ImagePromptInputs, provider: ImageProvider): string {
  return buildImagePrompt(inputs).trim() + " " + flavorForProvider(provider, inputs.aspect ?? "vertical");
}

/** Suggest a kebab-case filename for the generated image based on the scene label. */
export function suggestFilename(brandName: string, sceneLabel: string, ext = "png"): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug(brandName)}-${slug(sceneLabel)}.${ext}`;
}
