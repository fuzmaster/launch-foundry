import type { AssetType, ProjectAsset } from "../types";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "avif", "gif", "bmp"]);
const VECTOR_EXT = new Set(["svg"]);
const VIDEO_EXT = new Set(["mp4", "mov", "webm", "m4v", "avi"]);
const AUDIO_EXT = new Set(["mp3", "wav", "flac", "m4a", "aac", "ogg"]);
const DOC_EXT = new Set(["md", "pdf", "txt", "doc", "docx"]);

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function inferType(name: string): AssetType {
  const ext = extOf(name);
  const lower = name.toLowerCase();
  // Logos/icons by filename hint (favicon, logo, brand-mark, apple-touch-icon, etc.)
  if (/^(favicon|logo|brand[-_]?mark|apple[-_]?touch[-_]?icon|wordmark)/.test(lower) || lower.includes("/logo")) {
    return "logo";
  }
  if (VECTOR_EXT.has(ext)) return "logo"; // SVGs at root are usually brand marks
  if (IMAGE_EXT.has(ext)) {
    if (/screen(shot)?|capture|ui[-_]?shot|preview/.test(lower)) return "screenshot";
    return "image";
  }
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (DOC_EXT.has(ext)) return "document";
  return "other";
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".vite",
  ".cache",
  "coverage",
  "out",
  ".vscode",
  ".idea",
  ".turbo",
]);

// Filenames (or filename prefixes) that are infrastructure, not marketing material.
const NOISE_NAMES = new Set([
  ".gitignore",
  ".gitattributes",
  ".gitmodules",
  ".npmrc",
  ".nvmrc",
  ".prettierignore",
  ".eslintignore",
  ".editorconfig",
  ".ds_store",
  "thumbs.db",
  "license",
  "license.md",
  "license.txt",
  "copying",
  "authors",
  "contributors",
  "changelog.md",
  "changelog",
  "robots.txt",
  "sitemap.xml",
  "site.webmanifest",
  "browserconfig.xml",
  "_redirects",
  "netlify.toml",
  "vercel.json",
  "render.yaml",
]);

const NOISE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "json", "css", "scss", "sass", "less",
  "html", "lock", "map", "log",
  "tsbuildinfo", "d.ts",
  "yml", "yaml", "toml", "ini", "cfg", "env",
  "csv", "tsv",
  "py", "rb", "go", "rs", "java", "kt", "swift", "c", "cpp", "h", "hpp",
  "sql", "sh", "bat", "ps1",
]);

const NOISE_PREFIXES = [".env", ".thumbnail"];

function skipped(path: string): boolean {
  return path.split("/").some(seg => SKIP_DIRS.has(seg));
}

function isNoiseFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  if (NOISE_NAMES.has(lower)) return true;
  if (NOISE_PREFIXES.some(p => lower.startsWith(p))) return true;
  const ext = extOf(filename);
  if (ext && NOISE_EXTENSIONS.has(ext)) return true;
  return false;
}

function tagsFor(relPath: string, type: AssetType): string[] {
  const parts = relPath.toLowerCase().split("/");
  const tags = new Set<string>();
  // First subdir under root is usually the category (cabinetry/, photos/, screenshots/)
  if (parts.length > 1) tags.add(parts[0]!.replace(/[^a-z0-9]/g, "-"));
  tags.add(type);
  const lower = relPath.toLowerCase();
  if (/hero|cover|og-image/.test(lower)) tags.add("hero");
  if (/before/.test(lower)) tags.add("before");
  if (/after|finished|reveal/.test(lower)) tags.add("after");
  if (/process|step|stage/.test(lower)) tags.add("process");
  return Array.from(tags).slice(0, 6);
}

function makeId(relPath: string): string {
  // Stable, short, filesystem-safe id.
  return relPath.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 80);
}

// Priority order for text source files Claude should read to infer brand.
const SOURCE_TEXT_NAMES = [
  "readme.md",
  "readme",
  "package.json",
  "index.html",
  "robots.txt",
  "sitemap.xml",
  "claude.md",
  "manifest.json",
];

const MAX_BYTES_PER_FILE = 12_000;     // Trim per-file so one giant README doesn't dominate.
const MAX_BYTES_TOTAL = 32_000;        // Hard ceiling for the entire excerpt block.
const MAX_PERSISTED_PREVIEW_BYTES = 2_000_000;

function isSourceText(name: string): boolean {
  return SOURCE_TEXT_NAMES.includes(name.toLowerCase());
}

async function readTextSafe(f: File, limit: number): Promise<string> {
  try {
    const slice = f.size > limit ? f.slice(0, limit) : f;
    return await slice.text();
  } catch {
    return "";
  }
}

function readDataUrlSafe(f: File): Promise<string | null> {
  if (f.size > MAX_PERSISTED_PREVIEW_BYTES) return Promise.resolve(null);
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(f);
  });
}

/**
 * Convert a FileList from <input webkitdirectory> into ProjectAssets.
 * `rootAbsPath` (optional) is prepended to each file's webkitRelativePath
 * so the reels adapter has full disk paths for asset copy planning.
 *
 * Returns a `previewUrls` map of asset.id → blob URL for image/video files,
 * so the caller can show thumbnails without persisting unserializable URLs.
 * Callers MUST call URL.revokeObjectURL on these when they're no longer needed.
 *
 * Returns a `previewDataUrls` map for small images/logos/screenshots. These
 * are serializable thumbnails that survive reloads in localStorage.
 *
 * Returns a `sourceExcerpts` map of `relPath` → text content (up to ~12 KB
 * per file, capped at ~32 KB total) for files Claude needs to actually read
 * to infer the brand (README, package.json, index.html, etc.).
 */
export async function scanFolder(files: FileList | File[], rootAbsPath?: string): Promise<{
  rootFolderName: string;
  assets: ProjectAsset[];
  skippedCount: number;
  previewUrls: Record<string, string>;
  previewDataUrls: Record<string, string>;
  sourceExcerpts: Record<string, string>;
}> {
  const list = Array.from(files);
  let rootFolderName = "";
  const assets: ProjectAsset[] = [];
  const previewUrls: Record<string, string> = {};
  const previewDataUrlJobs: Array<Promise<[string, string | null]>> = [];
  let skippedCount = 0;
  const rootClean = (rootAbsPath ?? "").trim().replace(/[/\\]+$/, "");

  // First pass: build assets list, track which files to read for source excerpts.
  const sourceFilesToRead: Array<{ f: File; relInProject: string }> = [];

  for (const f of list) {
    // webkitRelativePath looks like "strictsub/src/main.ts" — first segment is the picked folder name.
    const rel = (f as unknown as { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const norm = rel.replace(/\\/g, "/");
    if (!rootFolderName) {
      const firstSlash = norm.indexOf("/");
      rootFolderName = firstSlash >= 0 ? norm.slice(0, firstSlash) : norm;
    }
    if (skipped(norm)) {
      skippedCount++;
      continue;
    }
    const filename = norm.split("/").pop() ?? norm;
    const inProjectPath = norm.split("/").slice(1).join("/") || filename; // strip first folder
    const type = inferType(norm);

    // Source-text files we want Claude to read even if they wouldn't normally be marketing assets.
    const isSrc = isSourceText(filename);
    if (isSrc) {
      sourceFilesToRead.push({ f, relInProject: inProjectPath });
    }

    // Drop infrastructure / config / boilerplate from the asset list.
    // README is queued for sourceExcerpts above; it shouldn't ALSO clutter the asset grid.
    if (isNoiseFile(filename) || isSrc) {
      skippedCount++;
      continue;
    }

    const absPath = rootClean ? `${rootClean.replace(/\\/g, "/")}/${inProjectPath}` : norm;
    const id = makeId(norm);

    // Build a thumbnail blob URL for images + videos. Logos & SVGs are also previewable.
    if ((type === "image" || type === "logo" || type === "screenshot" || type === "video") && f.size > 0) {
      try {
        previewUrls[id] = URL.createObjectURL(f);
      } catch {
        // No-op — synthetic files in tests have no real blob backing.
      }
      if (type !== "video") {
        previewDataUrlJobs.push(readDataUrlSafe(f).then(dataUrl => [id, dataUrl]));
      }
    }

    assets.push({
      id,
      filename,
      path: absPath,
      type,
      tags: tagsFor(inProjectPath, type),
      notes: undefined,
      qualityScore: undefined,
    });
  }

  // Second pass: read text from priority source files, capped at MAX_BYTES_TOTAL.
  const sourceExcerpts: Record<string, string> = {};
  let totalBytes = 0;
  // Prioritise: README → package.json → index.html → others
  sourceFilesToRead.sort((a, b) => {
    const ord = (name: string) => SOURCE_TEXT_NAMES.indexOf(name.toLowerCase().split("/").pop() ?? "");
    return ord(a.relInProject) - ord(b.relInProject);
  });
  for (const { f, relInProject } of sourceFilesToRead) {
    if (totalBytes >= MAX_BYTES_TOTAL) break;
    const remaining = MAX_BYTES_TOTAL - totalBytes;
    const limit = Math.min(MAX_BYTES_PER_FILE, remaining);
    const text = await readTextSafe(f, limit);
    if (!text.trim()) continue;
    sourceExcerpts[relInProject] = text;
    totalBytes += text.length;
  }

  const previewDataUrls: Record<string, string> = {};
  for (const [id, dataUrl] of await Promise.all(previewDataUrlJobs)) {
    if (dataUrl) previewDataUrls[id] = dataUrl;
  }

  return { rootFolderName, assets, skippedCount, previewUrls, previewDataUrls, sourceExcerpts };
}

export function summarizeByType(assets: ProjectAsset[]): Record<string, number> {
  return assets.reduce<Record<string, number>>((acc, a) => {
    acc[a.type] = (acc[a.type] ?? 0) + 1;
    return acc;
  }, {});
}
