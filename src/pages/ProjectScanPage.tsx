import { useEffect, useMemo, useRef, useState } from "react";
import Card from "../components/Card";
import { scanFolder, summarizeByType } from "../lib/folderScan";
import { renderMegaPrompt, type PromptContext } from "../lib/prompts";
import { buildScanStubContext } from "../lib/scanContext";
import { copyToClipboard } from "../lib/templateUtils";
import { parseCodeReview } from "../lib/codeReviewParser";
import { importCampaignJson } from "../lib/importCampaign";
import BusinessTypePicker from "../components/BusinessTypePicker";
import SendToAI from "../components/SendToAI";
import { NoticeDialog } from "../components/ConfirmDialog";
import { usePreferences } from "../lib/preferences";
import { buildUrlIntakePrompt, looksLikeUrl, normalizeUrl } from "../lib/urlSource";
import { getBusinessType } from "../lib/businessTypes";
import { buildAssetMetadataPowerShell, buildAssetShortlistPrompt, buildCombinedBriefCampaignPrompt, buildProjectExportPowerShell, buildWebsiteAuditPrompt } from "../lib/auditPrompt";
import { loadState, saveState } from "../lib/storage";
import type { AssetRole, BrandProfile, CampaignConcept, CampaignPrompt, ProjectAsset } from "../types";

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const ROLE_OPTIONS: Array<{ value: AssetRole; label: string }> = [
  { value: "unassigned", label: "— role —" },
  { value: "opener", label: "Opener" },
  { value: "proof", label: "Proof" },
  { value: "endcard", label: "End card" },
  { value: "broll", label: "B-roll" },
  { value: "weak", label: "Weak" },
];

const ASSET_ROLES = new Set<AssetRole>(["opener", "proof", "endcard", "broll", "weak", "unassigned"]);

function extractJsonBlock(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  return JSON.parse(candidate);
}

function parseAssetRoleResult(text: string): Array<{ assetId: string; role: AssetRole; reason?: string }> {
  const parsed = extractJsonBlock(text);
  if (!parsed || typeof parsed !== "object") return [];
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { assetRoles?: unknown }).assetRoles)
      ? (parsed as { assetRoles: unknown[] }).assetRoles
      : Array.isArray((parsed as { roles?: unknown }).roles)
        ? (parsed as { roles: unknown[] }).roles
        : Array.isArray((parsed as { assets?: unknown }).assets)
          ? (parsed as { assets: unknown[] }).assets
          : [];

  return list.flatMap(item => {
    const record = item as Record<string, unknown>;
    const assetId = String(record.assetId ?? record.id ?? "").trim();
    const role = String(record.role ?? "").trim() as AssetRole;
    if (!assetId || !ASSET_ROLES.has(role)) return [];
    return [{ assetId, role, reason: typeof record.reason === "string" ? record.reason : undefined }];
  });
}

export default function ProjectScanPage({
  assets,
  scannedAssets,
  setScannedAssets,
  updateProjectAssets,
  rootPath,
  setRootPath,
  detectedRoot,
  setDetectedRoot,
  sourceExcerpts,
  setSourceExcerpts,
  previewUrls,
  setPreviewUrls,
  previewDataUrls,
  setPreviewDataUrls,
  setBrand,
  setPrompt,
  setImportedConcepts,
  setSelectedConceptId,
  promptCtx,
  goToCampaignPrompt,
  saveScanAsProject,
  goToProjects,
}: {
  assets: ProjectAsset[];
  scannedAssets: ProjectAsset[] | null;
  setScannedAssets: (next: ProjectAsset[] | null) => void;
  updateProjectAssets: (next: ProjectAsset[]) => void;
  rootPath: string;
  setRootPath: (next: string) => void;
  detectedRoot: string;
  setDetectedRoot: (next: string) => void;
  sourceExcerpts: Record<string, string>;
  setSourceExcerpts: (next: Record<string, string>) => void;
  previewUrls: Record<string, string>;
  setPreviewUrls: (next: Record<string, string>) => void;
  previewDataUrls: Record<string, string>;
  setPreviewDataUrls: (next: Record<string, string>) => void;
  setBrand: (brand: BrandProfile) => void;
  setPrompt: (prompt: CampaignPrompt) => void;
  setImportedConcepts: (concepts: CampaignConcept[] | null) => void;
  setSelectedConceptId: (id: string) => void;
  promptCtx: PromptContext;
  goToCampaignPrompt: () => void;
  saveScanAsProject: () => void;
  goToProjects: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pendingAssets, setPendingAssets] = useState<ProjectAsset[]>([]);
  const [pendingExcerpts, setPendingExcerpts] = useState<Record<string, string>>({});
  const [skippedCount, setSkippedCount] = useState(0);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showExportCommand, setShowExportCommand] = useState(false);
  const [exportCopied, setExportCopied] = useState(false);
  const [auditCopied, setAuditCopied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [assetPromptCopied, setAssetPromptCopied] = useState(false);
  const [assetMetadataCopied, setAssetMetadataCopied] = useState(false);
  const [showAssetMetadataCommand, setShowAssetMetadataCommand] = useState(false);
  const [assetMetadataText, setAssetMetadataText] = useState("");
  const [assetAiText, setAssetAiText] = useState("");
  const [assetAiFeedback, setAssetAiFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const [aiResultText, setAiResultText] = useState("");
  const [aiImportFeedback, setAiImportFeedback] = useState<
    | { kind: "ok"; summary: string; warnings: string[] }
    | { kind: "error"; error: string }
    | null
  >(null);
  const [briefImported, setBriefImported] = useState(() => loadState("launchfoundry.scan.briefImported", false));
  const [isProcessing, setIsProcessing] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);

  const activeAssets = scannedAssets ?? assets;
  const counts = useMemo(() => summarizeByType(activeAssets), [activeAssets]);

  const intakeCtx = useMemo<PromptContext>(() => {
    if (scannedAssets) {
      return buildScanStubContext(detectedRoot, scannedAssets, promptCtx.prompt, promptCtx.platform);
    }
    return promptCtx;
  }, [scannedAssets, detectedRoot, promptCtx]);
  const workingPrompt = intakeCtx.prompt;
  const intakePrompt = useMemo(
    () => renderMegaPrompt(intakeCtx, scannedAssets ? sourceExcerpts : undefined),
    [intakeCtx, scannedAssets, sourceExcerpts]
  );
  const suggestedProjectRoot = useMemo(
    () => rootPath.trim() || (detectedRoot ? `C:\\Sites\\${detectedRoot}` : ""),
    [rootPath, detectedRoot]
  );
  const reviewPackFilename = useMemo(
    () => `${(detectedRoot || promptCtx.brand.projectName || "my-project")
      .trim()
      .replace(/[/\\]+$/g, "")
      .split(/[/\\]/)
      .filter(Boolean)
      .pop()
      ?.replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "my-project"}-ai-review-pack.xml`,
    [detectedRoot, promptCtx.brand.projectName]
  );
  const exportCommand = useMemo(
    () => buildProjectExportPowerShell(suggestedProjectRoot || undefined, undefined, detectedRoot || promptCtx.brand.projectName),
    [suggestedProjectRoot, detectedRoot, promptCtx.brand.projectName]
  );
  const auditPrompt = useMemo(
    () => buildWebsiteAuditPrompt(detectedRoot || promptCtx.brand.projectName, scannedAssets ? sourceExcerpts : {}, activeAssets),
    [detectedRoot, promptCtx.brand.projectName, scannedAssets, sourceExcerpts, activeAssets]
  );
  const combinedBriefCampaignPrompt = useMemo(
    () => buildCombinedBriefCampaignPrompt(detectedRoot || promptCtx.brand.projectName, scannedAssets ? sourceExcerpts : {}, activeAssets, workingPrompt, assetMetadataText),
    [detectedRoot, promptCtx.brand.projectName, scannedAssets, sourceExcerpts, activeAssets, workingPrompt, assetMetadataText]
  );
  const assetShortlistPrompt = useMemo(
    () => buildAssetShortlistPrompt(detectedRoot || promptCtx.brand.projectName, activeAssets, scannedAssets ? sourceExcerpts : {}, assetMetadataText),
    [detectedRoot, promptCtx.brand.projectName, activeAssets, scannedAssets, sourceExcerpts, assetMetadataText]
  );
  const assetMetadataCommand = useMemo(
    () => buildAssetMetadataPowerShell(rootPath.trim() || detectedRoot || "C:\\Sites\\my-project", activeAssets),
    [rootPath, detectedRoot, activeAssets]
  );
  const isScanMode = !!scannedAssets;
  const excerptCount = Object.keys(sourceExcerpts).length;

  const handleFolderPick = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setIsProcessing(true);
    setImportStatus("Scanning folder...");
    try {
      const { rootFolderName, assets: scanned, skippedCount: skipped, previewUrls: urls, previewDataUrls: dataUrls, sourceExcerpts } = await scanFolder(fileList, rootPath);
      setDetectedRoot(rootFolderName);
      setSkippedCount(skipped);
      setPreviewUrls(urls); // App-level setter handles revoking the old set
      setPreviewDataUrls(dataUrls);
      setScannedAssets(scanned);
      setSourceExcerpts(sourceExcerpts);
      setPrompt(buildScanStubContext(rootFolderName, scanned, promptCtx.prompt, promptCtx.platform).prompt);
      setPendingAssets([]);
      setPendingExcerpts({});
      setBriefImported(false);
      saveState("launchfoundry.scan.briefImported", false);
      setAiImportFeedback(null);
      setImportStatus(`Imported ${scanned.length} usable files. ${skipped} skipped. PowerShell review command updated for ${rootFolderName}.`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Code-review text dump as alternate input. Same downstream state as a
  // folder pick — the intake prompt picks up the source excerpts the same way.
  const handleCodeReviewDrop = async (file: File) => {
    setIsProcessing(true);
    setImportStatus(`Reading ${file.name}...`);
    try {
      const text = await file.text();
      const parsed = parseCodeReview(text, file.name);
      if (parsed.totalFiles === 0) {
        setNotice({
          title: "No file markers found",
          message: "That file does not include `===== FILE: ... =====` markers or XML `<file path=\"...\">` entries, so LaunchFoundry cannot split it into source excerpts.",
        });
        setImportStatus(null);
        return;
      }
      setDetectedRoot(parsed.folderName);
      setSkippedCount(parsed.skippedCount);
      setPreviewUrls({}); // dumps don't carry image bytes
      setPreviewDataUrls({});
      setScannedAssets(parsed.assets);
      setSourceExcerpts(parsed.sourceExcerpts);
      setPrompt(buildScanStubContext(parsed.folderName, parsed.assets, promptCtx.prompt, promptCtx.platform).prompt);
      setPendingAssets([]);
      setPendingExcerpts({});
      setBriefImported(false);
      saveState("launchfoundry.scan.briefImported", false);
      setAiImportFeedback(null);
      setImportStatus(`Imported ${parsed.assets.length} files from ${file.name}. ${parsed.skippedCount} skipped.`);
    } finally {
      setIsProcessing(false);
    }
  };
  const codeReviewInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  const commit = () => {
    setScannedAssets(pendingAssets);
    setSourceExcerpts(pendingExcerpts);
    setPendingAssets([]);
    setPendingExcerpts({});
  };

  const revert = () => {
    setScannedAssets(null);
    setSourceExcerpts({});
    setPendingAssets([]);
    setPendingExcerpts({});
    setPreviewDataUrls({});
    setImportStatus(null);
    setBriefImported(false);
    saveState("launchfoundry.scan.briefImported", false);
    setAiImportFeedback(null);
  };

  const handleCopyPrompt = async () => {
    try { await copyToClipboard(intakePrompt); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCopyExportCommand = async () => {
    try { await copyToClipboard(exportCommand); } catch {}
    setExportCopied(true);
    setTimeout(() => setExportCopied(false), 1500);
  };

  const handleCopyAuditPrompt = async () => {
    try { await copyToClipboard(auditPrompt); } catch {}
    setAuditCopied(true);
    setTimeout(() => setAuditCopied(false), 1500);
  };

  const handleCopyAssetPrompt = async () => {
    try { await copyToClipboard(assetShortlistPrompt); } catch {}
    setAssetPromptCopied(true);
    setTimeout(() => setAssetPromptCopied(false), 1500);
  };

  const handleCopyAssetMetadataCommand = async () => {
    try { await copyToClipboard(assetMetadataCommand); } catch {}
    setAssetMetadataCopied(true);
    setTimeout(() => setAssetMetadataCopied(false), 1500);
  };

  const applyBrandToPrompt = (brand: BrandProfile) => {
    setPrompt({
      ...promptCtx.prompt,
      projectName: brand.projectName,
      goal: `Create a ${promptCtx.platform.replaceAll("_", " ")} campaign for ${brand.businessName || brand.projectName}. ${brand.oneLiner} Offer: ${brand.offerSummary || brand.cta}`,
      audienceHint: brand.targetCustomer,
      toneHint: brand.tone,
      offerHint: brand.offerSummary,
    });
  };

  const applyAssetRoleList = (roles: Array<{ assetId: string; role: AssetRole }>) => {
    if (roles.length === 0) return { appliedCount: 0, skippedCount: 0 };
    const roleMap = new Map(roles.map(r => [r.assetId, r.role]));
    const applyRoles = (list: ProjectAsset[]) =>
      list.map(asset => {
        const role = roleMap.get(asset.id);
        return role ? { ...asset, role: role === "unassigned" ? undefined : role } : asset;
      });

    const knownIds = new Set(activeAssets.map(a => a.id));
    const appliedCount = roles.filter(r => knownIds.has(r.assetId)).length;
    const skippedCount = roles.length - appliedCount;

    if (scannedAssets) {
      setScannedAssets(applyRoles(scannedAssets));
    } else {
      updateProjectAssets(applyRoles(assets));
    }
    return { appliedCount, skippedCount };
  };

  const handleImportAiResult = () => {
    const result = importCampaignJson(aiResultText);
    let assetImport: { appliedCount: number; skippedCount: number } | null = null;
    try {
      const roles = parseAssetRoleResult(aiResultText);
      if (roles.length > 0) {
        assetImport = applyAssetRoleList(roles);
      }
    } catch {
      // The campaign importer below will show the JSON error if nothing else imports.
    }

    if (!result.ok) {
      if (assetImport && assetImport.appliedCount > 0) {
        setAiResultText("");
        setAiImportFeedback({
          kind: "ok",
          summary: `Imported ${assetImport.appliedCount} asset role${assetImport.appliedCount === 1 ? "" : "s"}.`,
          warnings: ["No brand or campaign concepts were found in that answer. The asset labels still imported."],
        });
        return;
      }
      setAiImportFeedback({ kind: "error", error: result.error });
      return;
    }

    const parts: string[] = [];
    if (result.brand) {
      setBrand(result.brand);
      applyBrandToPrompt(result.brand);
      parts.push("brand + campaign input");
    }
    if (result.concepts && result.concepts.length > 0) {
      setImportedConcepts(result.concepts);
      setSelectedConceptId(result.concepts[0]!.id);
      parts.push(`${result.concepts.length} concept${result.concepts.length === 1 ? "" : "s"}`);
    }
    if (assetImport && assetImport.appliedCount > 0) {
      parts.push(`${assetImport.appliedCount} asset role${assetImport.appliedCount === 1 ? "" : "s"}`);
    }

    setBriefImported(true);
    saveState("launchfoundry.scan.briefImported", true);
    setAiResultText("");
    setAiImportFeedback({
      kind: "ok",
      summary: `Imported ${parts.join(" + ")}.${result.recommendation ? " Recommendation: " + result.recommendation : ""}`,
      warnings: result.warnings,
    });
  };

  // Updating a role goes either to the active scan list or directly to the project's asset list.
  const setAssetRole = (id: string, role: AssetRole) => {
    if (scannedAssets) {
      setScannedAssets(scannedAssets.map(a => a.id === id ? { ...a, role: role === "unassigned" ? undefined : role } : a));
    } else {
      updateProjectAssets(assets.map(a => a.id === id ? { ...a, role: role === "unassigned" ? undefined : role } : a));
    }
  };

  const applyAssetAiResult = () => {
    try {
      const roles = parseAssetRoleResult(assetAiText);
      if (roles.length === 0) {
        setAssetAiFeedback({ kind: "error", message: "I could not find any assetRoles with assetId + role. Paste the JSON reply from the asset picker prompt." });
        return;
      }

      const { appliedCount, skippedCount } = applyAssetRoleList(roles);

      setAssetAiText("");
      setAssetAiFeedback({
        kind: "ok",
        message: `Applied ${appliedCount} asset role${appliedCount === 1 ? "" : "s"}${skippedCount ? ` and skipped ${skippedCount} unknown asset ID${skippedCount === 1 ? "" : "s"}` : ""}.`,
      });
    } catch (error) {
      setAssetAiFeedback({ kind: "error", message: error instanceof Error ? error.message : "That asset picker result was not valid JSON." });
    }
  };

  const previewAsset = previewAssetId ? activeAssets.find(a => a.id === previewAssetId) ?? null : null;
  const previewSrc = previewAsset ? (previewUrls[previewAsset.id] ?? previewDataUrls[previewAsset.id]) : undefined;

  const [prefs] = usePreferences();

  return (
    <div className="page">
      <h1>{prefs.simpleMode ? "Add your stuff" : "Project Scan"}</h1>
      <p className="lede">
        {prefs.simpleMode
          ? "Give LaunchFoundry the website, folder, photos, or videos. Then it makes a simple sheet AI can read and helps pick the best pieces for reels."
          : "Start here. Add your project context, create an asset review sheet, then use AI to pick the visuals and facts worth turning into campaign content."}
      </p>

      <Card title="How this works" eyebrow="Simple map">
        <div className="term-grid">
          <div><strong>1. Add stuff</strong><span>Bring in a website, folder, photos, videos, or a review file.</span></div>
          <div><strong>2. Make a picture sheet</strong><span>PowerShell makes a PDF/HTML contact sheet AI can look at.</span></div>
          <div><strong>3. Let AI sort it</strong><span>AI picks the best openers, proof shots, clips, and useful code facts.</span></div>
          <div><strong>4. Make videos</strong><span>You approve the ideas, then LaunchFoundry helps build and post them.</span></div>
        </div>
      </Card>

      <Card title="1 · Pick the closest business type" eyebrow="This sets the style">
        <p className="helper-copy">
          This choice tunes the voice, examples, campaign angles, and platform suggestions. Pick the closest fit; you can change it later.
        </p>
        <BusinessTypePicker />
      </Card>

      <Card title={prefs.simpleMode ? "2 · Add your website, folder, or files" : "2 · Import files"} eyebrow={prefs.simpleMode ? "Choose one starting point" : "Folder / URL / AI review pack"}>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)" }}>
          Choose one source. Folder upload is easiest. Use the PowerShell review command when you want AI to inspect images, assets, and important project files more carefully.
        </p>
        <label>
          Project folder path (optional, helps PowerShell and render scripts find files)
          <input value={rootPath} onChange={e => setRootPath(e.target.value)} placeholder="C:\Sites\strictsub" />
        </label>
        {detectedRoot && !rootPath.trim() && (
          <p style={{ margin: "-6px 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>
            Folder import detected <code>{detectedRoot}</code>. The PowerShell command below now uses <code>{suggestedProjectRoot}</code> and writes <code>{reviewPackFilename}</code>. Edit the path if your folder lives somewhere else.
          </p>
        )}
        <div className="button-row" style={{ marginTop: 8, flexWrap: "wrap" }}>
          <button onClick={() => inputRef.current?.click()} disabled={isProcessing}>Choose folder...</button>
          {pendingAssets.length > 0 && (
            <button className="primary" onClick={commit}>
              Use {pendingAssets.length} files as working asset list
            </button>
          )}
          {scannedAssets && (
            <>
              <button className="primary" onClick={saveScanAsProject}>Save this scan as a project</button>
              <button onClick={goToProjects}>Manage projects →</button>
              <button onClick={revert}>Clear scan (use mock)</button>
            </>
          )}
        </div>
        {(isProcessing || importStatus) && (
          <div className={`import-status${isProcessing ? " import-status--busy" : ""}`}>
            <span className="spinner" aria-hidden />
            <span>{importStatus ?? "Working..."}</span>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          // @ts-expect-error — non-standard but supported in Chromium + Safari + Firefox
          webkitdirectory=""
          directory=""
          multiple
          style={{ display: "none" }}
          onChange={e => handleFolderPick(e.target.files)}
        />

        <div style={{ marginTop: 14, padding: "16px 18px", border: "1px solid var(--line)", borderRadius: 8 }}>
          <strong style={{ display: "block", fontSize: 13, color: "var(--accent)", marginBottom: 8 }}>
            ...or make a code review file from PowerShell
          </strong>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
            Use this when the browser folder picker misses context. After you import a folder, this command updates its suggested path and XML file name. Edit the path above if needed, then upload the XML file it creates from Downloads.
          </p>
          <div className="button-row" style={{ flexWrap: "wrap" }}>
            <button onClick={handleCopyExportCommand}>{exportCopied ? "✓ Copied" : "Copy PowerShell command"}</button>
            <button onClick={() => downloadText("launchfoundry-ai-review-pack-export.ps1", exportCommand)}>Download .ps1</button>
            <button onClick={() => setShowExportCommand(v => !v)}>{showExportCommand ? "Hide" : "Show command"}</button>
          </div>
          {showExportCommand && (
            <pre style={{ marginTop: 12, maxHeight: 360, overflow: "auto", background: "rgba(0,0,0,0.25)", padding: 12, borderRadius: 6, fontSize: 12, whiteSpace: "pre-wrap" }}>
              {exportCommand}
            </pre>
          )}
        </div>

        {/* Alternate source: a code-review text dump. Same pipeline; useful
            when you have a Claude export instead of the actual project folder. */}
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => {
            e.preventDefault();
            setIsDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) void handleCodeReviewDrop(f);
          }}
          onClick={() => codeReviewInputRef.current?.click()}
          style={{
            marginTop: 14,
            padding: "16px 18px",
            border: `2px dashed ${isDragging ? "var(--accent)" : "var(--line2)"}`,
            borderRadius: 8,
            background: isDragging ? "var(--accent-glow)" : "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 14,
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontSize: 22 }}>📄</span>
          <span style={{ flex: 1 }}>
            <strong style={{ display: "block", fontSize: 13, color: "var(--accent)" }}>
              ...or drop a code-review text file
            </strong>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              Upload <code style={{ fontSize: 11 }}>===== FILE: path =====</code> dumps or XML review packs from the PowerShell command above. README/package/index.html excerpts feed the intake prompt the same way a folder scan does.
            </span>
          </span>
        </div>
        <input
          ref={codeReviewInputRef}
          type="file"
          accept=".txt,.md,.xml,text/plain,text/xml,application/xml"
          style={{ display: "none" }}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) void handleCodeReviewDrop(f);
          }}
        />

        {/* H-12 — third source: paste a website URL */}
        <div style={{ marginTop: 14, padding: "16px 18px", border: "1px solid var(--line)", borderRadius: 8 }}>
          <strong style={{ display: "block", fontSize: 13, color: "var(--accent)", marginBottom: 8 }}>
            ...or paste your website address
          </strong>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
            We'll write a prompt that asks ChatGPT or Claude to go look at your website and tell us what we need. No folder, no upload — just a URL.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="url"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="example.com"
              style={{ flex: 1 }}
            />
            <SendToAI
              promptText={buildUrlIntakePrompt({
                url: normalizeUrl(urlInput),
                businessTypeHint: prefs.businessType ? getBusinessType(prefs.businessType)?.label : undefined,
              })}
              buttonText="Send to ChatGPT"
              size="compact"
            />
          </div>
          {urlInput && !looksLikeUrl(urlInput) && (
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--danger)" }}>That doesn't look like a website address yet.</p>
          )}
        </div>

        {detectedRoot && (
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--muted)" }}>
            Detected folder: <code>{detectedRoot}</code>
            {pendingAssets.length > 0 && (
              <> · {pendingAssets.length} usable files · {skippedCount} skipped (node_modules / build / code / configs)</>
            )}
          </p>
        )}
      </Card>

      {activeAssets.length > 0 && (
        <Card
          title="3 · Ask AI for everything"
          eyebrow="One prompt, one answer"
          action={
            <div className="button-row">
              <SendToAI promptText={combinedBriefCampaignPrompt} buttonText="Ask AI for everything" />
              <button onClick={() => downloadText("launchfoundry-all-in-one-ai-prompt.md", combinedBriefCampaignPrompt)}>Download prompt</button>
              <button onClick={handleCopyAuditPrompt}>{auditCopied ? "✓ Copied" : "Copy audit prompt"}</button>
            </div>
          }
        >
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
            Send this to an AI bot with your review file and asset contact sheet. Paste the JSON answer below. LaunchFoundry will fill in the product, audience, campaign ideas, scene asset IDs, and asset labels all at once.
          </p>
          <textarea
            value={aiResultText}
            onChange={e => setAiResultText(e.target.value)}
            rows={9}
            placeholder='{ "brand": {...}, "concepts": [...], "assetRoles": [...] }'
            style={{ marginTop: 12, fontFamily: "var(--mono)", fontSize: 12 }}
          />
          <div className="button-row" style={{ marginTop: 10 }}>
            <button className="primary" onClick={handleImportAiResult} disabled={!aiResultText.trim()}>
              Use AI answer
            </button>
            {briefImported && <button onClick={goToCampaignPrompt}>Review campaign input</button>}
          </div>
          {aiImportFeedback?.kind === "ok" && (
            <div className="inline-feedback inline-feedback--ok">
              <strong>Imported.</strong> {aiImportFeedback.summary}
              {aiImportFeedback.warnings.length > 0 && (
                <ul>
                  {aiImportFeedback.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </div>
          )}
          {aiImportFeedback?.kind === "error" && (
            <div className="inline-feedback inline-feedback--error">
              <strong>Import failed.</strong> {aiImportFeedback.error}
            </div>
          )}
        </Card>
      )}

      {activeAssets.length > 0 && (
        <Card
          title="4 · Need another campaign prompt?"
          eyebrow={briefImported ? "Optional" : "Locked until Step 3 is imported"}
          action={
            briefImported ? (
              <div className="button-row">
                <SendToAI promptText={intakePrompt} buttonText="Generate campaign" />
                <button onClick={handleCopyPrompt}>{copied ? "✓ Copied" : "Copy"}</button>
                <button onClick={() => downloadText("launchfoundry-intake.md", intakePrompt)}>Download</button>
                <button onClick={() => setShowPrompt(v => !v)}>{showPrompt ? "Hide" : "Show"}</button>
              </div>
            ) : (
              <div className="button-row">
                <button disabled>Generate campaign</button>
              </div>
            )
          }
        >
          {!briefImported && (
            <div className="locked-step">
              Paste the Step 3 AI answer first. Most users will not need this box.
            </div>
          )}
          {briefImported && (
            <p className="helper-copy">
              This is a backup prompt if you want fresh campaign ideas later. Paste any full AI JSON answer back into the Step 3 box above.
            </p>
          )}
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
            {isScanMode ? (
              <>
                <strong style={{ color: "var(--accent)" }}>Scan mode.</strong> Blank brand stub seeded only with the
                detected folder name (<code>{detectedRoot}</code>) +{" "}
                <strong>{excerptCount} source file excerpt{excerptCount === 1 ? "" : "s"}</strong>{" "}
                (README / package.json / index.html) inlined so Claude has something real to read. No carry-over from
                the currently-selected project's brand or campaign goal.
              </>
            ) : (
              <>
                Bundles the project's brand seed + current goal + all 9 step instructions, asks for a unified JSON.
                Paste it into Claude, then drop the JSON into the Campaign Prompt page to populate everything in one
                shot.
              </>
            )}
          </p>
          {showPrompt && (
            <pre style={{ marginTop: 12, maxHeight: 480, overflow: "auto", background: "rgba(0,0,0,0.25)", padding: 12, borderRadius: 6, fontSize: 12, whiteSpace: "pre-wrap" }}>
              {intakePrompt}
            </pre>
          )}
        </Card>
      )}

      <div className="grid four">
        {Object.entries(counts).map(([type, count]) => (
          <Card key={type}>
            <div className="metric">
              <b>{count}</b>
              <span>{type}</span>
            </div>
          </Card>
        ))}
      </div>

      <Card
        title={scannedAssets ? "Your scanned stuff" : "Project assets"}
        eyebrow={scannedAssets ? `Folder scan · ${Object.keys(previewUrls).length} thumbnails this session` : "Tag each asset's role to sharpen the LLM output"}
      >
        <div style={{ marginBottom: 16, padding: "16px 18px", border: "1px solid var(--line)", borderRadius: 8 }}>
          <strong style={{ display: "block", fontSize: 13, color: "var(--accent)", marginBottom: 8 }}>
            AI asset helper
          </strong>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
            Use this when the asset list feels messy. First run the PowerShell review command. It creates JSON plus an image contact sheet PDF/HTML, then the AI picker can choose opener, proof, b-roll, end-card, code facts, and image-generation references.
          </p>
          <div style={{ margin: "12px 0", padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 8 }}>
            <strong style={{ display: "block", fontSize: 12, color: "var(--accent)", marginBottom: 8 }}>
              1 · Export asset review files
            </strong>
            <div className="button-row" style={{ flexWrap: "wrap" }}>
              <button onClick={handleCopyAssetMetadataCommand}>{assetMetadataCopied ? "✓ Copied" : "Copy review command"}</button>
              <button onClick={() => downloadText("launchfoundry-asset-review.ps1", assetMetadataCommand)}>Download .ps1</button>
              <button onClick={() => setShowAssetMetadataCommand(v => !v)}>{showAssetMetadataCommand ? "Hide command" : "Show command"}</button>
            </div>
            {showAssetMetadataCommand && (
              <pre style={{ marginTop: 12, maxHeight: 300, overflow: "auto", background: "rgba(0,0,0,0.25)", padding: 12, borderRadius: 6, fontSize: 12, whiteSpace: "pre-wrap" }}>
                {assetMetadataCommand}
              </pre>
            )}
            <textarea
              value={assetMetadataText}
              onChange={e => setAssetMetadataText(e.target.value)}
              rows={5}
              placeholder='Paste the asset review JSON here. Attach the generated PDF/HTML contact sheet to the AI chat, then use "Pick best assets".'
              style={{ marginTop: 12, fontFamily: "var(--mono)", fontSize: 12 }}
            />
          </div>
          <div style={{ margin: "12px 0", padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 8 }}>
            <strong style={{ display: "block", fontSize: 12, color: "var(--accent)", marginBottom: 8 }}>
              2 · Ask AI to pick the best assets
            </strong>
          <div className="button-row" style={{ flexWrap: "wrap" }}>
            <SendToAI promptText={assetShortlistPrompt} buttonText="Pick best assets" size="compact" />
            <button onClick={handleCopyAssetPrompt}>{assetPromptCopied ? "✓ Copied" : "Copy asset prompt"}</button>
            <button onClick={() => downloadText("launchfoundry-asset-picker-prompt.md", assetShortlistPrompt)}>Download prompt</button>
          </div>
          </div>
          <div style={{ margin: "12px 0 0", padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 8 }}>
            <strong style={{ display: "block", fontSize: 12, color: "var(--accent)", marginBottom: 8 }}>
              3 · Paste AI's asset choices
            </strong>
          <textarea
            value={assetAiText}
            onChange={e => setAssetAiText(e.target.value)}
            rows={6}
            placeholder='{ "assetRoles": [{ "assetId": "asset-1", "role": "opener", "reason": "Strong first visual", "confidence": 8 }] }'
            style={{ marginTop: 12, fontFamily: "var(--mono)", fontSize: 12 }}
          />
          <div className="button-row" style={{ marginTop: 10 }}>
            <button className="primary" onClick={applyAssetAiResult} disabled={!assetAiText.trim()}>
              Apply asset choices
            </button>
          </div>
          </div>
          {assetAiFeedback && (
            <div className={`inline-feedback inline-feedback--${assetAiFeedback.kind}`}>
              {assetAiFeedback.message}
            </div>
          )}
        </div>
        <div className="asset-grid">
          {activeAssets.map(asset => {
            const preview = previewUrls[asset.id] ?? previewDataUrls[asset.id];
            const isVideo = asset.type === "video";
            return (
              <div className="asset-card" key={asset.id}>
                {preview && !isVideo && (
                  <div className="asset-thumb" onClick={() => setPreviewAssetId(asset.id)} role="button" tabIndex={0}>
                    <img src={preview} alt={asset.filename} loading="lazy" />
                  </div>
                )}
                {preview && isVideo && (
                  <div className="asset-thumb">
                    <video src={preview} muted preload="metadata" />
                  </div>
                )}
                <strong>{asset.filename}</strong>
                <span>
                  {asset.type}
                  {asset.qualityScore !== undefined && ` · quality ${asset.qualityScore}`}
                  {asset.role && (
                    <em className={`role-pill role-pill--${asset.role}`} style={{ marginLeft: 8 }}>{asset.role}</em>
                  )}
                </span>
                <label style={{ display: "block", margin: "8px 0 0" }}>
                  <select
                    value={asset.role ?? "unassigned"}
                    onChange={e => setAssetRole(asset.id, e.target.value as AssetRole)}
                    style={{ width: "100%" }}
                  >
                    {ROLE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                {asset.notes && <p>{asset.notes}</p>}
                <div className="tags">
                  {asset.tags.map(tag => <em key={tag}>{tag}</em>)}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {!scannedAssets && (
        <Card title="Missing asset suggestions" eyebrow="Before render">
          <ul className="plain-list">
            <li>Owner talking-head intro, 10–15 seconds.</li>
            <li>More finished-room wide shots.</li>
            <li>One strong before/after pair shot from the same angle.</li>
            <li>Customer testimonial or short trust quote.</li>
          </ul>
        </Card>
      )}

      {previewAsset && (
        <div className="modal-backdrop" onClick={() => setPreviewAssetId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <strong>{previewAsset.filename}</strong>
                <span style={{ marginLeft: 12, fontSize: 12, color: "var(--muted)", fontFamily: "var(--mono)" }}>
                  {previewAsset.type}
                  {previewAsset.role && ` · ${previewAsset.role}`}
                </span>
              </div>
              <button onClick={() => setPreviewAssetId(null)}>Close</button>
            </div>
            <div className="modal-body">
              {previewSrc && previewAsset.type !== "video" && (
                <img src={previewSrc} alt={previewAsset.filename} />
              )}
              {previewSrc && previewAsset.type === "video" && (
                <video src={previewSrc} controls autoPlay muted />
              )}
              {!previewSrc && (
                <p style={{ color: "var(--muted)" }}>No preview available — this asset wasn't picked in the current session.</p>
              )}
              <dl className="modal-meta">
                <dt>Path</dt><dd><code>{previewAsset.path}</code></dd>
                <dt>Role</dt><dd>
                  <select
                    value={previewAsset.role ?? "unassigned"}
                    onChange={e => setAssetRole(previewAsset.id, e.target.value as AssetRole)}
                  >
                    {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </dd>
                <dt>Tags</dt>
                <dd>
                  <div className="tags">
                    {previewAsset.tags.map(t => <em key={t}>{t}</em>)}
                  </div>
                </dd>
                {previewAsset.notes && (<><dt>Notes</dt><dd>{previewAsset.notes}</dd></>)}
              </dl>
            </div>
          </div>
        </div>
      )}
      {notice && (
        <NoticeDialog
          title={notice.title}
          message={notice.message}
          onClose={() => setNotice(null)}
        />
      )}
    </div>
  );
}
