import { useEffect, useMemo, useRef, useState } from "react";
import Card from "../components/Card";
import { loadState, saveState } from "../lib/storage";
import { DEFAULT_TOKENS, extractBrandTokens, type BrandTokens, type Motif } from "../lib/brandExtract";
import { buildStudioScript, OUTPUT_FORMATS, QUALITY_PRESETS, type OutputFormat, type QualityPreset, type StudioInputs } from "../lib/studioScript";
import { buildClaudeDesignPrompt, parseStudioImport } from "../lib/studioDesignPrompt";
import { buildImagePrompt, fullPrompt, suggestFilename, type ImageProvider } from "../lib/imagePrompt";
import StudioPlayer from "../preview/StudioPlayer";
import { isTauri, renderInApp, cancelRender, openInExplorer, studioInputsToRequest, type LogEvent } from "../lib/tauriBridge";
import { pickStudioDefaultsFor } from "../lib/pickForMe";
import { usePreferences } from "../lib/preferences";

type WizardStep = "source" | "design" | "tokens" | "copy" | "assets" | "render";
const WIZARD_STEPS: { id: WizardStep; label: string; tip: string }[] = [
  { id: "source", label: "1 · Source", tip: "Pick the project folder" },
  { id: "design", label: "2 · Design", tip: "Claude design pass" },
  { id: "tokens", label: "3 · Tokens", tip: "Colors + fonts + motif" },
  { id: "copy", label: "4 · Copy", tip: "Title, steps, CTA" },
  { id: "assets", label: "5 · Assets", tip: "Generate or drop images" },
  { id: "render", label: "6 · Render", tip: "One-click pipeline" },
];

const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "svg"];
const VIDEO_EXT = ["mp4", "webm", "mov"];
const isMedia = (name: string) => {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return IMAGE_EXT.includes(ext) || VIDEO_EXT.includes(ext);
};
const isCss = (name: string) => /\.(css|scss|less)$/i.test(name);
const isSourceText = (name: string) => /readme\.md|package\.json|index\.html/i.test(name);

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "reel";
}

function humanize(s: string): string {
  return s.replace(/[-_]+/g, " ").split(" ").map(w => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type ScanResult = {
  folderName: string;
  mediaFiles: { rel: string; file: File }[];
  cssTexts: string[];
  readmeText: string;
  packageJsonText: string;
  indexHtmlText: string;
};

export default function StudioPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  // Remember the parent workspace path (e.g. "C:\Sites") so future folder picks
  // can auto-derive the full absolute path. Persists across sessions.
  const [workspaceRoot, setWorkspaceRoot] = useState<string>(() => loadState("launchfoundry.studio.workspaceRoot", "C:\\Sites"));
  const [absoluteRoot, setAbsoluteRoot] = useState<string>(() => loadState("launchfoundry.studio.absoluteRoot", ""));
  useEffect(() => saveState("launchfoundry.studio.workspaceRoot", workspaceRoot), [workspaceRoot]);
  useEffect(() => saveState("launchfoundry.studio.absoluteRoot", absoluteRoot), [absoluteRoot]);
  const [tokens, setTokens] = useState<BrandTokens>(DEFAULT_TOKENS);
  const [tagline, setTagline] = useState("Built in your browser.");
  const [oneLiner, setOneLiner] = useState("Free, no signup, runs locally.");
  const [cta, setCta] = useState("Try it free");
  const [url, setUrl] = useState("");
  const [stepCount, setStepCount] = useState(4);
  const [stepLabels, setStepLabels] = useState<string[]>(["GRADE", "CLEARANCE", "DRAG", "FOOTPRINT"]);
  const [stepSubs, setStepSubs] = useState<string[]>(["Rise per turn", "Vertical stack", "Curve resistance", "Outer diameter"]);
  const [stepAssets, setStepAssets] = useState<string[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [designPasteText, setDesignPasteText] = useState("");
  const [designImportMsg, setDesignImportMsg] = useState<{ kind: "ok" | "err"; text: string; warnings?: string[] } | null>(null);
  const [designPromptCopied, setDesignPromptCopied] = useState(false);

  // Wizard state — persists across reloads.
  const [wizardStep, setWizardStep] = useState<WizardStep>(() => loadState("launchfoundry.studio.wizardStep", "source"));
  useEffect(() => saveState("launchfoundry.studio.wizardStep", wizardStep), [wizardStep]);

  // Image-generation state. Per-step provider + dropped file (kept in memory only).
  const [imageProvider, setImageProvider] = useState<ImageProvider>("midjourney");
  const [droppedImages, setDroppedImages] = useState<Record<number, File>>({});
  const droppedImageUrls = useMemo<Record<number, string>>(() => {
    const out: Record<number, string> = {};
    for (const [i, f] of Object.entries(droppedImages)) {
      try { out[Number(i)] = URL.createObjectURL(f); } catch {}
    }
    return out;
  }, [droppedImages]);
  useEffect(() => {
    return () => { for (const url of Object.values(droppedImageUrls)) URL.revokeObjectURL(url); };
  }, [droppedImageUrls]);
  const [stepCopied, setStepCopied] = useState<number | null>(null);

  // Layout-specific extras
  const [kineticPhrases, setKineticPhrases] = useState<string[]>(() => loadState<string[]>("launchfoundry.studio.kineticPhrases", [
    "Stop guessing.",
    "Run the math.",
    "Before you build.",
  ]));
  useEffect(() => saveState("launchfoundry.studio.kineticPhrases", kineticPhrases), [kineticPhrases]);
  const [quoteText, setQuoteText] = useState<string>(() => loadState("launchfoundry.studio.quoteText", "It just works."));
  const [quoteAuthor, setQuoteAuthor] = useState<string>(() => loadState("launchfoundry.studio.quoteAuthor", ""));
  const [quoteRole, setQuoteRole] = useState<string>(() => loadState("launchfoundry.studio.quoteRole", ""));
  const [heroAssetFile, setHeroAssetFile] = useState<string>(() => loadState("launchfoundry.studio.heroAssetFile", ""));
  useEffect(() => saveState("launchfoundry.studio.quoteText", quoteText), [quoteText]);
  useEffect(() => saveState("launchfoundry.studio.quoteAuthor", quoteAuthor), [quoteAuthor]);
  useEffect(() => saveState("launchfoundry.studio.quoteRole", quoteRole), [quoteRole]);
  useEffect(() => saveState("launchfoundry.studio.heroAssetFile", heroAssetFile), [heroAssetFile]);

  // Round A layout-specific state
  const [beforeFile, setBeforeFile] = useState<string>(() => loadState("launchfoundry.studio.beforeFile", ""));
  const [afterFile, setAfterFile] = useState<string>(() => loadState("launchfoundry.studio.afterFile", ""));
  const [beforeLabel, setBeforeLabel] = useState<string>(() => loadState("launchfoundry.studio.beforeLabel", "Before"));
  const [afterLabel, setAfterLabel] = useState<string>(() => loadState("launchfoundry.studio.afterLabel", "After"));
  const [bigNumberValue, setBigNumberValue] = useState<string>(() => loadState("launchfoundry.studio.bnValue", "30"));
  const [bigNumberSuffix, setBigNumberSuffix] = useState<string>(() => loadState("launchfoundry.studio.bnSuffix", "+ yrs"));
  const [bigNumberLabel, setBigNumberLabel] = useState<string>(() => loadState("launchfoundry.studio.bnLabel", "of craftsmanship"));
  const [codeLines, setCodeLines] = useState<string[]>(() => loadState<string[]>("launchfoundry.studio.codeLines", ["$ npm install your-tool", "$ your-tool init"]));
  const [codeOutput, setCodeOutput] = useState<string>(() => loadState("launchfoundry.studio.codeOutput", "✓ Ready."));
  const [deviceScreenshot, setDeviceScreenshot] = useState<string>(() => loadState("launchfoundry.studio.deviceShot", ""));
  const [deviceFrameType, setDeviceFrameType] = useState<"iphone" | "laptop" | "browser">(() => loadState("launchfoundry.studio.deviceFrame", "iphone"));
  useEffect(() => saveState("launchfoundry.studio.beforeFile", beforeFile), [beforeFile]);
  useEffect(() => saveState("launchfoundry.studio.afterFile", afterFile), [afterFile]);
  useEffect(() => saveState("launchfoundry.studio.beforeLabel", beforeLabel), [beforeLabel]);
  useEffect(() => saveState("launchfoundry.studio.afterLabel", afterLabel), [afterLabel]);
  useEffect(() => saveState("launchfoundry.studio.bnValue", bigNumberValue), [bigNumberValue]);
  useEffect(() => saveState("launchfoundry.studio.bnSuffix", bigNumberSuffix), [bigNumberSuffix]);
  useEffect(() => saveState("launchfoundry.studio.bnLabel", bigNumberLabel), [bigNumberLabel]);
  useEffect(() => saveState("launchfoundry.studio.codeLines", codeLines), [codeLines]);
  useEffect(() => saveState("launchfoundry.studio.codeOutput", codeOutput), [codeOutput]);
  useEffect(() => saveState("launchfoundry.studio.deviceShot", deviceScreenshot), [deviceScreenshot]);
  useEffect(() => saveState("launchfoundry.studio.deviceFrame", deviceFrameType), [deviceFrameType]);

  // Round H-3 — Pick-for-me draws on the business type
  const [prefs] = usePreferences();
  const applyPickForMe = () => {
    const defaults = pickStudioDefaultsFor(prefs.businessType);
    setTokens(defaults.tokens);
    setOutputFormats(defaults.outputs);
    setQualityPreset(defaults.quality);
  };

  // Round D — Tauri in-app render state
  const inTauri = isTauri();
  const [renderLogs, setRenderLogs] = useState<LogEvent[]>([]);
  const [renderRunning, setRenderRunning] = useState(false);
  const [renderResult, setRenderResult] = useState<{ produced: string[]; failed: string[] } | null>(null);
  const renderLogsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (renderLogsRef.current) renderLogsRef.current.scrollTop = renderLogsRef.current.scrollHeight; }, [renderLogs]);

  // Round B — render options matrix (aspects + quality preset)
  const [outputFormats, setOutputFormats] = useState<OutputFormat[]>(() => loadState<OutputFormat[]>("launchfoundry.studio.outputs", ["9x16"]));
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>(() => loadState<QualityPreset>("launchfoundry.studio.quality", "standard"));
  useEffect(() => saveState("launchfoundry.studio.outputs", outputFormats), [outputFormats]);
  useEffect(() => saveState("launchfoundry.studio.quality", qualityPreset), [qualityPreset]);
  const toggleOutput = (id: OutputFormat) => setOutputFormats(prev => prev.includes(id) ? prev.filter(o => o !== id) : [...prev, id]);

  // Round F-5 — read the soundtrack dropped on the Music step. The full
  // base64 blob is fine in storage (single track per project) and gets
  // passed straight into the render pipeline. Re-checked on every navigate.
  type DroppedAudio = { filename: string; base64: string; sizeBytes: number };
  const [droppedAudio, setDroppedAudio] = useState<DroppedAudio | null>(() => loadState<DroppedAudio | null>("launchfoundry.music.dropped", null));
  useEffect(() => {
    // Re-read on tab focus so changes from the Music step show up immediately.
    const onFocus = () => setDroppedAudio(loadState<DroppedAudio | null>("launchfoundry.music.dropped", null));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const handlePickFolder = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const folderName = (list[0] as unknown as { webkitRelativePath?: string }).webkitRelativePath?.split("/")[0] ?? "project";

    // Auto-derive the absolute path from the workspace root + folder name,
    // overwriting any stale value from a previous session unless the user
    // already has a matching path typed in.
    const inferred = `${workspaceRoot.replace(/[/\\]+$/, "")}\\${folderName}`;
    const lastSeg = absoluteRoot.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? "";
    if (lastSeg.toLowerCase() !== folderName.toLowerCase()) {
      setAbsoluteRoot(inferred);
    }

    const mediaFiles: ScanResult["mediaFiles"] = [];
    const cssTexts: string[] = [];
    let readmeText = "", packageJsonText = "", indexHtmlText = "";
    const urls: Record<string, string> = {};

    for (const f of list) {
      const rel = (f as unknown as { webkitRelativePath?: string }).webkitRelativePath ?? f.name;
      const name = rel.split("/").pop() ?? rel;
      if (rel.includes("/node_modules/") || rel.includes("/.next/") || rel.includes("/dist/")) continue;

      if (isMedia(name)) {
        const inProj = rel.split("/").slice(1).join("/");
        mediaFiles.push({ rel: inProj, file: f });
        try { urls[inProj] = URL.createObjectURL(f); } catch {}
      } else if (isCss(name)) {
        try { cssTexts.push(await f.text()); } catch {}
      } else if (isSourceText(name)) {
        try {
          const text = await f.text();
          if (/readme\.md$/i.test(name) && !readmeText) readmeText = text;
          else if (/package\.json$/i.test(name) && !packageJsonText) packageJsonText = text;
          else if (/index\.html$/i.test(name) && !indexHtmlText) indexHtmlText = text;
        } catch {}
      }
    }

    const next: ScanResult = { folderName, mediaFiles, cssTexts, readmeText, packageJsonText, indexHtmlText };
    setScan(next);
    setPreviewUrls(urls);

    // Auto-extract brand tokens
    const t = extractBrandTokens(cssTexts);
    setTokens(t);

    // Infer copy hints
    if (packageJsonText) {
      try {
        const pkg = JSON.parse(packageJsonText);
        if (pkg.description) setOneLiner(pkg.description);
      } catch {}
    }
    const titleMatch = indexHtmlText.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      const parts = titleMatch[1]!.split(/[|·—–-]/).map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) setTagline(parts[1]!);
    }

    // Seed step assets with the first 4 media files
    setStepAssets(mediaFiles.slice(0, 4).map(m => m.rel.split("/").pop()!));

    // Suggest URL from index.html canonical or first https in package.json
    const canonical = indexHtmlText.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
    if (canonical) setUrl(canonical[1]!.replace(/^https?:\/\//, "").replace(/\/$/, ""));
  };

  const projectName = useMemo(() => humanize(scan?.folderName ?? "Project"), [scan]);
  const slug = useMemo(() => slugify(`${scan?.folderName ?? "reel"}-${tagline}`).slice(0, 40), [scan, tagline]);

  const designPrompt = useMemo(() => {
    if (!scan) return "";
    return buildClaudeDesignPrompt({
      folderName: scan.folderName,
      cssTexts: scan.cssTexts,
      readmeText: scan.readmeText,
      packageJsonText: scan.packageJsonText,
      indexHtmlText: scan.indexHtmlText,
      assetFilenames: scan.mediaFiles.map(m => m.rel.split("/").pop()!),
    });
  }, [scan]);

  const handleImportDesign = () => {
    const result = parseStudioImport(designPasteText);
    if (!result.ok) { setDesignImportMsg({ kind: "err", text: result.error }); return; }
    const v = result.value;
    if (v.tokens) {
      setTokens(prev => ({
        background: v.tokens?.background ?? prev.background,
        surface: v.tokens?.surface ?? prev.surface,
        text: v.tokens?.text ?? prev.text,
        textSoft: v.tokens?.textSoft ?? prev.textSoft,
        accent: v.tokens?.accent ?? prev.accent,
        accentSoft: v.tokens?.accentSoft ?? prev.accentSoft,
        fontDisplay: v.tokens?.fontDisplay ?? prev.fontDisplay,
        fontBody: v.tokens?.fontBody ?? prev.fontBody,
        googleFontsHref: v.tokens?.googleFontsHref ?? prev.googleFontsHref,
        motif: v.tokens?.motif ?? prev.motif,
      }));
    }
    if (v.copy) {
      if (v.copy.tagline) setTagline(v.copy.tagline);
      if (v.copy.oneLiner) setOneLiner(v.copy.oneLiner);
      if (v.copy.cta) setCta(v.copy.cta);
      if (v.copy.url) setUrl(v.copy.url);
    }
    if (v.steps && v.steps.length > 0) {
      setStepLabels(v.steps.map(s => s.label));
      setStepSubs(v.steps.map(s => s.sub));
      setStepCount(Math.min(4, v.steps.length));
      // Try to match suggestedAssetHint to actual filenames.
      if (scan) {
        const matched = v.steps.map(s => {
          const hint = (s.suggestedAssetHint ?? "").toLowerCase();
          const hit = scan.mediaFiles.map(m => m.rel.split("/").pop()!).find(f => hint.includes(f.toLowerCase()));
          return hit ?? "";
        });
        setStepAssets(matched);
      }
    }
    const parts: string[] = [];
    if (v.tokens) parts.push("tokens");
    if (v.copy) parts.push("copy");
    if (v.steps?.length) parts.push(`${v.steps.length} steps`);
    setDesignImportMsg({
      kind: "ok",
      text: `Imported ${parts.join(" + ")}.${v.personality?.feel ? " Feel: " + v.personality.feel : ""}`,
      warnings: [...result.warnings, ...(v.notes ?? [])],
    });
    setDesignPasteText("");
  };

  // Track base64 representations of dropped images so the script can embed them.
  const [droppedBase64, setDroppedBase64] = useState<Record<number, string>>({});
  useEffect(() => {
    // Recompute base64 whenever droppedImages changes.
    let cancelled = false;
    (async () => {
      const out: Record<number, string> = {};
      for (const [idx, file] of Object.entries(droppedImages)) {
        const buf = await file.arrayBuffer();
        let bin = "";
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
        out[Number(idx)] = btoa(bin);
      }
      if (!cancelled) setDroppedBase64(out);
    })();
    return () => { cancelled = true; };
  }, [droppedImages]);

  const studioInputs = useMemo<StudioInputs | null>(() => {
    if (!scan || !absoluteRoot.trim()) return null;
    const droppedFilenames = new Set(Object.values(droppedImages).map(f => f.name));
    return {
      projectName,
      projectHomeWin: absoluteRoot.replace(/[/\\]+$/, "").replace(/\//g, "\\"),
      reelsEngineWin: "C:\\Sites\\brittenwoodworking-reels",
      slug,
      oneLiner,
      tagline,
      cta,
      url,
      steps: stepLabels.slice(0, stepCount).map((label, i) => ({
        label,
        sub: stepSubs[i] ?? "",
        assetFile: stepAssets[i] ?? "",
      })),
      tokens,
      // Project-folder assets (not the dropped ones — those are embedded separately)
      assetSources: scan.mediaFiles
        .filter(m => {
          const base = m.rel.split("/").pop() ?? "";
          const layoutSpecific =
            (tokens.layout === "parallax-hero" && base === heroAssetFile) ||
            (tokens.layout === "before-after" && (base === beforeFile || base === afterFile)) ||
            (tokens.layout === "device-frame" && base === deviceScreenshot);
          const referenced = stepAssets.includes(base) || layoutSpecific;
          return referenced && !droppedFilenames.has(base);
        })
        .map(m => m.rel),
      droppedImages: Object.entries(droppedImages)
        .map(([idx, f]) => ({
          filename: f.name,
          base64: droppedBase64[Number(idx)] ?? "",
        }))
        .filter(d => d.base64.length > 0),
      kineticPhrases,
      quote: { text: quoteText, author: quoteAuthor || projectName, role: quoteRole || undefined },
      heroAssetFile: heroAssetFile || undefined,
      beforeAfter: beforeFile && afterFile ? { before: beforeFile, after: afterFile, beforeLabel, afterLabel } : undefined,
      bigNumber: { value: bigNumberValue, suffix: bigNumberSuffix, label: bigNumberLabel },
      codeReveal: { lines: codeLines.filter(l => l.trim().length > 0), output: codeOutput },
      deviceFrame: deviceScreenshot ? { screenshot: deviceScreenshot, frame: deviceFrameType, caption: tagline } : undefined,
      outputs: outputFormats.length ? outputFormats : ["9x16"],
      quality: qualityPreset,
      audioFilename: droppedAudio?.filename,
      audioBase64: droppedAudio?.base64,
    };
  }, [scan, absoluteRoot, projectName, slug, oneLiner, tagline, cta, url, stepLabels, stepSubs, stepAssets, stepCount, tokens, droppedImages, droppedBase64, kineticPhrases, quoteText, quoteAuthor, quoteRole, heroAssetFile, beforeFile, afterFile, beforeLabel, afterLabel, bigNumberValue, bigNumberSuffix, bigNumberLabel, codeLines, codeOutput, deviceScreenshot, deviceFrameType, outputFormats, qualityPreset, droppedAudio]);

  const script = useMemo(() => (studioInputs ? buildStudioScript(studioInputs) : ""), [studioInputs]);

  const pathLastSegment = absoluteRoot.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? "";
  const pathMismatch = !!scan && !!absoluteRoot.trim() && pathLastSegment.toLowerCase() !== scan.folderName.toLowerCase();

  const blocking: string | null = !scan ? "Pick a project folder above to begin."
    : !absoluteRoot.trim() ? `Absolute path is empty — should be ${workspaceRoot}\\${scan.folderName}.`
    : pathMismatch ? `Absolute path ends in "${pathLastSegment}" but the picked folder is "${scan.folderName}". Fix the mismatch above before rendering.`
    : scan.mediaFiles.length === 0 ? "No image/video files found in the picked folder."
    : stepAssets.filter(Boolean).length === 0 ? "Pick at least one asset for the steps below."
    : null;

  const updateLabel = (i: number, v: string) => setStepLabels(prev => Object.assign([...prev], { [i]: v }));
  const updateSub = (i: number, v: string) => setStepSubs(prev => Object.assign([...prev], { [i]: v }));
  const updateAsset = (i: number, v: string) => setStepAssets(prev => Object.assign([...prev], { [i]: v }));

  const currentIdx = WIZARD_STEPS.findIndex(s => s.id === wizardStep);
  const goNext = () => { if (currentIdx < WIZARD_STEPS.length - 1) setWizardStep(WIZARD_STEPS[currentIdx + 1]!.id); };
  const goPrev = () => { if (currentIdx > 0) setWizardStep(WIZARD_STEPS[currentIdx - 1]!.id); };

  const stepCompletion: Record<WizardStep, boolean> = {
    source: !!scan && !!absoluteRoot.trim() && !pathMismatch,
    design: !!scan,                                            // optional — never blocks
    tokens: !!scan,                                            // optional refinement
    copy: !!scan && tagline.trim().length > 0 && oneLiner.trim().length > 0,
    assets: !!scan && stepAssets.slice(0, stepCount).every(a => a && a.length > 0),
    render: !blocking,
  };

  return (
    <div className="page">
      <h1>Reels Studio</h1>
      <p className="lede">
        Wizard from project folder to rendered MP4. Each step persists across sessions — close the tab and come back. Image generation prompts let you commission hero shots externally and drop them in.
      </p>

      <div className="wizard-nav">
        {WIZARD_STEPS.map((s, i) => {
          const isCurrent = s.id === wizardStep;
          const isDone = stepCompletion[s.id];
          return (
            <button
              key={s.id}
              className={`wizard-tab${isCurrent ? " wizard-tab--current" : ""}${isDone ? " wizard-tab--done" : ""}`}
              onClick={() => setWizardStep(s.id)}
              disabled={i > 0 && !scan && s.id !== "source"}
              title={s.tip}
            >
              <span className="wizard-tab__num">{isDone ? "✓" : i + 1}</span>
              <span className="wizard-tab__label">{s.label.split(" · ")[1]}</span>
            </button>
          );
        })}
      </div>

      {wizardStep === "source" && (
      <Card title="1 · Pick the project folder" eyebrow="Source">
        <div className="grid two">
          <label>
            Workspace root (where all projects live)
            <input
              value={workspaceRoot}
              onChange={e => setWorkspaceRoot(e.target.value)}
              placeholder="C:\Sites"
            />
          </label>
          <label>
            Absolute path to this project
            <input
              value={absoluteRoot}
              onChange={e => setAbsoluteRoot(e.target.value)}
              placeholder={`${workspaceRoot}\\<folder-name>`}
              style={pathMismatch ? { borderColor: "var(--danger, #c97a4a)" } : undefined}
            />
          </label>
        </div>
        <div className="button-row" style={{ marginTop: 8 }}>
          <button onClick={() => fileInputRef.current?.click()}>{scan ? "Pick another folder" : "Pick folder…"}</button>
          {scan && (
            <span style={{ color: "var(--muted)", fontSize: 13, alignSelf: "center" }}>
              <strong>{scan.folderName}</strong> · {scan.mediaFiles.length} media · {scan.cssTexts.length} CSS files read
            </span>
          )}
        </div>
        {pathMismatch && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "rgba(201, 122, 74, 0.12)",
              borderLeft: "3px solid var(--danger, #c97a4a)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <strong>Path mismatch.</strong> You picked folder <code>{scan?.folderName}</code> but the absolute path ends in <code>{(absoluteRoot.replace(/[/\\]+$/, "").split(/[/\\]/).pop()) || "(empty)"}</code>. The render script will write to the wrong place.{" "}
            <button
              onClick={() => setAbsoluteRoot(`${workspaceRoot.replace(/[/\\]+$/, "")}\\${scan?.folderName}`)}
              style={{ marginLeft: 8, padding: "4px 10px", fontSize: 12 }}
            >
              Fix to {workspaceRoot}\{scan?.folderName}
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          // @ts-expect-error — non-standard
          webkitdirectory=""
          directory=""
          multiple
          style={{ display: "none" }}
          onChange={e => handlePickFolder(e.target.files)}
        />
      </Card>
      )}

      {scan && wizardStep === "design" && (
        <>
          <Card
            title="2 · Claude design pass"
            eyebrow="Smarter than the regex extractor"
            action={
              <div className="button-row">
                <button
                  className="primary"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(designPrompt); } catch {}
                    setDesignPromptCopied(true);
                    setTimeout(() => setDesignPromptCopied(false), 1500);
                  }}
                >
                  {designPromptCopied ? "Copied" : "Copy design prompt"}
                </button>
                <button
                  onClick={() => downloadText(`design-${slugify(scan.folderName)}.md`, designPrompt)}
                >
                  Download
                </button>
              </div>
            }
          >
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
              Auto-built prompt with this project's CSS, README, index.html, and asset filenames inlined ({(designPrompt.length / 1024).toFixed(1)} KB).
              Paste into Claude → returns a richer design JSON than the regex pass below can. Paste the JSON back in the box and it overrides the auto-extracted tokens + copy + steps.
            </p>
            <label>Paste Claude's design JSON
              <textarea
                rows={6}
                value={designPasteText}
                onChange={e => setDesignPasteText(e.target.value)}
                placeholder='{ "tokens": { … }, "copy": { … }, "steps": [ … ] }'
                style={{ fontFamily: "var(--mono)", fontSize: 12 }}
              />
            </label>
            <div className="button-row">
              <button className="primary" disabled={!designPasteText.trim()} onClick={handleImportDesign}>
                Import design JSON
              </button>
              {designImportMsg && (
                <span style={{ color: designImportMsg.kind === "ok" ? "var(--accent)" : "var(--danger, #c97a4a)", fontSize: 13, alignSelf: "center" }}>
                  {designImportMsg.text}
                </span>
              )}
            </div>
            {designImportMsg?.warnings && designImportMsg.warnings.length > 0 && (
              <ul style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
                {designImportMsg.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </Card>
        </>
      )}

      {scan && wizardStep === "tokens" && (
        <>
          <Card
            title="3 · Brand tokens"
            eyebrow={`Auto-extracted from ${scan.cssTexts.length} CSS file(s) — tweak if wrong`}
            action={prefs.businessType && <button className="pick-for-me" onClick={applyPickForMe}>Pick for me</button>}
          >
            <div className="grid two">
              <label>Background<input type="color" value={tokens.background} onChange={e => setTokens({ ...tokens, background: e.target.value })} /></label>
              <label>Text<input type="color" value={tokens.text} onChange={e => setTokens({ ...tokens, text: e.target.value })} /></label>
              <label>Accent<input type="color" value={tokens.accent} onChange={e => setTokens({ ...tokens, accent: e.target.value })} /></label>
              <label>Surface<input type="color" value={tokens.surface} onChange={e => setTokens({ ...tokens, surface: e.target.value })} /></label>
            </div>
            <div className="grid two">
              <label>Display font<input value={tokens.fontDisplay} onChange={e => setTokens({ ...tokens, fontDisplay: e.target.value })} /></label>
              <label>Body font<input value={tokens.fontBody} onChange={e => setTokens({ ...tokens, fontBody: e.target.value })} /></label>
            </div>
            <label>Visual motif (background flavor)
              <select value={tokens.motif} onChange={e => setTokens({ ...tokens, motif: e.target.value as Motif })}>
                <optgroup label="Default flavors">
                  <option value="graph-paper">Graph paper (engineering-notebook)</option>
                  <option value="editorial">Editorial (rules + spacing)</option>
                  <option value="gradient">Gradient (warm radial wash)</option>
                  <option value="minimal">Minimal (solid bg)</option>
                  <option value="blueprint">Blueprint (dark grid)</option>
                  <option value="mono">Mono (subtle row lines)</option>
                </optgroup>
                <optgroup label="Round A additions">
                  <option value="dot-grid">Dot grid (designer-shop softness)</option>
                  <option value="vintage-paper">Vintage paper (warm grain for craft / restoration)</option>
                  <option value="terminal-green">Terminal green (CRT phosphor for dev tools)</option>
                  <option value="scan-lines">Scan lines (CRT scan + vignette for retro tech)</option>
                </optgroup>
              </select>
            </label>
            <label>Composition layout (scene structure)
              <select value={tokens.layout ?? "step-walkthrough"} onChange={e => setTokens({ ...tokens, layout: e.target.value as NonNullable<BrandTokens["layout"]> })}>
                <optgroup label="Original four">
                  <option value="step-walkthrough">Step walkthrough — title + 2-4 numbered steps + end card (needs images per step)</option>
                  <option value="kinetic-text">Kinetic typography — pure text reel, no images needed</option>
                  <option value="parallax-hero">Parallax hero — one image, layered zoom + caption crawl (needs ONE strong shot)</option>
                  <option value="quote-card">Quote card — big italic quote + attribution (no images needed)</option>
                </optgroup>
                <optgroup label="Round A additions">
                  <option value="before-after">Before / after — two images split by a diagonal brass wipe</option>
                  <option value="big-number">Big number / stat — one enormous figure with context</option>
                  <option value="code-reveal">Code reveal — typewriter terminal lines + output (dev tools)</option>
                  <option value="device-frame">Device frame — screenshot inside iPhone / laptop / browser chrome</option>
                </optgroup>
              </select>
            </label>
            <label>Google Fonts URL
              <input value={tokens.googleFontsHref} onChange={e => setTokens({ ...tokens, googleFontsHref: e.target.value })} />
            </label>
            <div style={{ marginTop: 14, padding: 18, borderRadius: 8, background: tokens.background, color: tokens.text, border: "1px solid var(--line)" }}>
              <div style={{ fontFamily: tokens.fontBody, fontSize: 11, letterSpacing: "0.3em", color: tokens.accent, marginBottom: 12 }}>SAMPLE</div>
              <div style={{ fontFamily: tokens.fontDisplay, fontSize: 36, fontWeight: 700, lineHeight: 1.1 }}>{tagline}</div>
              <div style={{ marginTop: 12, height: 2, width: 80, background: tokens.accent }} />
              <div style={{ marginTop: 12, fontFamily: tokens.fontBody, fontSize: 14, color: tokens.textSoft }}>{oneLiner}</div>
            </div>
          </Card>
        </>
      )}

      {scan && wizardStep === "copy" && (
        <>
          {(tokens.layout ?? "step-walkthrough") === "kinetic-text" && (
            <Card title="4 · Kinetic phrases" eyebrow="Pure typography reel — 3-8 short lines">
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--muted)" }}>
                Each phrase fills the screen one at a time, word-by-word. Keep them short (≤ 5 words) and punchy.
              </p>
              {kineticPhrases.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    value={p}
                    onChange={e => setKineticPhrases(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                    placeholder="A short kinetic phrase"
                  />
                  <button onClick={() => setKineticPhrases(prev => prev.filter((_, j) => j !== i))} style={{ padding: "6px 10px" }}>×</button>
                </div>
              ))}
              <button onClick={() => setKineticPhrases(prev => [...prev, ""])} disabled={kineticPhrases.length >= 8}>+ Add phrase</button>
            </Card>
          )}
          {(tokens.layout ?? "step-walkthrough") === "quote-card" && (
            <Card title="4 · Quote" eyebrow="Single big quote + attribution">
              <label>Quote text<textarea rows={3} value={quoteText} onChange={e => setQuoteText(e.target.value)} placeholder="It just works." /></label>
              <div className="grid two">
                <label>Author<input value={quoteAuthor} onChange={e => setQuoteAuthor(e.target.value)} placeholder="Jane Doe" /></label>
                <label>Role (optional)<input value={quoteRole} onChange={e => setQuoteRole(e.target.value)} placeholder="Indie creator" /></label>
              </div>
            </Card>
          )}
          {(tokens.layout ?? "step-walkthrough") === "parallax-hero" && (
            <Card title="4 · Hero asset" eyebrow="Parallax over one strong image">
              <label>Pick the hero image
                <select value={heroAssetFile} onChange={e => setHeroAssetFile(e.target.value)}>
                  <option value="">— pick from detected media —</option>
                  {scan.mediaFiles.map(m => {
                    const base = m.rel.split("/").pop()!;
                    return <option key={m.rel} value={base}>{base}</option>;
                  })}
                </select>
              </label>
            </Card>
          )}
          {(tokens.layout ?? "step-walkthrough") === "before-after" && (
            <Card title="4 · Before / after" eyebrow="Diagonal brass wipe between two images">
              <div className="grid two">
                <label>Before image
                  <select value={beforeFile} onChange={e => setBeforeFile(e.target.value)}>
                    <option value="">— pick —</option>
                    {scan.mediaFiles.map(m => { const base = m.rel.split("/").pop()!; return <option key={m.rel} value={base}>{base}</option>; })}
                  </select>
                </label>
                <label>After image
                  <select value={afterFile} onChange={e => setAfterFile(e.target.value)}>
                    <option value="">— pick —</option>
                    {scan.mediaFiles.map(m => { const base = m.rel.split("/").pop()!; return <option key={m.rel} value={base}>{base}</option>; })}
                  </select>
                </label>
              </div>
              <div className="grid two">
                <label>Before label<input value={beforeLabel} onChange={e => setBeforeLabel(e.target.value)} /></label>
                <label>After label<input value={afterLabel} onChange={e => setAfterLabel(e.target.value)} /></label>
              </div>
            </Card>
          )}
          {(tokens.layout ?? "step-walkthrough") === "big-number" && (
            <Card title="4 · Big number" eyebrow="One enormous stat with context">
              <div className="grid two">
                <label>The number<input value={bigNumberValue} onChange={e => setBigNumberValue(e.target.value)} placeholder="30" /></label>
                <label>Suffix / unit<input value={bigNumberSuffix} onChange={e => setBigNumberSuffix(e.target.value)} placeholder="+ yrs" /></label>
              </div>
              <label>Label / context<input value={bigNumberLabel} onChange={e => setBigNumberLabel(e.target.value)} placeholder="of craftsmanship" /></label>
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)" }}>
                Pure integer values get a spring count-up animation. Non-numeric strings (e.g. "Free") appear instantly.
              </p>
            </Card>
          )}
          {(tokens.layout ?? "step-walkthrough") === "code-reveal" && (
            <Card title="4 · Code reveal" eyebrow="Typewriter terminal aesthetic">
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>
                Each line types out left-to-right. Lines starting with <code>$</code> show without a prompt prefix; others get a <code>{">"}</code>.
              </p>
              {codeLines.map((line, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    value={line}
                    onChange={e => setCodeLines(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                    placeholder="$ command --flag"
                    style={{ fontFamily: "var(--mono)" }}
                  />
                  <button onClick={() => setCodeLines(prev => prev.filter((_, j) => j !== i))} style={{ padding: "6px 10px" }}>×</button>
                </div>
              ))}
              <button onClick={() => setCodeLines(prev => [...prev, ""])} disabled={codeLines.length >= 6}>+ Add line</button>
              <label style={{ marginTop: 12 }}>Final output (optional)
                <input value={codeOutput} onChange={e => setCodeOutput(e.target.value)} placeholder="✓ Ready." style={{ fontFamily: "var(--mono)" }} />
              </label>
            </Card>
          )}
          {(tokens.layout ?? "step-walkthrough") === "device-frame" && (
            <Card title="4 · Device frame" eyebrow="Screenshot inside iPhone / laptop / browser chrome">
              <div className="grid two">
                <label>Screenshot
                  <select value={deviceScreenshot} onChange={e => setDeviceScreenshot(e.target.value)}>
                    <option value="">— pick —</option>
                    {scan.mediaFiles.map(m => { const base = m.rel.split("/").pop()!; return <option key={m.rel} value={base}>{base}</option>; })}
                  </select>
                </label>
                <label>Frame
                  <select value={deviceFrameType} onChange={e => setDeviceFrameType(e.target.value as "iphone" | "laptop" | "browser")}>
                    <option value="iphone">iPhone (vertical, fits 9:16 best)</option>
                    <option value="laptop">Laptop (landscape lid)</option>
                    <option value="browser">Browser window (traffic lights)</option>
                  </select>
                </label>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)" }}>
                The caption beneath the device uses your tagline (set in the Copy structure below).
              </p>
            </Card>
          )}
          <Card title="4 · Copy + structure" eyebrow="What the reel says">
            <label>Tagline (end card)<input value={tagline} onChange={e => setTagline(e.target.value)} /></label>
            <label>One-liner (overlay + caption)<input value={oneLiner} onChange={e => setOneLiner(e.target.value)} /></label>
            <div className="grid two">
              <label>CTA<input value={cta} onChange={e => setCta(e.target.value)} /></label>
              <label>URL<input value={url} onChange={e => setUrl(e.target.value)} placeholder="will-my-helix-work.vercel.app" /></label>
            </div>
            <label>Number of steps
              <select value={stepCount} onChange={e => setStepCount(Number(e.target.value))}>
                <option value={2}>2 steps</option>
                <option value={3}>3 steps</option>
                <option value={4}>4 steps</option>
              </select>
            </label>
            {Array.from({ length: stepCount }).map((_, i) => (
              <div key={i} className="grid" style={{ gridTemplateColumns: "1fr 2fr 2fr", gap: 10, marginBottom: 8 }}>
                <label>Step {i + 1} label<input value={stepLabels[i] ?? ""} onChange={e => updateLabel(i, e.target.value)} /></label>
                <label>Sub<input value={stepSubs[i] ?? ""} onChange={e => updateSub(i, e.target.value)} /></label>
                <label>Asset
                  <select value={stepAssets[i] ?? ""} onChange={e => updateAsset(i, e.target.value)}>
                    <option value="">— pick —</option>
                    {scan.mediaFiles.map(m => {
                      const base = m.rel.split("/").pop()!;
                      return <option key={m.rel} value={base}>{base}</option>;
                    })}
                    {Object.entries(droppedImages).map(([idx, f]) => {
                      if (Number(idx) !== i) return null;
                      return <option key={`dropped-${i}`} value={f.name}>{f.name} (just dropped)</option>;
                    })}
                  </select>
                </label>
              </div>
            ))}
          </Card>
        </>
      )}

      {scan && wizardStep === "assets" && (
        <>
          <Card title="5 · Generate or drop images" eyebrow="Image gen per scene">
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
              For each scene below, copy an image prompt tuned to your brand tokens + motif, paste into your image gen tool, then drag the resulting PNG onto its slot. Dropped images replace the file picker for that scene and ride along in the final render script.
            </p>
            <label>Generator
              <select value={imageProvider} onChange={e => setImageProvider(e.target.value as ImageProvider)}>
                <option value="midjourney">MidJourney</option>
                <option value="dalle">DALL·E / GPT Image</option>
                <option value="sora">Sora (still)</option>
                <option value="flux">Flux.1 Pro</option>
                <option value="ideogram">Ideogram</option>
              </select>
            </label>
            {Array.from({ length: stepCount }).map((_, i) => {
              const label = stepLabels[i] ?? `Scene ${i + 1}`;
              const sub = stepSubs[i] ?? "";
              const subject = `${sub || label.toLowerCase()} — illustrating "${label}" for ${projectName}`;
              const prompt = fullPrompt({
                subject,
                context: `step ${i + 1} of a ${stepCount}-step social reel for ${projectName}`,
                brandName: projectName,
                tokens,
              }, imageProvider);
              const dropped = droppedImages[i];
              const droppedUrl = droppedImageUrls[i];
              return (
                <div key={i} style={{ marginTop: 18, padding: 14, border: "1px solid var(--line)", borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <strong style={{ fontFamily: "var(--font-display)" }}>Step {i + 1} · {label}</strong>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</span>
                  </div>
                  <textarea
                    readOnly
                    rows={3}
                    value={prompt}
                    style={{ fontFamily: "var(--mono)", fontSize: 12, marginBottom: 8 }}
                  />
                  <div className="button-row" style={{ flexWrap: "wrap" }}>
                    <button
                      className="primary"
                      onClick={async () => {
                        try { await navigator.clipboard.writeText(prompt); } catch {}
                        setStepCopied(i);
                        setTimeout(() => setStepCopied(prev => (prev === i ? null : prev)), 1500);
                      }}
                    >
                      {stepCopied === i ? "Copied" : `Copy ${imageProvider} prompt`}
                    </button>
                    <label style={{ display: "inline-flex", alignItems: "center", margin: 0, padding: "8px 12px", border: "1px solid var(--line2)", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
                      Drop PNG here…
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        style={{ display: "none" }}
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const targetName = suggestFilename(projectName, label, f.name.split(".").pop() ?? "png");
                          const renamed = new File([f], targetName, { type: f.type });
                          setDroppedImages(prev => ({ ...prev, [i]: renamed }));
                          updateAsset(i, targetName);
                        }}
                      />
                    </label>
                    {dropped && (
                      <span style={{ fontSize: 12, color: "var(--accent)", alignSelf: "center" }}>
                        ✓ {dropped.name} ({(dropped.size / 1024).toFixed(0)} KB)
                      </span>
                    )}
                  </div>
                  {droppedUrl && (
                    <div style={{ marginTop: 10, padding: 8, background: "rgba(0,0,0,0.2)", borderRadius: 6, display: "inline-block" }}>
                      <img src={droppedUrl} alt={dropped?.name} style={{ maxHeight: 140, display: "block", borderRadius: 4 }} />
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </>
      )}

      {scan && wizardStep === "render" && (
        <>
          <Card title="Live preview" eyebrow="Plays in your browser · 1080×1920 · 30fps">
            <StudioPlayer
              tokens={tokens}
              tagline={tagline}
              oneLiner={oneLiner}
              cta={cta}
              projectName={projectName}
              url={url || undefined}
              slug={slug}
              layoutSupported={!tokens.layout || tokens.layout === "step-walkthrough"}
              audioFilename={droppedAudio?.filename}
              audioBase64={droppedAudio?.base64}
              steps={stepLabels.slice(0, stepCount).map((label, i) => {
                // 1. Per-step drop-zone image — keyed by step index, wins outright.
                const dropped = droppedImages[i];
                if (dropped) return { label, sub: stepSubs[i] ?? "", file: dropped };
                // 2. Asset selected from the scanned project folder — matched by basename.
                const assetName = stepAssets[i] ?? "";
                const media = scan?.mediaFiles.find(m => (m.rel.split("/").pop() ?? "") === assetName);
                if (media) return { label, sub: stepSubs[i] ?? "", file: media.file };
                return { label, sub: stepSubs[i] ?? "" };
              })}
            />
          </Card>

          <Card
            title="Render options"
            eyebrow="Aspect ratios + quality preset"
            action={prefs.businessType && <button className="pick-for-me" onClick={applyPickForMe}>Pick for me</button>}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <strong style={{ display: "block", marginBottom: 8, fontSize: 13, letterSpacing: 1, color: "var(--accent)" }}>OUTPUT FORMATS</strong>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                  {OUTPUT_FORMATS.map(fmt => {
                    const picked = outputFormats.includes(fmt.id);
                    return (
                      <label key={fmt.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", border: `1px solid ${picked ? "var(--accent)" : "var(--border)"}`, background: picked ? "var(--accentSoft, rgba(184,134,78,0.08))" : "transparent", cursor: "pointer", lineHeight: 1.4 }}>
                        <input type="checkbox" checked={picked} onChange={() => toggleOutput(fmt.id)} style={{ marginTop: 3 }} />
                        <span style={{ flex: 1 }}>
                          <strong style={{ display: "block", fontSize: 13 }}>{fmt.label} <span style={{ color: "var(--muted)", fontWeight: 400 }}>{fmt.width}×{fmt.height}</span></strong>
                          <span style={{ fontSize: 11, color: "var(--muted)" }}>{fmt.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {outputFormats.length === 0 && (
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--danger, #c97a4a)" }}>Pick at least one format. Defaults to 9:16 if none are selected.</p>
                )}
              </div>

              <div>
                <strong style={{ display: "block", marginBottom: 8, fontSize: 13, letterSpacing: 1, color: "var(--accent)" }}>QUALITY PRESET</strong>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {QUALITY_PRESETS.map(p => {
                    const picked = qualityPreset === p.id;
                    return (
                      <label key={p.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", border: `1px solid ${picked ? "var(--accent)" : "var(--border)"}`, background: picked ? "var(--accentSoft, rgba(184,134,78,0.08))" : "transparent", cursor: "pointer", lineHeight: 1.4 }}>
                        <input type="radio" name="qualityPreset" checked={picked} onChange={() => setQualityPreset(p.id)} style={{ marginTop: 3 }} />
                        <span style={{ flex: 1 }}>
                          <strong style={{ display: "block", fontSize: 13 }}>{p.label} <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 11 }}>scale={p.scale} crf={p.crf}</span></strong>
                          <span style={{ fontSize: 11, color: "var(--muted)" }}>{p.speedHint}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          {inTauri && (
            <Card title="6 · Render in app" eyebrow="Native — no PowerShell, no SmartScreen">
              {blocking ? (
                <div style={{ padding: "10px 14px", background: "rgba(201, 122, 74, 0.12)", borderLeft: "3px solid var(--danger, #c97a4a)", fontSize: 13 }}>
                  {blocking}
                </div>
              ) : (
                <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
                  Runs the same pipeline as the script — composition files written, engine deps pinned, junction created, {outputFormats.length || 1} render(s) at <strong>{(QUALITY_PRESETS.find(q => q.id === qualityPreset)?.label) ?? "Standard"}</strong> quality — all from inside this window. Live log below. MP4s land in <code>{absoluteRoot}\out\</code>.
                </p>
              )}
              <div className="button-row">
                <button
                  className="primary"
                  disabled={!!blocking || renderRunning || !studioInputs}
                  onClick={async () => {
                    if (!studioInputs) return;
                    setRenderLogs([]);
                    setRenderResult(null);
                    setRenderRunning(true);
                    try {
                      const req = studioInputsToRequest(studioInputs);
                      const result = await renderInApp(req, e => setRenderLogs(prev => [...prev, e]));
                      setRenderResult(result);
                    } catch (err) {
                      setRenderLogs(prev => [...prev, { level: "error", message: String(err) }]);
                    } finally {
                      setRenderRunning(false);
                    }
                  }}
                >
                  {renderRunning ? "Rendering…" : `▶  Render ${outputFormats.length || 1} output${(outputFormats.length || 1) === 1 ? "" : "s"}`}
                </button>
                {renderRunning && (
                  <button onClick={() => { void cancelRender(); }}>Cancel</button>
                )}
                {renderResult && renderResult.produced.length > 0 && !renderRunning && (
                  <button onClick={() => { void openInExplorer(`${absoluteRoot}\\out`); }}>Open output folder</button>
                )}
              </div>
              {(renderLogs.length > 0 || renderRunning) && (
                <div
                  ref={renderLogsRef}
                  style={{
                    marginTop: 12, padding: "10px 12px", maxHeight: 260, overflowY: "auto",
                    background: "rgba(0,0,0,0.45)", border: "1px solid var(--border)",
                    fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace", fontSize: 11, lineHeight: 1.5,
                  }}
                >
                  {renderLogs.map((l, i) => (
                    <div key={i} style={{
                      color: l.level === "error" ? "#ff7a6b" : l.level === "warn" ? "#e6b04a" : l.level === "step" ? "var(--accent)" : "rgba(240,235,227,0.85)",
                      whiteSpace: "pre-wrap",
                    }}>{l.message}</div>
                  ))}
                </div>
              )}
              {renderResult && !renderRunning && (
                <div style={{ marginTop: 10, fontSize: 12, color: renderResult.failed.length === 0 ? "var(--accent)" : "var(--danger, #c97a4a)" }}>
                  {renderResult.failed.length === 0
                    ? `✓ ${renderResult.produced.length} file(s) produced.`
                    : `${renderResult.produced.length} produced · ${renderResult.failed.length} failed (${renderResult.failed.join(", ")}).`}
                </div>
              )}
            </Card>
          )}

          <Card title={inTauri ? "Alternate: render via script" : "6 · Render to disk (MP4)"} eyebrow="PowerShell + Remotion + FFmpeg">
            {blocking ? (
              <div style={{ padding: "10px 14px", background: "rgba(201, 122, 74, 0.12)", borderLeft: "3px solid var(--danger, #c97a4a)", fontSize: 13 }}>
                {blocking}
              </div>
            ) : (
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
                Renders {(outputFormats.length || 1)} MP4{(outputFormats.length || 1) === 1 ? "" : "s"} into <code>{absoluteRoot}\out\</code> — one per picked aspect ratio, suffixed like <code>{slug}-9x16.mp4</code>. Three ways to run the script — pick whichever Defender doesn't quarantine on your machine.
              </p>
            )}
            <div className="button-row" style={{ flexWrap: "wrap" }}>
              <button
                className="primary"
                disabled={!!blocking}
                onClick={() => downloadText(`render-${slug}.ps1`, script)}
              >
                Download render-{slug}.ps1
              </button>
              <button
                disabled={!!blocking}
                onClick={async () => {
                  try { await navigator.clipboard.writeText(script); } catch {}
                }}
              >
                Copy script to clipboard
              </button>
              <button
                disabled={!!blocking}
                onClick={() => {
                  const blob = new Blob([script], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  window.open(url, "_blank", "noopener");
                  // Don't revoke — the new tab needs it. The browser cleans up on tab close.
                }}
              >
                View script in new tab
              </button>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--muted)", lineHeight: 1.55 }}>
              <strong>If the .ps1 vanishes</strong> when you download it, Windows Defender / SmartScreen quarantined it. Two workarounds: <em>(1)</em> use <strong>Copy to clipboard</strong>, paste it into a PowerShell window (Win+X → "Terminal" or "PowerShell"), hit Enter; or <em>(2)</em> use <strong>View in new tab</strong>, right-click → Save As, save to a folder Defender trusts (e.g. your project root), then run <code>powershell -ExecutionPolicy Bypass -File .\render-{slug}.ps1</code>.
            </p>
          </Card>

          {scan.mediaFiles.length > 0 && (
            <Card title="Detected media" eyebrow={`${scan.mediaFiles.length} file(s)`}>
              <div className="asset-grid">
                {scan.mediaFiles.slice(0, 18).map(m => {
                  const base = m.rel.split("/").pop()!;
                  return (
                    <div className="asset-card" key={m.rel}>
                      {previewUrls[m.rel] && (
                        <div className="asset-thumb">
                          <img src={previewUrls[m.rel]} alt={base} loading="lazy" />
                        </div>
                      )}
                      <strong>{base}</strong>
                      <span>{m.rel}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}

      {scan && (
        <div className="button-row wizard-footer" style={{ marginTop: 20 }}>
          <button onClick={goPrev} disabled={currentIdx === 0}>← Back</button>
          <button className="primary" onClick={goNext} disabled={currentIdx === WIZARD_STEPS.length - 1}>
            Next: {WIZARD_STEPS[currentIdx + 1]?.label.split(" · ")[1] ?? "Done"} →
          </button>
        </div>
      )}
    </div>
  );
}
