import type { BrandProfile, CampaignConcept, Platform, Scene } from "../types";

export type ImportResult =
  | { ok: true; brand?: BrandProfile; concepts?: CampaignConcept[]; recommendation?: string; warnings: string[] }
  | { ok: false; error: string };

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function pickBrand(raw: unknown): BrandProfile | undefined {
  if (!isObj(raw)) return undefined;
  if (typeof raw.projectName !== "string" || typeof raw.oneLiner !== "string" || typeof raw.category !== "string") return undefined;
  return raw as unknown as BrandProfile;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" ? v : fallback;
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function normalizeScene(raw: unknown, idx: number): Scene | undefined {
  if (!isObj(raw)) return undefined;
  return {
    id: asString(raw.id, `s${idx + 1}`),
    startSecond: asNumber(raw.startSecond),
    endSecond: asNumber(raw.endSecond, asNumber(raw.startSecond) + 2),
    visual: asString(raw.visual),
    assetIds: asStringArray(raw.assetIds),
    textOverlay: asString(raw.textOverlay),
    voiceover: typeof raw.voiceover === "string" ? raw.voiceover : undefined,
    motionNotes: asString(raw.motionNotes, "none"),
  };
}

/** Read the first field-name variant that exists (case-insensitive for the leading letter). */
function readField(raw: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) {
    if (raw[n] !== undefined) return raw[n];
  }
  return undefined;
}

function normalizeConcept(raw: unknown, idx: number): CampaignConcept | undefined {
  if (!isObj(raw)) return undefined;
  // Title is required (id auto-generates if missing). Many models use `angle` as the
  // primary descriptor when no separate `title` is given — fall back to it.
  const id = asString(readField(raw, "id"), `concept-${idx + 1}`);
  const title = asString(readField(raw, "title", "name", "angle", "hookLine", "hook"));
  if (!title) return undefined;
  const platform = asString(readField(raw, "platform"), "facebook_reel") as Platform;
  const rawScenes = Array.isArray(raw.scenes) ? raw.scenes : [];
  const scenes = rawScenes.map((s, i) => normalizeScene(s, i)).filter((s): s is Scene => !!s);
  const score = isObj(raw.score) ? raw.score : {};
  return {
    id,
    title,
    platform,
    // Accept several common field-name variants the LLM tends to drift to.
    targetAudience: asString(readField(raw, "targetAudience", "audience", "target")),
    angle: asString(readField(raw, "angle", "approach")),
    hook: asString(readField(raw, "hook", "hookLine", "hook_line", "openingLine")),
    promise: asString(readField(raw, "promise", "promiseLine", "valueProp", "value_prop")),
    format: asString(readField(raw, "format", "template", "templateType")),
    durationSeconds: asNumber(readField(raw, "durationSeconds", "duration", "lengthSeconds"), 15),
    recommendedAssets: asStringArray(readField(raw, "recommendedAssets", "recommendedAssetIds", "assetIds", "assets")),
    missingAssets: asStringArray(readField(raw, "missingAssets", "missing")),
    caption: asString(readField(raw, "caption", "captionText", "postCaption")),
    cta: asString(readField(raw, "cta", "callToAction", "ctaText")),
    scenes,
    score: {
      audienceFit: asNumber(readField(score, "audienceFit", "audience")),
      platformFit: asNumber(readField(score, "platformFit", "platform")),
      assetFit: asNumber(readField(score, "assetFit", "assets")),
      clarity: asNumber(readField(score, "clarity")),
      effort: asNumber(readField(score, "effort")),
      total: asNumber(readField(score, "total", "sum")),
      reason: asString(readField(score, "reason", "rationale", "why")),
    },
  };
}

function pickConcepts(raw: unknown): CampaignConcept[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const valid = raw.map((c, i) => normalizeConcept(c, i)).filter((c): c is CampaignConcept => !!c);
  return valid.length > 0 ? valid : undefined;
}

/**
 * If the LLM returned a separate `storyboard` object (per the mega-prompt schema)
 * with scenes for the recommended concept, fold those scenes back onto the matching
 * concept so the rest of the pipeline has something to work with.
 */
function mergeStoryboardIntoConcepts(concepts: CampaignConcept[], storyboard: unknown): { concepts: CampaignConcept[]; merged: boolean } {
  if (!isObj(storyboard)) return { concepts, merged: false };
  const conceptId = asString(storyboard.conceptId);
  if (!conceptId) return { concepts, merged: false };
  const rawScenes = Array.isArray(storyboard.scenes) ? storyboard.scenes : [];
  const scenes = rawScenes.map((s, i) => normalizeScene(s, i)).filter((s): s is Scene => !!s);
  if (scenes.length === 0) return { concepts, merged: false };

  let merged = false;
  const updated = concepts.map(c => {
    if (c.id !== conceptId) return c;
    merged = true;
    // Only overwrite if the concept doesn't already have scenes
    return c.scenes.length > 0 ? c : { ...c, scenes, durationSeconds: c.durationSeconds || asNumber(storyboard.durationSeconds, 15) };
  });
  return { concepts: updated, merged };
}

function unwrap(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*\n([\s\S]+?)\n```/);
  if (fence) return fence[1]!.trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

export function importCampaignJson(raw: string): ImportResult {
  if (!raw.trim()) return { ok: false, error: "Paste the JSON Claude returned for the mega prompt." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrap(raw));
  } catch (e) {
    return { ok: false, error: `Could not parse JSON: ${(e as Error).message}` };
  }
  if (!isObj(parsed)) return { ok: false, error: "Expected a top-level JSON object." };

  const warnings: string[] = [];
  const brand = pickBrand(parsed.brand);
  let concepts = pickConcepts(parsed.concepts);
  const recommendation = typeof parsed.recommendation === "string" ? parsed.recommendation : undefined;

  // Merge storyboard scenes onto the recommended concept (per mega-prompt schema).
  if (concepts && parsed.storyboard) {
    const { concepts: next, merged } = mergeStoryboardIntoConcepts(concepts, parsed.storyboard);
    concepts = next;
    if (merged) {
      warnings.push("Storyboard scenes were merged onto the recommended concept (the mega-prompt splits concept overview from scenes).");
    }
  }

  if (!brand) {
    warnings.push("No `brand` field found (or it's missing required fields: projectName + oneLiner + category). Brand left unchanged.");
  }
  if (!concepts) {
    // Diagnostics — explain WHY concepts were rejected so the user can see if Claude returned the wrong shape.
    const rawConcepts = parsed.concepts;
    if (rawConcepts === undefined) {
      warnings.push("No `concepts` field in the JSON at all.");
    } else if (!Array.isArray(rawConcepts)) {
      warnings.push(`\`concepts\` was not an array (got ${typeof rawConcepts}).`);
    } else if (rawConcepts.length === 0) {
      warnings.push("`concepts` array was empty.");
    } else {
      const missing = rawConcepts.map((c, i) => {
        if (!isObj(c)) return `[${i}] not an object`;
        // Match the same fallback chain normalizeConcept uses.
        const hasTitle = ["title", "name", "angle", "hookLine", "hook"].some(k => typeof (c as Record<string, unknown>)[k] === "string" && (c as Record<string, unknown>)[k]);
        return hasTitle ? null : `[${i}] missing title (or any of: name / angle / hookLine / hook)`;
      }).filter(Boolean);
      if (missing.length > 0) warnings.push(`Concepts rejected: ${missing.join("; ")}.`);
      else warnings.push("Concepts couldn't be normalized — check the JSON shape against the Expected shape preview.");
    }
  }
  if (!brand && !concepts) return { ok: false, error: `Nothing importable.\n${warnings.join("\n")}` };

  return { ok: true, brand, concepts, recommendation, warnings };
}
