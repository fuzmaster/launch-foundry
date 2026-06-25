import type { BrandProfile } from "../types";

/**
 * Try to extract a one-liner + category from README.md text.
 * One-liner = first non-heading, non-empty line.
 * Category = first heading after the title (if it's short).
 */
function fromReadme(text: string): { oneLiner?: string; category?: string } {
  const lines = text.split(/\r?\n/).map(l => l.trim());
  let oneLiner: string | undefined;
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith(">") || line.startsWith("---")) continue;
    if (line.startsWith("[") && line.endsWith(")")) continue; // pure badge / link rows
    if (/^!\[/.test(line)) continue; // image markdown
    // Use first paragraph as one-liner — strip markdown emphasis.
    oneLiner = line.replace(/[*_`]/g, "").trim();
    break;
  }
  if (oneLiner && oneLiner.length > 220) {
    oneLiner = oneLiner.slice(0, 217).trim() + "…";
  }
  return { oneLiner };
}

/**
 * Pull description (and optionally name) out of a package.json text blob.
 */
function fromPackageJson(text: string): { description?: string; name?: string } {
  try {
    const parsed = JSON.parse(text) as { description?: string; name?: string };
    return { description: parsed.description, name: parsed.name };
  } catch {
    return {};
  }
}

/**
 * Pull <title> and <meta name="description"> out of an index.html text blob.
 */
function fromIndexHtml(text: string): { title?: string; description?: string } {
  const titleMatch = text.match(/<title>([^<]+)<\/title>/i);
  const descMatch = text.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
    || text.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
  return {
    title: titleMatch?.[1]?.trim(),
    description: descMatch?.[1]?.trim(),
  };
}

/**
 * Merge inferences from any source files into a BrandProfile draft. Anything
 * we can't infer stays as the placeholder. Existing non-empty fields in the
 * base brand are preserved.
 */
export function inferBrandFromSources(base: BrandProfile, sources: Record<string, string>): BrandProfile {
  const out: BrandProfile = { ...base };

  // Find sources by filename (case-insensitive, leading subpath possible)
  const find = (name: string) => {
    const lower = name.toLowerCase();
    for (const key of Object.keys(sources)) {
      if (key.toLowerCase().endsWith(lower)) return sources[key];
    }
    return undefined;
  };
  const readme = find("readme.md") ?? find("readme");
  const pkg = find("package.json");
  const idx = find("index.html");

  const readmeFacts = readme ? fromReadme(readme) : {};
  const pkgFacts = pkg ? fromPackageJson(pkg) : {};
  const idxFacts = idx ? fromIndexHtml(idx) : {};

  const placeholderRe = /\(infer from the scan\)|^$/;

  if (placeholderRe.test(out.oneLiner)) {
    out.oneLiner = readmeFacts.oneLiner
      ?? pkgFacts.description
      ?? idxFacts.description
      ?? out.oneLiner;
  }
  if (placeholderRe.test(out.offerSummary)) {
    out.offerSummary = pkgFacts.description
      ?? readmeFacts.oneLiner
      ?? idxFacts.description
      ?? out.offerSummary;
  }
  if (placeholderRe.test(out.category)) {
    // Lightweight guess — title minus the brand name often reads like a category.
    const title = idxFacts.title;
    if (title) {
      const parts = title.split(/[|·—–-]/).map(p => p.trim()).filter(Boolean);
      out.category = parts.slice(1).join(" · ") || parts[0] || out.category;
    }
  }
  return out;
}
