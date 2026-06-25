import { describe, expect, it, vi } from "vitest";
import type { BrandProfile, CampaignConcept, ProjectAsset } from "../types";
import { createRenderSpecFromConcept } from "./renderSpec";
import { runQA } from "./qa";
import { renderPublishingPack } from "./templateUtils";
import { loadState, saveState } from "./storage";
import { parseCodeReview } from "./codeReviewParser";
import { buildAssetMetadataPowerShell, buildAssetShortlistPrompt, buildProjectExportPowerShell, buildWebsiteAuditPrompt } from "./auditPrompt";
import { importCampaignJson } from "./importCampaign";

const brand: BrandProfile = {
  projectName: "Test Shop",
  businessName: "Test Shop",
  category: "woodworking",
  oneLiner: "Custom repair for older homes.",
  offerSummary: "Repair and restoration.",
  targetCustomer: "Homeowners",
  tone: "plainspoken",
  colors: ["#111111"],
  fonts: ["Inter"],
  proofPoints: ["20 years in business"],
  differentiators: ["Careful restoration"],
  avoidClaims: ["cheapest"],
  cta: "Book a consult",
};

const concept: CampaignConcept = {
  id: "concept-1",
  title: "Restore Before Replacing",
  platform: "facebook_reel",
  targetAudience: "Homeowners",
  angle: "Preserve original details",
  hook: "Do not rip out that trim yet.",
  promise: "Show restoration value.",
  format: "reel",
  durationSeconds: 12,
  scenes: [
    {
      id: "s1",
      startSecond: 0,
      endSecond: 4,
      visual: "old trim",
      assetIds: ["asset-1"],
      textOverlay: "Original trim can often be saved",
      voiceover: "Before replacing, check what can be restored.",
    },
    {
      id: "s2",
      startSecond: 4,
      endSecond: 12,
      visual: "finished trim",
      assetIds: ["asset-2"],
      textOverlay: "Repair first. Replace only when needed.",
    },
  ],
  recommendedAssets: ["asset-1", "asset-2"],
  missingAssets: [],
  caption: "A quick look at practical restoration.",
  cta: "Book a consult",
  score: { audienceFit: 8, platformFit: 8, assetFit: 7, clarity: 9, effort: 6, total: 38, reason: "Clear local value." },
};

const assets: ProjectAsset[] = [
  { id: "asset-1", filename: "before.jpg", path: "before.jpg", type: "image", tags: ["before"] },
  { id: "asset-2", filename: "after.jpg", path: "after.jpg", type: "image", tags: ["after"] },
  { id: "asset-3", filename: "detail.jpg", path: "detail.jpg", type: "image", tags: ["detail"] },
  { id: "asset-4", filename: "shop.jpg", path: "shop.jpg", type: "image", tags: ["shop"] },
  { id: "asset-5", filename: "logo.svg", path: "logo.svg", type: "logo", tags: ["logo"] },
];

describe("campaign pipeline", () => {
  it("turns concept scenes into a frame-based render spec", () => {
    const spec = createRenderSpecFromConcept(concept, brand, assets);

    expect(spec.id).toBe("render-concept-1");
    expect(spec.width).toBe(1080);
    expect(spec.height).toBe(1920);
    expect(spec.scenes[0]).toMatchObject({ startFrame: 0, durationFrames: 120, assetIds: ["asset-1"] });
    expect(spec.scenes[1]).toMatchObject({ startFrame: 120, durationFrames: 240, assetIds: ["asset-2"] });
    expect(spec.captions).toEqual([{ startSecond: 0, endSecond: 4, text: "Before replacing, check what can be restored." }]);
  });

  it("keeps QA ready when text is short and assets are sufficient", () => {
    const spec = createRenderSpecFromConcept(concept, brand, assets);
    const report = runQA(concept, spec, brand, assets);

    expect(report.readyToRender).toBe(true);
    expect(report.readability).toBe("good");
    expect(report.assetIssues).toEqual([]);
  });

  it("flags long overlays before render", () => {
    const longConcept = {
      ...concept,
      scenes: [{ ...concept.scenes[0], textOverlay: "This is a very long overlay that will be hard to read on a phone in a fast reel" }],
    };
    const report = runQA(longConcept, createRenderSpecFromConcept(longConcept, brand, assets), brand, assets);

    expect(report.readyToRender).toBe(false);
    expect(report.suggestedFixes).toContain("Shorten one or more text overlays.");
  });

  it("renders a publishing pack with the campaign CTA", () => {
    const pack = renderPublishingPack(concept, brand);

    expect(pack.conceptId).toBe(concept.id);
    expect(pack.caption).toContain(concept.cta);
    expect(pack.hashtags.length).toBeGreaterThan(0);
  });
});

describe("storage helpers", () => {
  it("falls back when saved data cannot be read", () => {
    vi.stubGlobal("localStorage", { getItem: () => "{bad-json" });

    expect(loadState("broken", { ok: true })).toEqual({ ok: true });

    vi.unstubAllGlobals();
  });

  it("does not throw if localStorage writes fail", () => {
    vi.stubGlobal("localStorage", { setItem: () => { throw new Error("quota"); } });
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });

    expect(() => saveState("full", { ok: true })).not.toThrow();

    vi.unstubAllGlobals();
  });
});

describe("project review imports", () => {
  it("parses XML review packs from the PowerShell exporter", () => {
    const parsed = parseCodeReview(`<project_files>
  <file path="package.json"><![CDATA[{"name":"demo-site"}]]></file>
  <file path="src/App.tsx"><![CDATA[export default function App(){ return <main /> }]]></file>
</project_files>`, "demo-site.xml");

    expect(parsed.totalFiles).toBe(2);
    expect(parsed.folderName).toBe("demo-site");
    expect(parsed.assets.map(a => a.path)).toContain("src/App.tsx");
    expect(parsed.sourceExcerpts["package.json"]).toContain("demo-site");
  });

  it("builds a PowerShell export command and website audit prompt", () => {
    const command = buildProjectExportPowerShell("C:\\Sites\\demo-site", "C:\\Users\\me\\Downloads\\demo-site.xml");
    const prompt = buildWebsiteAuditPrompt("Demo Site", { "package.json": "{}" }, assets);

    expect(command).toContain("$projectRoot = \"C:\\Sites\\demo-site\"");
    expect(command).toContain("<project_files>");
    expect(prompt).toContain("Audit this website/application");
    expect(prompt).toContain("Demo Site");
  });

  it("builds asset picker prompts and metadata commands", () => {
    const prompt = buildAssetShortlistPrompt("Demo Site", assets, { "README.md": "# Demo" });
    const command = buildAssetMetadataPowerShell("C:\\Sites\\demo-site", assets);

    expect(prompt).toContain("Pick the assets most likely");
    expect(prompt).toContain('"assetId": ""');
    expect(prompt).toContain('"asset-1"');
    expect(command).toContain("LAUNCHFOUNDRY ASSET METADATA EXPORT");
    expect(command).toContain("$projectRoot = \"C:\\Sites\\demo-site\"");
    expect(command).toContain('"asset-1"');
  });
});

describe("campaign imports", () => {
  it("imports Step 3 product brief JSON as a brand profile", () => {
    const result = importCampaignJson(JSON.stringify({
      projectName: "SRT Fixer",
      businessName: "SRT Fixer",
      category: "developer tool",
      oneLiner: "Fix subtitle timing files quickly.",
      primaryAudience: "Video editors",
      primaryOffer: "A simple subtitle repair workflow",
      voiceAndTone: "helpful and direct",
      visualIdentity: { colors: ["#111111"], fonts: ["Inter"] },
      callsToAction: ["Fix my subtitles"],
      trustSignals: ["local-first"],
      differentiators: ["simple import flow"],
      risksOrMissingContext: ["No pricing shown"],
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.brand?.projectName).toBe("SRT Fixer");
    expect(result.brand?.targetCustomer).toBe("Video editors");
    expect(result.brand?.cta).toBe("Fix my subtitles");
    expect(result.brand?.proofPoints).toContain("local-first");
  });
});
