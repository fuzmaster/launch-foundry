import type { ProjectAsset } from "../types";

/**
 * Heuristically locate the project's "home" folder from its assets' absolute paths.
 * Returned in Windows-style backslashes for direct use in PowerShell scripts.
 *
 * Strategy:
 *   1. Filter to assets with absolute Windows paths (drive-letter prefix).
 *   2. Take the deepest common directory prefix.
 *   3. Strip a trailing source-subdir like "public", "src", "static", "images",
 *      "assets" — those are inside the project, not its root.
 *
 * Returns null when no usable prefix can be found (e.g. built-in project with
 * no scanned assets, or the user never typed the absolute-root path during scan).
 */
// Folders that belong to LaunchFoundry's render engine, not to any user project.
// Assets that live inside one of these are excluded from project-home detection
// (they're shared infrastructure, not deliverable destinations).
const ENGINE_FOLDERS = ["brittenwoodworking-reels", "launchfoundry-lite"];

export function findProjectHome(assets: ProjectAsset[]): string | null {
  const paths = assets
    .map(a => (a.path || "").replace(/\\/g, "/"))
    .filter(p => /^[A-Za-z]:\//.test(p))
    .filter(p => !ENGINE_FOLDERS.some(eng => p.toLowerCase().includes(`/${eng}/`)));
  if (paths.length === 0) return null;

  const segmented = paths.map(p => p.split("/"));
  const minLen = Math.min(...segmented.map(s => s.length));
  let i = 0;
  while (i < minLen && segmented.every(s => s[i] === segmented[0]![i])) i++;
  let prefix = segmented[0]!.slice(0, i);
  if (prefix.length === 0) return null;

  // Strip well-known internal subdirs so we end up at the project root.
  const KNOWN_SUBDIRS = new Set(["public", "src", "static", "images", "assets", "media"]);
  while (prefix.length > 1 && KNOWN_SUBDIRS.has((prefix[prefix.length - 1] ?? "").toLowerCase())) {
    prefix.pop();
  }

  // Reject too-shallow results that aren't really project homes.
  // After stripping, the path should be at least: <Drive> + <Workspace> + <ProjectName>
  // e.g. ["C:", "Sites", "will-my-helix-work"] (length >= 3).
  if (prefix.length < 3) return null;

  return prefix.join("\\");
}

/** Default output filename derivation when an explicit exportName isn't set. */
export function defaultOutputName(projectHome: string | null, slug: string): string {
  const home = projectHome ?? "";
  const last = home.split(/[/\\]/).filter(Boolean).pop();
  return `${last ? `${last}-` : ""}${slug}.mp4`;
}
