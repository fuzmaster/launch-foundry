import { useEffect, useMemo, useRef, useState } from "react";
import Card from "../components/Card";
import { scanFolder, summarizeByType } from "../lib/folderScan";
import { renderMegaPrompt, type PromptContext } from "../lib/prompts";
import { buildScanStubContext } from "../lib/scanContext";
import { copyToClipboard } from "../lib/templateUtils";
import { parseCodeReview } from "../lib/codeReviewParser";
import BusinessTypePicker from "../components/BusinessTypePicker";
import SendToAI from "../components/SendToAI";
import { NoticeDialog } from "../components/ConfirmDialog";
import { usePreferences } from "../lib/preferences";
import { buildUrlIntakePrompt, looksLikeUrl, normalizeUrl } from "../lib/urlSource";
import { getBusinessType } from "../lib/businessTypes";
import { buildProductDesignBriefPrompt, buildProjectExportPowerShell, buildWebsiteAuditPrompt } from "../lib/auditPrompt";
import type { AssetRole, ProjectAsset } from "../types";

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
  const intakePrompt = useMemo(
    () => renderMegaPrompt(intakeCtx, scannedAssets ? sourceExcerpts : undefined),
    [intakeCtx, scannedAssets, sourceExcerpts]
  );
  const exportCommand = useMemo(() => buildProjectExportPowerShell(rootPath.trim() || undefined), [rootPath]);
  const auditPrompt = useMemo(
    () => buildWebsiteAuditPrompt(detectedRoot || promptCtx.brand.projectName, scannedAssets ? sourceExcerpts : {}, activeAssets),
    [detectedRoot, promptCtx.brand.projectName, scannedAssets, sourceExcerpts, activeAssets]
  );
  const designBriefPrompt = useMemo(
    () => buildProductDesignBriefPrompt(detectedRoot || promptCtx.brand.projectName, scannedAssets ? sourceExcerpts : {}, activeAssets),
    [detectedRoot, promptCtx.brand.projectName, scannedAssets, sourceExcerpts, activeAssets]
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
      setPendingAssets([]);
      setPendingExcerpts({});
      setImportStatus(`Imported ${scanned.length} usable files. ${skipped} skipped.`);
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
      setPendingAssets([]);
      setPendingExcerpts({});
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

  // Updating a role goes either to the active scan list or directly to the project's asset list.
  const setAssetRole = (id: string, role: AssetRole) => {
    if (scannedAssets) {
      setScannedAssets(scannedAssets.map(a => a.id === id ? { ...a, role: role === "unassigned" ? undefined : role } : a));
    } else {
      updateProjectAssets(assets.map(a => a.id === id ? { ...a, role: role === "unassigned" ? undefined : role } : a));
    }
  };

  const previewAsset = previewAssetId ? activeAssets.find(a => a.id === previewAssetId) ?? null : null;
  const previewSrc = previewAsset ? (previewUrls[previewAsset.id] ?? previewDataUrls[previewAsset.id]) : undefined;

  const [prefs] = usePreferences();

  return (
    <div className="page">
      <h1>{prefs.simpleMode ? "What are we promoting?" : "Project Scan"}</h1>
      <p className="lede">
        {prefs.simpleMode
          ? "Start by telling me what kind of business this is. Then drop a folder, paste a website URL, or upload a code-review file — whichever you have."
          : "Start here. Pick a folder, then generate one intake prompt that captures everything the rest of the pipeline needs. Click any image to see the full-resolution version; tag assets with their role so the prompt knows what's an opener vs. proof vs. end card."}
      </p>

      <Card title="Plain-English map" eyebrow="What these words mean">
        <div className="term-grid">
          <div><strong>Import files</strong><span>Bring in a folder, website URL, or AI review pack.</span></div>
          <div><strong>Review pack</strong><span>A text/XML copy of project files that an AI bot can read.</span></div>
          <div><strong>Product brief</strong><span>A summary of what the website/app is, who it serves, and what to market.</span></div>
          <div><strong>Campaign prompt</strong><span>The final prompt that asks AI for ads, storyboards, captions, and QA.</span></div>
        </div>
      </Card>

      <Card title="1 · What kind of business?" eyebrow="Picks a sensible style for everything that follows">
        <p className="helper-copy">
          This choice tunes the voice, examples, campaign angles, and platform suggestions. Pick the closest fit; you can change it later.
        </p>
        <BusinessTypePicker />
      </Card>

      <Card title={prefs.simpleMode ? "2 · Import website or project context" : "2 · Import files"} eyebrow={prefs.simpleMode ? "Folder, project export, or URL" : "Folder / URL / AI review pack"}>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)" }}>
          Choose one source. Folder upload is easiest. The AI review pack is best when you want ChatGPT or Claude to read code context. The website URL path is best when you only have a live site.
        </p>
        <label>
          Project folder path (optional, helps PowerShell and render scripts find files)
          <input value={rootPath} onChange={e => setRootPath(e.target.value)} placeholder="C:\Sites\strictsub" />
        </label>
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
            …or make an AI review pack from PowerShell
          </strong>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
            Use this when the browser folder picker misses context. Paste your project path above, copy this command into PowerShell, then upload the XML file it creates from Downloads.
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
              …or drop a code-review text file
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
            …or paste your website address
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
          title="3 · Ask AI to understand this website"
          eyebrow="Audit / product-design brief"
          action={
            <div className="button-row">
              <SendToAI promptText={designBriefPrompt} buttonText="Make product brief" />
              <button onClick={handleCopyAuditPrompt}>{auditCopied ? "✓ Copied" : "Copy audit prompt"}</button>
              <button onClick={() => downloadText("launchfoundry-website-audit-prompt.md", auditPrompt)}>Download audit prompt</button>
            </div>
          }
        >
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
            This is the testing prompt for an uploaded website/code pack. Send the brief prompt to an AI bot, paste the code-review/export file into the same chat, and ask it to return a structured product/design brief LaunchFoundry can use for better strategy, ads, and QA.
          </p>
        </Card>
      )}

      {activeAssets.length > 0 && (
        <Card
          title="4 · Generate the intake prompt"
          eyebrow="Mega prompt from this scan"
          action={
            <div className="button-row">
              <SendToAI promptText={intakePrompt} buttonText="Send to ChatGPT" />
              <button onClick={handleCopyPrompt}>{copied ? "✓ Copied" : "Copy"}</button>
              <button onClick={() => downloadText("launchfoundry-intake.md", intakePrompt)}>Download</button>
              <button onClick={() => setShowPrompt(v => !v)}>{showPrompt ? "Hide" : "Show"}</button>
              <button onClick={goToCampaignPrompt}>Paste result →</button>
            </div>
          }
        >
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
        title={scannedAssets ? "Scanned assets" : "Project assets"}
        eyebrow={scannedAssets ? `Folder scan · ${Object.keys(previewUrls).length} thumbnails this session` : "Tag each asset's role to sharpen the LLM output"}
      >
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
