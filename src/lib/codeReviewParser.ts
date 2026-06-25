// Parse a "code-review dump" text file: a flat concatenation of many files,
// each separated by `===== FILE: <relative path> =====` markers.
// These dumps are produced by Claude / repo-export tools and are an easy way
// to feed LF without uploading a real folder.
//
// We translate the dump into:
//   • a list of pseudo-ProjectAsset entries (one per text file we find)
//   • a sourceExcerpts map (basename → contents) for the README/package/
//     index.html files the intake prompt knows how to inline.

import type { AssetType, ProjectAsset } from "../types";

/** Recognized text-file extensions that get full content captured as excerpts.
 *  Image / video / binary file paths are kept in the asset list but not in
 *  excerpts — image data isn't shipped in these dumps, just file references. */
const TEXT_EXT = new Set([
  "md", "txt", "html", "htm", "css", "scss", "less",
  "js", "jsx", "ts", "tsx", "mjs", "cjs",
  "json", "yml", "yaml", "toml", "xml",
  "py", "rb", "go", "rs", "java", "kt", "swift",
  "env", "ini", "conf", "config", "lock",
  "sh", "ps1", "bash", "zsh",
  "vue", "svelte", "astro",
  "sql", "graphql", "proto",
]);

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "ico", "bmp"]);
const VIDEO_EXT = new Set(["mp4", "webm", "mov", "avi", "mkv"]);
const AUDIO_EXT = new Set(["mp3", "wav", "ogg", "flac", "m4a"]);

function extOf(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "";
  return path.slice(dot + 1).toLowerCase();
}

function basename(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return slash < 0 ? path : path.slice(slash + 1);
}

function assetTypeFromPath(path: string): AssetType {
  const ext = extOf(path);
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (TEXT_EXT.has(ext)) return "document";
  return "other";
}

/** Files we don't want to surface even when present in the dump — they're
 *  noisy (lockfiles, IDE configs, build outputs) and would crowd the intake. */
function isSkippable(path: string): boolean {
  const lower = path.toLowerCase();
  if (/(^|[\/\\])\.git([\/\\]|$)/.test(lower)) return true;
  if (/(^|[\/\\])node_modules([\/\\]|$)/.test(lower)) return true;
  if (/(^|[\/\\])dist([\/\\]|$)/.test(lower)) return true;
  if (/(^|[\/\\])build([\/\\]|$)/.test(lower)) return true;
  if (/(^|[\/\\])\.next([\/\\]|$)/.test(lower)) return true;
  if (/(^|[\/\\])target([\/\\]|$)/.test(lower)) return true;
  if (/package-lock\.json$|yarn\.lock$|pnpm-lock\.yaml$|cargo\.lock$/.test(lower)) return true;
  if (/\.tsbuildinfo$|\.d\.ts$/.test(lower)) return true;
  return false;
}

export type ParsedCodeReview = {
  folderName: string;
  assets: ProjectAsset[];
  /** Keyed by basename (matches what scanFolder produces) — README.md / package.json / index.html / styles.css etc. */
  sourceExcerpts: Record<string, string>;
  skippedCount: number;
  totalFiles: number;
};

/** Split a dump into (path, content) tuples. Each delimiter line looks like:
 *  `===== FILE: <path> =====`. Tolerant of different whitespace/equal counts
 *  and tolerant of leading BOM/header text before the first marker. */
function splitDump(text: string): Array<{ path: string; content: string }> {
  // Normalize line endings and strip BOM.
  const normalized = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const re = /^={3,}\s*FILE:\s*(.+?)\s*={3,}\s*$/gm;
  const blocks: Array<{ path: string; content: string }> = [];
  let lastIndex = 0;
  let lastPath: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized)) !== null) {
    if (lastPath !== null) {
      const content = normalized.slice(lastIndex, match.index).replace(/^\n+/, "").replace(/\n+$/, "");
      blocks.push({ path: lastPath, content });
    }
    lastPath = match[1]!.trim();
    lastIndex = match.index + match[0].length;
  }
  if (lastPath !== null) {
    const content = normalized.slice(lastIndex).replace(/^\n+/, "").replace(/\n+$/, "");
    blocks.push({ path: lastPath, content });
  }
  return blocks;
}

/** Generic source-tree folder names that don't identify a project. If the
 *  most-common first segment is one of these, we fall back to the dump's
 *  filename (which usually does identify the project). */
const GENERIC_ROOTS = new Set([
  "src", "app", "apps", "lib", "libs", "packages", "components", "pages",
  "modules", "core", "shared", "public", "static", "assets", "docs",
  "scripts", "tests", "test", "spec", "stories",
]);

/** Guess a project label from the dump's path roots. Picks the most common
 *  first FOLDER segment that ISN'T a generic dev-tree name. Falls back to
 *  "review" if nothing dominates. */
function guessFolderName(blocks: Array<{ path: string }>): string {
  const counts = new Map<string, number>();
  for (const b of blocks) {
    const parts = b.path.split(/[\/\\]/);
    if (parts.length < 2) continue; // skip top-level files
    const seg = parts[0];
    if (!seg || seg.startsWith(".")) continue;
    if (GENERIC_ROOTS.has(seg.toLowerCase())) continue;
    counts.set(seg, (counts.get(seg) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [seg, n] of counts) {
    if (n > bestCount) { best = seg; bestCount = n; }
  }
  return best || "review";
}

/** Strip "-code-review.txt" / "-review.txt" / ".txt" suffixes so the dump's
 *  filename can stand in for a project label when no folder segments dominate. */
function deriveNameFromFilename(filename: string | undefined): string | null {
  if (!filename) return null;
  const stem = filename.replace(/\.[^.]+$/, "");
  const cleaned = stem.replace(/[-_](code-?review|review|dump|export)$/i, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function parseCodeReview(text: string, dumpFilename?: string): ParsedCodeReview {
  const blocks = splitDump(text);
  if (blocks.length === 0) {
    return { folderName: deriveNameFromFilename(dumpFilename) ?? "review", assets: [], sourceExcerpts: {}, skippedCount: 0, totalFiles: 0 };
  }

  const folderName = guessFolderName(blocks);
  // Prefer the filename-derived name when guessFolderName fell back to "review"
  // (i.e. there was no folder-segment majority).
  const finalName = folderName === "review" ? (deriveNameFromFilename(dumpFilename) ?? "review") : folderName;
  const assets: ProjectAsset[] = [];
  const sourceExcerpts: Record<string, string> = {};
  let skipped = 0;

  for (const { path, content } of blocks) {
    if (isSkippable(path)) { skipped++; continue; }

    const base = basename(path);
    const type = assetTypeFromPath(path);
    const ext = extOf(path);

    assets.push({
      id: `cr-${path.replace(/[^a-z0-9]/gi, "-")}`,
      filename: base,
      path: path.replace(/\\/g, "/"),
      type,
      tags: ["code-review-import"],
      // Document size in notes so the user can see what's substantial vs trivial.
      notes: type === "document" ? `${content.length} chars` : undefined,
    });

    if (TEXT_EXT.has(ext) && content.length > 0) {
      // The intake prompt's existing logic keys excerpts by BASENAME (README.md,
      // package.json, etc.). Match that convention so the prompt's auto-inline
      // step picks them up without extra wiring.
      sourceExcerpts[base] = content;
    }
  }

  return { folderName: finalName, assets, sourceExcerpts, skippedCount: skipped, totalFiles: blocks.length };
}
