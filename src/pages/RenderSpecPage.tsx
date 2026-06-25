import { useMemo, useState } from "react";
import Card from "../components/Card";
import JsonViewer from "../components/JsonViewer";
import { downloadJson } from "../lib/exportJson";
import { copyToClipboard } from "../lib/templateUtils";
import { buildReelsProject } from "../lib/reelsAdapter";
import { findProjectHome } from "../lib/projectHome";
import type { BrandProfile, CampaignConcept, ProjectAsset, RenderSpec } from "../types";

export default function RenderSpecPage({
  renderSpec,
  concept,
  brand,
  assets,
}: {
  renderSpec: RenderSpec;
  concept: CampaignConcept;
  brand: BrandProfile;
  assets: ProjectAsset[];
}) {
  const reelsResult = useMemo(() => {
    try {
      return { ok: true as const, value: buildReelsProject(concept, brand, assets) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [concept, brand, assets]);
  const [copied, setCopied] = useState<"spec" | "reels" | "copyScript" | "copyJson" | null>(null);

  const flashCopy = (which: "spec" | "reels" | "copyScript" | "copyJson") => {
    setCopied(which);
    setTimeout(() => setCopied(prev => (prev === which ? null : prev)), 1500);
  };

  // Build the PowerShell script that copies each flagged asset from its source path
  // into the reels project's public/photos folder (under C:\Sites by default).
  const REELS_DEST_BASE = "C:\\Sites\\brittenwoodworking-reels\\public";
  const copyScript = useMemo(() => {
    if (!reelsResult.ok) return "";
    const needs = reelsResult.value.pathRewrites.filter(r => r.needsCopy);
    if (needs.length === 0) return "";
    const winPath = (p: string) => p.replace(/\//g, "\\");
    const lines = [
      "# LaunchFoundry — copy assets into the reels project",
      "# Run from any PowerShell window. Existing files are overwritten.",
      "",
      "$ErrorActionPreference = 'Stop'",
      `$Dest = '${REELS_DEST_BASE}'`,
      "",
      `Write-Host 'Copying ${needs.length} asset(s) into' $Dest -ForegroundColor Cyan`,
      "",
    ];
    for (const r of needs) {
      const src = winPath(r.from);
      // r.to looks like "brittenwoodworking-reels/public/photos/foo.png" — strip the prefix
      // so we can join under $Dest, which already points at brittenwoodworking-reels\public.
      const rel = r.to.replace(/^brittenwoodworking-reels\/public\//, "");
      const dest = `Join-Path $Dest '${rel.replace(/\//g, "\\")}'`;
      lines.push(`# ${rel}`);
      lines.push(`New-Item -ItemType Directory -Force -Path (Split-Path -Parent (${dest})) | Out-Null`);
      lines.push(`Copy-Item -LiteralPath '${src}' -Destination (${dest}) -Force`);
      lines.push("");
    }
    lines.push("Write-Host 'Done.' -ForegroundColor Green");
    return lines.join("\n");
  }, [reelsResult]);

  const handleCopyScript = async () => {
    try { await copyToClipboard(copyScript); } catch {}
    flashCopy("copyScript");
  };
  const handleDownloadScript = () => {
    const blob = new Blob([copyScript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "copy-assets.ps1";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  // Also offer a single-line clipboard "paste this into a PowerShell window" command.
  const inlineCommand = useMemo(() => {
    if (!reelsResult.ok) return "";
    const needs = reelsResult.value.pathRewrites.filter(r => r.needsCopy);
    if (needs.length === 0) return "";
    const winPath = (p: string) => p.replace(/\//g, "\\");
    return needs
      .map(r => {
        const src = winPath(r.from);
        const dest = `C:\\Sites\\${winPath(r.to)}`;
        return `Copy-Item -LiteralPath '${src}' -Destination '${dest}' -Force`;
      })
      .join("; ");
  }, [reelsResult]);
  const handleCopyInline = async () => {
    try { await copyToClipboard(inlineCommand); } catch {}
    flashCopy("copyJson");
  };

  // Where this project's MP4 should ultimately land — derived from the asset paths
  // the user set during scan (their actual project home, e.g. C:\Sites\will-my-helix-work).
  // Falls back to the reels project's out folder if no usable home can be derived.
  const projectHome = useMemo(() => findProjectHome(assets), [assets]);

  // Full one-click script: copy assets + write project.json + render with Remotion + move MP4 home.
  const REELS_ROOT = "C:\\Sites\\brittenwoodworking-reels";
  const fullRenderScript = useMemo(() => {
    if (!reelsResult.ok) return "";
    const { template, slug, project, pathRewrites } = reelsResult.value;
    const needs = pathRewrites.filter(r => r.needsCopy);
    const exportName = renderSpec.exportName || `${slug}.mp4`;
    const winPath = (p: string) => p.replace(/\//g, "\\");
    const projectJsonLiteral = JSON.stringify(project, null, 2);

    const copyLines = needs.length === 0
      ? ["Write-Host '  (no external assets to copy — all referenced files already live in the reels project)' -ForegroundColor DarkGray"]
      : needs.map(r => {
          const src = winPath(r.from);
          const rel = r.to.replace(/^brittenwoodworking-reels\/public\//, "");
          return `  Copy-Item -LiteralPath '${src}' -Destination (Join-Path $Photos '${rel.replace(/^photos\//, "").replace(/\//g, "\\")}') -Force`;
        });

    // Output destination: the project's own folder when we can derive one, else
    // fall back to the reels project's out\full directory (legacy behavior).
    const useProjectHome = projectHome && projectHome.length > 3;
    const finalDestComment = useProjectHome
      ? `# Final MP4 will be moved to: ${projectHome}\\out\\${exportName}`
      : `# Final MP4 lands in: ${REELS_ROOT}\\out\\full\\${exportName}`;

    const moveBlock = useProjectHome
      ? [
          "",
          `$ProjectOut = '${projectHome}\\out'`,
          "New-Item -ItemType Directory -Force -Path $ProjectOut | Out-Null",
          "$FinalPath = Join-Path $ProjectOut $OutputMp4",
          "Move-Item -LiteralPath $RenderedPath -Destination $FinalPath -Force",
          "if (Test-Path $FinalPath) {",
          `  Write-Host '[4/4] Done. Opening' $FinalPath -ForegroundColor Green`,
          "  Start-Process $FinalPath",
          "} else {",
          `  Write-Host '[4/4] Render finished but the move to project folder failed.' -ForegroundColor Red`,
          "  if (Test-Path $RenderedPath) { Start-Process $RenderedPath }",
          "}",
        ]
      : [
          "if (Test-Path $RenderedPath) {",
          `  Write-Host '[4/4] Done. Opening MP4...' -ForegroundColor Green`,
          "  Start-Process $RenderedPath",
          "} else {",
          `  Write-Host '[4/4] Render finished but MP4 not found. Check the output above.' -ForegroundColor Red`,
          "}",
        ];

    return [
      `# LaunchFoundry — one-click render for "${project.title}" (${template})`,
      `# Auto-generated. Double-click to run, or right-click → "Run with PowerShell".`,
      `# Render engine: ${REELS_ROOT} (shared Remotion templates)`,
      finalDestComment,
      "",
      "$ErrorActionPreference = 'Stop'",
      `$ReelsRoot = '${REELS_ROOT}'`,
      `$Slug = '${slug}'`,
      `$Template = '${template}'`,
      `$OutputMp4 = '${exportName}'`,
      "",
      "if (-not (Test-Path $ReelsRoot)) {",
      `  Write-Host "Reels project not found at $ReelsRoot." -ForegroundColor Red`,
      "  Read-Host 'Press Enter to exit'; exit 1",
      "}",
      "",
      "# Ensure node_modules is ready (one-time first run)",
      "if (-not (Test-Path (Join-Path $ReelsRoot 'node_modules'))) {",
      `  Write-Host '[setup] Installing reels project deps (one-time)...' -ForegroundColor Cyan`,
      "  Push-Location $ReelsRoot",
      "  try { npm install } finally { Pop-Location }",
      "}",
      "",
      `Write-Host '[1/4] Copying ${needs.length} asset(s) into the render engine...' -ForegroundColor Cyan`,
      `$Photos = Join-Path $ReelsRoot 'public\\photos'`,
      "New-Item -ItemType Directory -Force -Path $Photos | Out-Null",
      ...copyLines,
      "",
      `Write-Host '[2/4] Writing project.json...' -ForegroundColor Cyan`,
      `$ProjectDir = Join-Path $ReelsRoot 'public\\projects\\${slug}'`,
      "New-Item -ItemType Directory -Force -Path $ProjectDir | Out-Null",
      "$ProjectJson = @'",
      projectJsonLiteral,
      "'@",
      "Set-Content -Path (Join-Path $ProjectDir 'project.json') -Value $ProjectJson -Encoding UTF8",
      "",
      `Write-Host '[3/4] Rendering with Remotion (1-2 min)...' -ForegroundColor Cyan`,
      "Push-Location $ReelsRoot",
      "try {",
      `  npx remotion render $Template ('out\\full\\' + $OutputMp4) ('--props=public/projects/${slug}/project.json')`,
      "} finally { Pop-Location }",
      "",
      "$RenderedPath = Join-Path $ReelsRoot ('out\\full\\' + $OutputMp4)",
      ...moveBlock,
      "",
      "Read-Host 'Press Enter to close this window'",
    ].join("\n");
  }, [reelsResult, renderSpec.exportName, projectHome]);

  const handleDownloadFullScript = () => {
    if (!reelsResult.ok) return;
    const blob = new Blob([fullRenderScript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `render-${reelsResult.value.slug}.ps1`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopySpec = async () => {
    try {
      await copyToClipboard(JSON.stringify(renderSpec, null, 2));
    } catch {}
    flashCopy("spec");
  };

  const handleCopyReels = async () => {
    if (!reelsResult.ok) return;
    try {
      await copyToClipboard(JSON.stringify(reelsResult.value.project, null, 2));
    } catch {}
    flashCopy("reels");
  };

  const reels = reelsResult.ok ? reelsResult.value : null;
  const reelsTargetPath = reels ? `brittenwoodworking-reels/public/projects/${reels.slug}/project.json` : null;
  const needsCopyCount = reels ? reels.pathRewrites.filter(r => r.needsCopy).length : 0;

  return (
    <div className="page">
      <h1>Render Spec</h1>
      <p className="lede">
        Two flavors of handoff: a generic LaunchFoundry render spec and a Britten-Reels-ready project.json that drops straight into the existing Remotion project.
      </p>

      <Card
        title="JSON handoff"
        eyebrow="LaunchFoundry render spec"
        action={
          <div className="button-row">
            <button onClick={handleCopySpec}>{copied === "spec" ? "Copied" : "Copy JSON"}</button>
            <button onClick={() => downloadJson(renderSpec.exportName.replace(".mp4", ".json"), renderSpec)}>Download</button>
          </div>
        }
      >
        <JsonViewer data={renderSpec} />
      </Card>

      {reels && (
        <Card title="One-click render" eyebrow="Easiest path">
          <p style={{ margin: "0 0 10px", fontSize: 13, lineHeight: 1.55, color: "var(--muted)" }}>
            Download one PowerShell script that does <strong>everything</strong>: copies the {needsCopyCount} flagged asset{needsCopyCount === 1 ? "" : "s"} into the shared render engine, writes <code>project.json</code> to the right path, runs the Remotion render, and {projectHome ? "moves the finished MP4 into your project folder and opens it" : "opens the finished MP4 when it's done"}. Walk away while it renders.
          </p>
          <div className="button-row" style={{ flexWrap: "wrap" }}>
            <button className="primary" onClick={handleDownloadFullScript}>
              Download render-{reels.slug}.ps1
            </button>
            <button
              onClick={async () => {
                try { await copyToClipboard(fullRenderScript); } catch {}
                flashCopy("copyScript");
              }}
            >
              {copied === "copyScript" ? "Copied" : "Copy script"}
            </button>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--muted-deep, var(--muted))", lineHeight: 1.6 }}>
            Right-click the downloaded <code>.ps1</code> → "Run with PowerShell".
            <br />
            <strong>Render engine:</strong>{" "}
            <code>C:\Sites\brittenwoodworking-reels</code>{" "}
            <em style={{ fontStyle: "normal", color: "var(--muted)" }}>(shared Remotion templates — every project renders through this)</em>
            <br />
            <strong>Final MP4:</strong>{" "}
            <code>
              {projectHome
                ? `${projectHome}\\out\\${renderSpec.exportName || `${reels.slug}.mp4`}`
                : `C:\\Sites\\brittenwoodworking-reels\\out\\full\\${renderSpec.exportName || `${reels.slug}.mp4`}`}
            </code>
            {!projectHome && (
              <>
                <br />
                <em style={{ fontStyle: "normal", color: "var(--muted)" }}>
                  (No project home detected — set the "Absolute root path" on the Project Scan page next time to land the MP4 in your project folder instead.)
                </em>
              </>
            )}
          </p>
        </Card>
      )}

      <Card
        title={reels ? `Reels project.json — ${reels.template}` : "Reels project.json — incomplete"}
        eyebrow={reels ? "Manual handoff (advanced)" : "Britten reels bridge"}
        action={
          reels && (
            <div className="button-row">
              <button onClick={handleCopyReels}>{copied === "reels" ? "Copied" : "Copy JSON"}</button>
              <button onClick={() => downloadJson("project.json", reels.project)}>Download project.json</button>
            </div>
          )
        }
      >
        {!reels && (
          <div
            style={{
              padding: "12px 14px",
              background: "rgba(201, 122, 74, 0.12)",
              borderLeft: "3px solid var(--danger, #c97a4a)",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            <strong>This concept can't be exported to the reels project yet.</strong>
            <br />
            {reelsResult.ok ? null : reelsResult.error}
            <br />
            Edit the concept's scenes (Storyboard page) so the template has the photos it needs, or pick a different concept.
          </div>
        )}
        {reels && (
          <>
            <p style={{ margin: "0 0 8px", fontSize: 13 }}>
              Drop into: <code>{reelsTargetPath}</code>
            </p>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted, #888)" }}>
              Template detected: <strong>{reels.template}</strong> · Render with:{" "}
              <code>
                {reels.template === "ProjectShowcase" && `.\\scripts\\render.ps1 -Template ProjectShowcase -ProjectSlug ${reels.slug}`}
                {reels.template === "BeforeAfter" && `.\\scripts\\render.ps1 -Template BeforeAfter -ProjectSlug ${reels.slug}`}
                {reels.template === "ProcessClip" && `.\\scripts\\render.ps1 -Template ProcessClip -ProjectSlug ${reels.slug}`}
              </code>
            </p>
            {needsCopyCount > 0 && (
              <div
                style={{
                  padding: "10px 14px",
                  marginBottom: 12,
                  background: "rgba(184, 134, 78, 0.12)",
                  borderLeft: "3px solid #B8864E",
                  fontSize: 13,
                  lineHeight: 1.55,
                }}
              >
                <div>
                  <strong>{needsCopyCount} asset(s) live outside the reels project</strong> and need to be copied into{" "}
                  <code>brittenwoodworking-reels/public/photos/</code> before rendering.
                </div>
                <div className="button-row" style={{ marginTop: 10, flexWrap: "wrap" }}>
                  <button onClick={handleCopyInline}>
                    {copied === "copyJson" ? "Copied" : "Copy commands → paste into PowerShell"}
                  </button>
                  <button onClick={handleCopyScript}>
                    {copied === "copyScript" ? "Copied" : "Copy full script"}
                  </button>
                  <button onClick={handleDownloadScript}>Download copy-assets.ps1</button>
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)" }}>
                  Open a PowerShell window anywhere → paste → done. Or save the .ps1 and right-click → "Run with PowerShell".
                </p>
              </div>
            )}
            <JsonViewer data={reels.project} />
            {reels.pathRewrites.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 13 }}>Asset path rewrites ({reels.pathRewrites.length})</summary>
                <pre style={{ marginTop: 8, fontSize: 12, background: "rgba(0,0,0,0.04)", padding: 10, borderRadius: 6, overflow: "auto", maxHeight: 240 }}>
                  {reels.pathRewrites.map(r => `${r.needsCopy ? "📋 copy" : "  ok  "}  ${r.from}\n         →  ${r.to}`).join("\n")}
                </pre>
              </details>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
