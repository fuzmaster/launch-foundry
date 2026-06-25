import type { BrandTokens, Motif } from "./brandExtract";

export type DesignPromptInputs = {
  folderName: string;
  cssTexts: string[];
  readmeText: string;
  packageJsonText: string;
  indexHtmlText: string;
  assetFilenames: string[];
};

export type StudioImport = {
  tokens?: Partial<BrandTokens>;
  copy?: { eyebrow?: string; tagline?: string; oneLiner?: string; cta?: string; url?: string };
  steps?: Array<{ label: string; sub: string; suggestedAssetHint?: string }>;
  personality?: { tone?: string; voice?: string; feel?: string };
  notes?: string[];
};

export type ImportResult = { ok: true; value: StudioImport; warnings: string[] } | { ok: false; error: string };

const MAX_CSS_BYTES = 12_000;
const MAX_README_BYTES = 8_000;
const MAX_HTML_BYTES = 6_000;

function trim(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "\n[…truncated]" : s;
}

export function buildClaudeDesignPrompt(i: DesignPromptInputs): string {
  const cssBlob = i.cssTexts.map((c, idx) => `\n\n#### css file ${idx + 1}\n\n\`\`\`css\n${trim(c, MAX_CSS_BYTES / Math.max(1, i.cssTexts.length))}\n\`\`\``).join("");

  return `# Reels Studio — design pass

You are a design system reader. Read THIS project's files below and return one
JSON object describing a visual identity that will drive a 9:16 Facebook Reel
for the project. Match what's actually on the site — don't impose a generic
template. Don't invent colors that aren't supported by the CSS, and don't
recommend fonts the project doesn't already use unless the project's typography
is genuinely missing.

Return only the JSON. No prose. No Markdown fences.

## Project: ${i.folderName}

### README.md (top)

\`\`\`md
${trim(i.readmeText || "(no README)", MAX_README_BYTES)}
\`\`\`

### package.json

\`\`\`json
${trim(i.packageJsonText || "{}", 2_000)}
\`\`\`

### index.html (head + body opening)

\`\`\`html
${trim(i.indexHtmlText || "", MAX_HTML_BYTES)}
\`\`\`

### CSS files
${cssBlob || "\n(no CSS files found)"}

### Asset filenames (for context — these are the images/videos available)

${i.assetFilenames.length === 0 ? "(none)" : i.assetFilenames.map(f => `- ${f}`).join("\n")}

---

## Return shape (single JSON object)

\`\`\`ts
{
  "tokens": {
    "background": string,       // hex from the actual site
    "surface": string,          // a slight shift from background, lighter or darker by ~5-10%
    "text": string,             // primary text color from the site
    "textSoft": string,         // rgba() with 0.55-0.7 alpha of text
    "accent": string,           // the brand's single primary accent
    "accentSoft": string,       // rgba() with 0.15-0.2 alpha of accent
    "fontDisplay": string,      // CSS font-family string, e.g. "'Roboto Slab', Georgia, serif"
    "fontBody": string,         // CSS font-family string
    "googleFontsHref": string,  // ready-to-use <link> URL for the two fonts above
    "motif": "graph-paper" | "editorial" | "gradient" | "minimal" | "blueprint" | "mono"
                                // pick what matches the project's vibe (engineering tool → graph-paper, podcast → editorial, etc.)
  },
  "copy": {
    "eyebrow": string,          // ALL CAPS, 1-3 words, sits above the title
    "tagline": string,          // 2-4 words for the title card, e.g. "Five risks"
    "oneLiner": string,         // ≤ 14 words, end-card line — describe what the tool does
    "cta": string,              // imperative, e.g. "Check your helix — free"
    "url": string               // bare domain or path, no protocol
  },
  "steps": [
    { "label": string,          // 1-2 words ALL CAPS
      "sub": string,            // ≤ 8 words, plain English
      "suggestedAssetHint": string  // which of the asset filenames pairs with this step + why
    }
    // EXACTLY 4 steps. Match them to the assets available — name the file in suggestedAssetHint.
  ],
  "personality": {
    "tone": string,             // 3-5 adjectives
    "voice": string,            // "builder-to-builder" | "expert-but-warm" | "playful" | etc.
    "feel": string              // 1 sentence describing the visual feel — graph paper? blueprint? editorial magazine?
  },
  "notes": string[]             // anything the user should know — confidence flags, what you guessed at, things to verify
}
\`\`\`

## Rules

1. Every hex color must come from the CSS provided. If the CSS doesn't include
   an accent, derive one from the favicon or recommend a tasteful complement
   and call it out in notes.
2. Steps must map to assets in the filename list. If only N < 4 usable assets
   exist, use the N most distinctive and put a note about it.
3. The motif must fit the project's category. Engineering/planning → graph-paper.
   Editorial/content → editorial. Marketing site → gradient or minimal.
   Code/dev tool → mono or blueprint.
4. Do not invent claims, pricing, or guarantees in the copy. Stay inside what
   the README/package.json actually support.
`;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asStr(v: unknown, fb = ""): string { return typeof v === "string" ? v : fb; }
function asStrArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function unwrap(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*\n([\s\S]+?)\n```/);
  if (fence) return fence[1]!.trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

export function parseStudioImport(raw: string): ImportResult {
  if (!raw.trim()) return { ok: false, error: "Paste the JSON Claude returned." };
  let parsed: unknown;
  try { parsed = JSON.parse(unwrap(raw)); } catch (e) {
    return { ok: false, error: `JSON parse failed: ${(e as Error).message}` };
  }
  if (!isObj(parsed)) return { ok: false, error: "Expected a JSON object." };

  const warnings: string[] = [];
  const out: StudioImport = {};

  if (isObj(parsed.tokens)) {
    const t = parsed.tokens;
    const motif = asStr(t.motif) as Motif;
    const ok: Motif[] = ["graph-paper", "editorial", "gradient", "minimal", "blueprint", "mono"];
    out.tokens = {
      background: asStr(t.background) || undefined,
      surface: asStr(t.surface) || undefined,
      text: asStr(t.text) || undefined,
      textSoft: asStr(t.textSoft) || undefined,
      accent: asStr(t.accent) || undefined,
      accentSoft: asStr(t.accentSoft) || undefined,
      fontDisplay: asStr(t.fontDisplay) || undefined,
      fontBody: asStr(t.fontBody) || undefined,
      googleFontsHref: asStr(t.googleFontsHref) || undefined,
      motif: ok.includes(motif) ? motif : undefined,
    };
  } else {
    warnings.push("No `tokens` block — color/font tokens left as-is.");
  }

  if (isObj(parsed.copy)) {
    const c = parsed.copy;
    out.copy = {
      eyebrow: asStr(c.eyebrow) || undefined,
      tagline: asStr(c.tagline) || undefined,
      oneLiner: asStr(c.oneLiner) || undefined,
      cta: asStr(c.cta) || undefined,
      url: asStr(c.url) || undefined,
    };
  }

  if (Array.isArray(parsed.steps)) {
    out.steps = parsed.steps
      .filter(isObj)
      .map(s => ({
        label: asStr(s.label),
        sub: asStr(s.sub),
        suggestedAssetHint: asStr(s.suggestedAssetHint) || undefined,
      }))
      .filter(s => s.label || s.sub);
    if (out.steps.length === 0) {
      warnings.push("`steps` was empty or malformed.");
      delete out.steps;
    }
  }

  if (isObj(parsed.personality)) {
    const p = parsed.personality;
    out.personality = {
      tone: asStr(p.tone) || undefined,
      voice: asStr(p.voice) || undefined,
      feel: asStr(p.feel) || undefined,
    };
  }

  out.notes = asStrArr(parsed.notes);
  return { ok: true, value: out, warnings };
}
