// Bridge: LaunchFoundry CampaignConcept → brittenwoodworking-reels project.json
// Targets the per-template Props shapes in
// C:\Sites\brittenwoodworking-reels\src\data\schema.ts.

import type { BrandProfile, CampaignConcept, ProjectAsset, Scene } from "../types";

export type ReelsTemplate = "ProjectShowcase" | "BeforeAfter" | "ProcessClip";

export type ReelsEndCardFields = {
  ctaText: string;
  endTagline: string;
  endActionLine: string;
  endContactItems: Array<[string, string]>;
  endLocationLines: string[];
};

type ReelsPhoto = { src: string; motion?: "in" | "out" | "pan-l" | "pan-r" | "up"; durationInFrames?: number };

export type ReelsProjectJson =
  | ({ title: string; eyebrow?: string; kicker?: string; metaLines?: string[]; metaTags?: string[]; photos: ReelsPhoto[]; accentColor?: string } & ReelsEndCardFields)
  | ({ title: string; eyebrow?: string; kicker?: string; beforePhoto: ReelsPhoto; afterPhoto: ReelsPhoto; metaEyebrow?: string; metaLines?: string[]; metaTags?: string[]; accentColor?: string } & ReelsEndCardFields)
  | ({ title: string; eyebrow?: string; kicker?: string; stages: Array<ReelsPhoto & { label: string; sub?: string }>; accentColor?: string } & ReelsEndCardFields);

export type ReelsAdapterResult = {
  template: ReelsTemplate;
  slug: string;                 // suggested folder under public/projects/
  project: ReelsProjectJson;
  pathRewrites: Array<{ from: string; to: string; needsCopy: boolean }>;
};

const FPS = 30;
const REELS_PHOTO_DIR_PREFIX = "C:/Sites/brittenwoodworking-reels/public/";
const WEBSITE_IMAGE_DIR_PREFIX = "C:/Sites/brittenwoodworking-new/images/";

// Convert an absolute disk path on the mock asset to a path the reels project will resolve via staticFile().
function toReelsPath(absPath: string): { rel: string; needsCopy: boolean } {
  if (absPath.startsWith(REELS_PHOTO_DIR_PREFIX)) {
    return { rel: absPath.slice(REELS_PHOTO_DIR_PREFIX.length), needsCopy: false };
  }
  if (absPath.startsWith(WEBSITE_IMAGE_DIR_PREFIX)) {
    // Reels project expects files under public/photos/. Caller can copy the file in.
    const filename = absPath.slice(WEBSITE_IMAGE_DIR_PREFIX.length).split("/").pop()!;
    return { rel: `photos/${filename}`, needsCopy: true };
  }
  // Logos and one-off paths — emit as-is filename
  const filename = absPath.split("/").pop() ?? absPath;
  return { rel: `photos/${filename}`, needsCopy: true };
}

const MOTION_FROM_SCENE: ReadonlyArray<{ match: RegExp; motion: ReelsPhoto["motion"] }> = [
  { match: /pan[ _-]?left/i, motion: "pan-l" },
  { match: /pan[ _-]?right/i, motion: "pan-r" },
  { match: /pan[ _-]?up|push up/i, motion: "up" },
  { match: /push|in\b|ken burns 'in'/i, motion: "in" },
  { match: /out|ken burns 'out'/i, motion: "out" },
];

function sceneMotion(scene: Scene): ReelsPhoto["motion"] | undefined {
  const notes = scene.motionNotes ?? "";
  for (const m of MOTION_FROM_SCENE) if (m.match.test(notes)) return m.motion;
  return undefined;
}

function sceneDurationFrames(scene: Scene): number {
  return Math.max(60, Math.round((scene.endSecond - scene.startSecond) * FPS));
}

function endCardFromBrand(brand: BrandProfile): ReelsEndCardFields {
  // Pull phone + email out of the CTA / website. Brand profile keeps them in the CTA string.
  const phoneMatch = brand.cta.match(/\(?\d{3}\)?[ -]?\d{3}-?\d{4}/);
  const phone = phoneMatch ? phoneMatch[0] : "";
  const url = brand.websiteUrl ?? "";
  return {
    ctaText: url.replace(/^https?:\/\/(www\.)?/i, "").toUpperCase(),
    endTagline: brand.oneLiner,
    endActionLine: "Call Today",
    endContactItems: [
      ...(phone ? ([["Call", phone]] as Array<[string, string]>) : []),
      ["Write", "michaelspikebritten@gmail.com"],
      ["Instagram", "@brittenwoodworkingcompany"],
    ],
    endLocationLines: ["East Windsor, Connecticut", "Serving Greater Hartford"],
  };
}

function detectTemplate(concept: CampaignConcept): ReelsTemplate {
  const f = concept.format.toLowerCase();
  if (f.includes("beforeafter") || f.includes("before/after") || f.includes("before·after") || f.includes("before · after")) return "BeforeAfter";
  if (f.includes("processclip") || f.includes("process clip") || f.includes("numbered build stages") || f.includes("4-step") || f.includes("steps")) return "ProcessClip";
  return "ProjectShowcase";
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function assetById(assets: ProjectAsset[], id: string): ProjectAsset | undefined {
  return assets.find(a => a.id === id);
}

// Detect title-card scenes: their motion notes call out "splash" / "wordmark" / "title".
function isTitleScene(scene: Scene): boolean {
  const m = (scene.motionNotes ?? "").toLowerCase();
  const v = (scene.visual ?? "").toLowerCase();
  return /splash|wordmark|title/.test(m) || /^title\b|wordmark|titlecard/.test(v);
}

// Filter scenes to those that have at least one asset reference and aren't pure-text title/end cards.
function photoScenes(concept: CampaignConcept, assets: ProjectAsset[]): Array<{ scene: Scene; asset: ProjectAsset }> {
  return concept.scenes
    .filter(s => s.assetIds.length > 0 && !isTitleScene(s))
    .map(s => {
      const asset = assetById(assets, s.assetIds[0]!);
      return asset ? { scene: s, asset } : null;
    })
    .filter((x): x is { scene: Scene; asset: ProjectAsset } => x !== null);
}

function buildShowcase(concept: CampaignConcept, brand: BrandProfile, assets: ProjectAsset[]): ReelsProjectJson {
  const ec = endCardFromBrand(brand);
  // Skip the title scene (no asset) and end card (logo). Use middle photo scenes.
  const pool = photoScenes(concept, assets).filter(p => p.asset.type !== "logo");
  // Dedupe consecutive same-asset entries (e.g. when a title scene reuses the next hero photo).
  const deduped: typeof pool = [];
  for (const p of pool) {
    if (deduped[deduped.length - 1]?.asset.id !== p.asset.id) deduped.push(p);
  }
  const photos: ReelsPhoto[] = deduped.slice(0, 4).map(p => {
    const { rel } = toReelsPath(p.asset.path);
    const motion = sceneMotion(p.scene);
    const out: ReelsPhoto = { src: rel, durationInFrames: sceneDurationFrames(p.scene) };
    if (motion) out.motion = motion;
    return out;
  });
  const [eyebrow, kicker] = splitTitleParts(concept.title);
  return {
    title: cleanTitle(concept.title),
    eyebrow,
    kicker: kicker ?? "Hartford County, Connecticut",
    metaLines: deriveMetaLines(concept),
    metaTags: deriveMetaTags(concept),
    photos,
    ...ec,
  };
}

function buildBeforeAfter(concept: CampaignConcept, brand: BrandProfile, assets: ProjectAsset[]): ReelsProjectJson {
  const ec = endCardFromBrand(brand);
  const pool = photoScenes(concept, assets).filter(p => p.asset.type !== "logo");
  // Use tag-based detection — notes can contain "before/after" phrases that fool a plain regex.
  const isBefore = (p: { scene: Scene; asset: ProjectAsset }) =>
    p.asset.tags.includes("before") || /rough[- ]?framing|framing/i.test(p.asset.tags.join(" "));
  const isAfter = (p: { scene: Scene; asset: ProjectAsset }) =>
    p.asset.tags.includes("after") || /finished|reveal/i.test(p.asset.tags.join(" "));
  const beforeP = pool.find(isBefore) ?? pool[0];
  let afterP = pool.find(p => p !== beforeP && isAfter(p));
  if (!afterP) afterP = pool.find(p => p !== beforeP) ?? pool[pool.length - 1];
  if (!beforeP || !afterP || beforeP === afterP) throw new Error("BeforeAfter needs two distinct photo scenes");
  const beforeMotion = sceneMotion(beforeP.scene);
  const afterMotion = sceneMotion(afterP.scene);
  return {
    title: cleanTitle(concept.title),
    eyebrow: "Before · After",
    kicker: "From rough framing to finished detail",
    beforePhoto: { src: toReelsPath(beforeP.asset.path).rel, ...(beforeMotion ? { motion: beforeMotion } : {}) },
    afterPhoto: { src: toReelsPath(afterP.asset.path).rel, ...(afterMotion ? { motion: afterMotion } : {}) },
    metaEyebrow: deriveProjectCategory(concept),
    metaLines: deriveMetaLines(concept),
    metaTags: deriveMetaTags(concept),
    ...ec,
  };
}

function buildProcess(concept: CampaignConcept, brand: BrandProfile, assets: ProjectAsset[]): ReelsProjectJson {
  const ec = endCardFromBrand(brand);
  const pool = photoScenes(concept, assets).filter(p => p.asset.type !== "logo");
  const stages = pool.slice(0, 4).map(p => {
    const { rel } = toReelsPath(p.asset.path);
    const motion = sceneMotion(p.scene);
    // Parse "1 · Laminated substrate" → label "Laminated substrate"
    const overlay = (p.scene.textOverlay ?? "").trim();
    const match = overlay.match(/^\s*\d+\s*[·.\-]\s*(.+)$/);
    const label = (match?.[1] ?? overlay).trim() || p.asset.tags[0] || "Step";
    const sub = p.scene.visual;
    return {
      src: rel,
      durationInFrames: sceneDurationFrames(p.scene),
      label,
      sub,
      ...(motion ? { motion } : {}),
    };
  });
  return {
    title: cleanTitle(concept.title),
    eyebrow: "In The Shop",
    kicker: "Four steps, start to finish",
    stages,
    ...ec,
  };
}

function cleanTitle(t: string): string {
  // "Curved Stairway — Showcase" → "Curved Stairway"
  // "Built In Place — Before/After" → "Built In Place"
  // "Curved Bar — 4-Step Process" → "Curved Bar"
  return t.split(/[—–-]\s/)[0].trim();
}

function splitTitleParts(t: string): [string, string | undefined] {
  // Map "Curved Stairway — Showcase" → eyebrow "Showcase"
  const parts = t.split(/[—–]\s*/);
  if (parts.length >= 2) return [parts[1]!.trim(), undefined];
  return ["Project", undefined];
}

function deriveMetaLines(concept: CampaignConcept): string[] {
  // Use the title parts as two stacked lines for the lower third.
  const words = cleanTitle(concept.title).split(/\s+/);
  if (words.length === 1) return [words[0]!];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

function deriveMetaTags(concept: CampaignConcept): string[] {
  // Two short italic tags. Pull keywords from angle/promise.
  const src = `${concept.angle} ${concept.promise}`.toLowerCase();
  const candidates = [
    { test: /hand[- ]?shaped|by hand|hand[- ]?fit/, tag: "Hand-shaped" },
    { test: /turned newel/, tag: "Turned newels" },
    { test: /site[- ]?built/, tag: "Site-built" },
    { test: /period[- ]?accurate|18th[- ]?century/, tag: "Period-accurate" },
    { test: /joinery/, tag: "Site joinery" },
    { test: /white oak|mahogany|cherry/, tag: "Premium hardwood" },
    { test: /custom[- ]?fit/, tag: "Custom-fit" },
  ];
  const hits = candidates.filter(c => c.test.test(src)).map(c => c.tag).slice(0, 2);
  if (hits.length < 2) hits.push("Hartford County");
  return hits.slice(0, 2);
}

function deriveProjectCategory(concept: CampaignConcept): string {
  const haystack = `${concept.title} ${concept.angle}`.toLowerCase();
  if (/stair/.test(haystack)) return "Stairwork";
  if (/cabinet|bar/.test(haystack)) return "Cabinetry";
  if (/entry|door/.test(haystack)) return "Entryways";
  if (/panel/.test(haystack)) return "Paneling";
  if (/molding|trim/.test(haystack)) return "Moldings";
  return "Custom Millwork";
}

export function buildReelsProject(
  concept: CampaignConcept,
  brand: BrandProfile,
  assets: ProjectAsset[]
): ReelsAdapterResult {
  const template = detectTemplate(concept);
  const project =
    template === "ProjectShowcase" ? buildShowcase(concept, brand, assets)
    : template === "BeforeAfter" ? buildBeforeAfter(concept, brand, assets)
    : buildProcess(concept, brand, assets);

  // Collect path rewrites so the UI can warn about files that need copying.
  const seen = new Set<string>();
  const pathRewrites: ReelsAdapterResult["pathRewrites"] = [];
  for (const a of assets) {
    if (a.type === "logo") continue;
    const { rel, needsCopy } = toReelsPath(a.path);
    if (seen.has(a.path)) continue;
    seen.add(a.path);
    // Only include rewrites we'd actually use (referenced by the concept)
    if (concept.recommendedAssets.includes(a.id) || concept.scenes.some(s => s.assetIds.includes(a.id))) {
      pathRewrites.push({ from: a.path, to: `brittenwoodworking-reels/public/${rel}`, needsCopy });
    }
  }

  return {
    template,
    slug: slugify(concept.id.replace(/^concept-/, "")),
    project,
    pathRewrites,
  };
}
