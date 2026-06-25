// Feature-detected Tauri bridge. When the app runs inside the Tauri shell,
// we expose render_reel/cancel_render/open_path_in_explorer commands. In the
// plain browser, isTauri() returns false and the existing PowerShell-script
// path stays the only render route.

import type { OutputFormat, QualityPreset, StudioInputs } from "./studioScript";

type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
type TauriListen = (event: string, handler: (e: { payload: LogEvent }) => void) => Promise<() => void>;

let _invoke: TauriInvoke | null = null;
let _listen: TauriListen | null = null;
let _loadAttempted = false;

async function load(): Promise<{ invoke: TauriInvoke; listen: TauriListen } | null> {
  if (_loadAttempted) {
    return _invoke && _listen ? { invoke: _invoke, listen: _listen } : null;
  }
  _loadAttempted = true;
  // Tauri injects __TAURI_INTERNALS__ at runtime. If absent, we're in a normal
  // browser tab — skip importing the API entirely (the module exists in deps
  // but accessing core/event without the injection would throw on import).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (window as any).__TAURI_INTERNALS__ === "undefined") return null;
  try {
    const core = await import("@tauri-apps/api/core");
    const event = await import("@tauri-apps/api/event");
    _invoke = core.invoke as TauriInvoke;
    _listen = event.listen as TauriListen;
    return { invoke: _invoke, listen: _listen };
  } catch (err) {
    console.warn("[tauriBridge] failed to load @tauri-apps/api:", err);
    return null;
  }
}

export function isTauri(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof window !== "undefined" && typeof (window as any).__TAURI_INTERNALS__ !== "undefined";
}

export type LogEvent = {
  level: "info" | "warn" | "error" | "step";
  message: string;
};

export type RenderRequest = {
  projectHome: string;
  reelsEngine: string;
  slug: string;
  sourceFiles: Record<string, string>;          // "index.ts" → contents
  assetSources: string[];                       // project-relative
  droppedImages: { filename: string; base64: string }[];
  /** Optional soundtrack. Decoded by Rust into engine/photos/<filename>. */
  audio?: { filename: string; base64: string };
  outputs: { compositionId: string; label: string }[];
  scale: number;
  crf: number;
};

export type RenderResult = {
  produced: string[];
  failed: string[];
};

/** Render via the Tauri-side Rust pipeline. Throws if not running in Tauri. */
export async function renderInApp(req: RenderRequest, onLog: (e: LogEvent) => void): Promise<RenderResult> {
  const api = await load();
  if (!api) throw new Error("Not running in Tauri shell");
  const unlisten = await api.listen("render-log", e => onLog(e.payload));
  try {
    return await api.invoke<RenderResult>("render_reel", { req });
  } finally {
    unlisten();
  }
}

export async function cancelRender(): Promise<void> {
  const api = await load();
  if (!api) return;
  await api.invoke<void>("cancel_render");
}

export async function openInExplorer(path: string): Promise<void> {
  const api = await load();
  if (!api) return;
  await api.invoke<void>("open_path_in_explorer", { path });
}

// ─── Bridge from StudioInputs → RenderRequest ────────────────────────────────
// The PowerShell script generator produces source-file CONTENTS; we just need
// to extract those same contents and pass them to Rust instead of writing a
// .ps1. To avoid duplicating the generator logic, we re-use it by handing the
// script generator a sentinel and pulling the inner pieces out — but cleaner
// is to expose the source-file factories directly. For D-1 we extract from
// the generated script by anchored regex (one round-trip per render — fine).

import { buildStudioScript, OUTPUT_FORMATS, QUALITY_PRESETS } from "./studioScript";

/** Pull each Set-Content @'…'@ block out of the generated PS script so we can
 *  pass the raw file contents to the Rust side. The blocks were emitted in a
 *  known order: index.ts, Root.tsx, Reel.tsx, data.ts. */
function extractSourceFiles(script: string): Record<string, string> {
  const names = ["index.ts", "Root.tsx", "Reel.tsx", "data.ts"];
  const out: Record<string, string> = {};
  for (const name of names) {
    const re = new RegExp(
      String.raw`Set-Content -Path "\$ReelDir\\` + name.replace(/\./g, String.raw`\.`) + String.raw`" -Encoding UTF8 -Value @'\n([\s\S]*?)\n'@`,
      "m",
    );
    const m = script.match(re);
    if (m) out[name] = m[1]!;
  }
  return out;
}

export function studioInputsToRequest(i: StudioInputs): RenderRequest {
  const script = buildStudioScript(i);
  const sourceFiles = extractSourceFiles(script);
  const picks: OutputFormat[] = i.outputs && i.outputs.length ? i.outputs : ["9x16"];
  const outputs = picks.map(id => {
    const fmt = OUTPUT_FORMATS.find(f => f.id === id)!;
    return { compositionId: `Reel-${id}`, label: fmt.label };
  });
  const quality = QUALITY_PRESETS.find(q => q.id === (i.quality ?? "standard"))!;
  return {
    projectHome: i.projectHomeWin,
    reelsEngine: i.reelsEngineWin,
    slug: i.slug,
    sourceFiles,
    assetSources: i.assetSources,
    droppedImages: (i.droppedImages ?? []).map(d => ({ filename: d.filename, base64: d.base64 })),
    audio: i.audioFilename && i.audioBase64 ? { filename: i.audioFilename, base64: i.audioBase64 } : undefined,
    outputs,
    scale: quality.scale,
    crf: quality.crf,
  };
}

// Keep `_invoke`/`_listen` typed without `any` polluting the export surface.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _QualityPreset = QualityPreset;
