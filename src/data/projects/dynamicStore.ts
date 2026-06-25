import { loadState, saveState } from "../../lib/storage";
import { inferBrandFromSources } from "../../lib/brandFromScan";
import type { BrandProfile, CampaignConcept, CampaignPrompt, Platform, ProjectAsset } from "../../types";
import type { Project } from "./types";

const STORE_KEY = "launchfoundry.dynamicProjects";
const SEED_KEY = "launchfoundry.builtinExamplesSeeded";

export function loadDynamicProjects(): Project[] {
  return loadState<Project[]>(STORE_KEY, []);
}

export function saveDynamicProjects(projects: Project[]) {
  saveState(STORE_KEY, projects);
}

/**
 * On first load (or when the seed flag is missing), copy any built-in examples
 * the user doesn't already have into their dynamic registry. After this point
 * the user owns those entries — they can rename/delete/archive them freely.
 * If they delete one and want it back, the "Restore built-in examples" button
 * on the Projects page re-seeds whatever's missing.
 */
export function seedBuiltinsIntoRegistry(
  current: Project[],
  builtins: ReadonlyArray<Project>
): { next: Project[]; added: number } {
  const existingIds = new Set(current.map(p => p.id));
  const toAdd = builtins.filter(b => !existingIds.has(b.id)).map(b => deepClone(b));
  if (toAdd.length === 0) return { next: current, added: 0 };
  return { next: [...toAdd, ...current], added: toAdd.length };
}

export function hasSeededOnce(): boolean {
  return loadState<boolean>(SEED_KEY, false);
}

export function markSeeded() {
  saveState(SEED_KEY, true);
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "project";
}

export function uniqueId(base: string, existing: ReadonlyArray<Project>): string {
  const slug = slugify(base);
  if (!existing.some(p => p.id === slug)) return slug;
  let n = 2;
  while (existing.some(p => p.id === `${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

const placeholderBrand = (projectName: string): BrandProfile => ({
  projectName,
  businessName: projectName,
  category: "",
  oneLiner: "",
  offerSummary: "",
  targetCustomer: "",
  tone: "",
  colors: [],
  fonts: [],
  proofPoints: [],
  differentiators: [],
  avoidClaims: [],
  cta: "",
});

const defaultPrompt = (projectName: string, platform: Platform = "facebook_reel"): CampaignPrompt => ({
  id: `prompt-${slugify(projectName)}`,
  projectName,
  platform,
  goal: `Generate a Facebook Reels campaign for ${projectName}.`,
  audienceHint: "",
  toneHint: "",
  offerHint: "",
  constraints: [],
  createdAt: new Date().toISOString(),
});

export function createBlankProject(label: string, existing: ReadonlyArray<Project>): Project {
  const trimmed = label.trim() || "New Project";
  return {
    id: uniqueId(trimmed, existing),
    label: trimmed,
    blurb: "Blank project. Run a scan or import a brand to populate it.",
    brand: placeholderBrand(trimmed),
    assets: [],
    concepts: [],
    defaultConceptId: "",
    defaultPrompt: defaultPrompt(trimmed),
    createdAt: new Date().toISOString(),
  };
}

export function createProjectFromScan(args: {
  label: string;
  existing: ReadonlyArray<Project>;
  assets: ProjectAsset[];
  sourceExcerpts?: Record<string, string>;
  brand?: BrandProfile;
  concepts?: CampaignConcept[];
  platform?: Platform;
}): Project {
  const trimmed = args.label.trim() || "Untitled Scan";
  let brand = args.brand ?? placeholderBrand(trimmed);
  // When the caller didn't supply a brand AND we have source excerpts,
  // pre-fill the obvious fields from README / package.json / index.html
  // so the new project isn't completely blank.
  if (!args.brand && args.sourceExcerpts && Object.keys(args.sourceExcerpts).length > 0) {
    // Mark placeholder fields so inferBrandFromSources knows which to overwrite.
    brand = {
      ...brand,
      oneLiner: "(infer from the scan)",
      category: "(infer from the scan)",
      offerSummary: "(infer from the scan)",
    };
    brand = inferBrandFromSources(brand, args.sourceExcerpts);
  }
  const concepts = args.concepts ?? [];
  return {
    id: uniqueId(trimmed, args.existing),
    label: trimmed,
    blurb: `Saved from a folder scan${args.sourceExcerpts ? ` · ${Object.keys(args.sourceExcerpts).length} source excerpt(s)` : ""}.`,
    brand,
    assets: args.assets,
    concepts,
    defaultConceptId: concepts[0]?.id ?? "",
    defaultPrompt: defaultPrompt(trimmed, args.platform ?? "facebook_reel"),
    sourceExcerpts: args.sourceExcerpts,
    createdAt: new Date().toISOString(),
  };
}

export type ImportProjectResult = { ok: true; project: Project } | { ok: false; error: string };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseImportedProject(raw: string, existing: ReadonlyArray<Project>): ImportProjectResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  if (!isObj(parsed)) return { ok: false, error: "Expected a top-level JSON object." };
  const label = typeof parsed.label === "string" ? parsed.label : (typeof parsed.id === "string" ? parsed.id : "Imported");
  if (!isObj(parsed.brand)) return { ok: false, error: "Missing or malformed `brand` field." };
  if (!Array.isArray(parsed.assets)) return { ok: false, error: "Missing or malformed `assets` field." };
  if (!Array.isArray(parsed.concepts)) return { ok: false, error: "Missing or malformed `concepts` field." };

  const baseId = typeof parsed.id === "string" ? parsed.id : label;
  const project: Project = {
    id: uniqueId(baseId, existing),
    label,
    blurb: typeof parsed.blurb === "string" ? parsed.blurb : "Imported project.",
    brand: parsed.brand as BrandProfile,
    assets: parsed.assets as ProjectAsset[],
    concepts: parsed.concepts as CampaignConcept[],
    defaultConceptId: typeof parsed.defaultConceptId === "string" ? parsed.defaultConceptId : ((parsed.concepts as CampaignConcept[])[0]?.id ?? ""),
    defaultPrompt: (isObj(parsed.defaultPrompt) ? parsed.defaultPrompt : defaultPrompt(label)) as CampaignPrompt,
    sourceExcerpts: isObj(parsed.sourceExcerpts) ? parsed.sourceExcerpts as Record<string, string> : undefined,
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
  };
  return { ok: true, project };
}

export function exportProjectJson(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export function downloadProjectJson(project: Project) {
  const text = exportProjectJson(project);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.id}.project.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
