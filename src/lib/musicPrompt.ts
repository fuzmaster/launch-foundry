// Round F — music brief generator. Same paste-out / drop-back pattern as
// imagePrompt.ts: the user clicks Copy, pastes into Suno / Udio / Mubert,
// downloads the produced MP3, drops it back into LF.
//
// Each provider has its own preferred prompt style. Suno likes
// genre-mood-bpm-instrumentation lines. Mubert wants bare concept tags.
// Pixabay/YT Audio Library/FMA are SEARCH services — we open them with a
// keyword-prefilled URL instead of generating a brief.

import type { BrandTokens } from "./brandExtract";

export type MusicProvider =
  | "suno"          // free + paid tiers, generative; takes structured prompt
  | "udio"          // generative; tag-style prompt
  | "mubert"        // generative; uses mood/genre tags
  | "pixabay"       // search-based; free royalty-free library
  | "youtube-audio" // search-based; YouTube Studio Audio Library
  | "fma";          // search-based; Free Music Archive (CC-licensed)

export const MUSIC_PROVIDERS: Record<MusicProvider, {
  label: string;
  homepage: string;
  /** If "generative", show the brief + Copy button. If "search", show a quick-link
   *  that opens the homepage's search with a brand-derived query. */
  mode: "generative" | "search";
  /** Search URL template; {q} gets URL-encoded keywords. Used when mode === "search". */
  searchUrlTemplate?: string;
  blurb: string;
}> = {
  suno: {
    label: "Suno",
    homepage: "https://suno.com/create",
    mode: "generative",
    blurb: "Free tier · best output quality · ~2 min clips. Paste the brief into Suno's custom prompt.",
  },
  udio: {
    label: "Udio",
    homepage: "https://www.udio.com/create",
    mode: "generative",
    blurb: "Free tier · 32-second clips · tag-style prompt. Good for vocals.",
  },
  mubert: {
    label: "Mubert",
    homepage: "https://mubert.com/render",
    mode: "generative",
    blurb: "Free tier · tag-driven · pure royalty-free license for commercial use.",
  },
  pixabay: {
    label: "Pixabay Music",
    homepage: "https://pixabay.com/music/",
    mode: "search",
    searchUrlTemplate: "https://pixabay.com/music/search/{q}/",
    blurb: "Free royalty-free library · no signup · MP3 + WAV downloads.",
  },
  "youtube-audio": {
    label: "YouTube Audio Library",
    homepage: "https://studio.youtube.com/channel/UC/music",
    mode: "search",
    searchUrlTemplate: "https://studio.youtube.com/channel/UC/music?searchTerm={q}",
    blurb: "Free for any use including monetization. Requires YouTube account.",
  },
  fma: {
    label: "Free Music Archive",
    homepage: "https://freemusicarchive.org/search",
    mode: "search",
    searchUrlTemplate: "https://freemusicarchive.org/search/?quicksearch={q}",
    blurb: "Curated CC-licensed library · check per-track license terms before commercial use.",
  },
};

export type MusicBriefInputs = {
  /** Pulled from BrandTokens — used to set the visual/sonic vibe. */
  brandVibe: string;          // e.g. "warm artisanal craftsmanship, brass + walnut"
  /** Short summary of what the reel is about — drives mood. */
  conceptHook: string;        // e.g. "30 years of built-in-place carpentry"
  /** Reel total length in seconds (so the music can be cut to fit). */
  durationSeconds: number;
  /** Mood label the user picks — overrides the brand-derived default. */
  mood?: string;              // e.g. "uplifting", "intimate", "tense build to release"
  /** BPM range hint, useful for video-pace sync. */
  bpm?: string;               // e.g. "70-90"
};

function moodFromBrand(tokens: BrandTokens): string {
  // Cheap heuristic: warm/dark editorial brands → "intimate, cinematic"
  //                  bright/saturated brands → "energetic, bright"
  //                  mono/terminal motifs → "minimal electronic"
  if (/terminal|mono|blueprint/.test(tokens.motif)) return "minimal electronic, focused";
  if (tokens.motif === "vintage-paper" || tokens.motif === "editorial") return "warm cinematic, intimate";
  if (tokens.motif === "gradient") return "uplifting, modern pop";
  return "warm cinematic, contemplative";
}

/** Build a Suno-style structured brief. */
function briefSuno(i: MusicBriefInputs): string {
  return [
    `[Style] ${i.mood ?? "warm cinematic, intimate"}`,
    `[Instruments] acoustic guitar, soft piano, light percussion, ambient pad`,
    `[BPM] ${i.bpm ?? "70-90"}`,
    `[Mood] sets the brand vibe of "${i.brandVibe}", supports a hook about "${i.conceptHook}"`,
    `[Structure] no vocals · intro (4s) · build (mid) · soft outro · loopable`,
    `[Duration] aim for ~${i.durationSeconds}s, can crop to fit`,
    `[Negative] no harsh drops, no EDM build-ups, no copyrighted melodies`,
  ].join("\n");
}

/** Build a Udio tag-style brief. */
function briefUdio(i: MusicBriefInputs): string {
  const tags = [
    i.mood ?? "warm cinematic",
    "acoustic",
    "instrumental",
    "soft percussion",
    "ambient",
    `${i.bpm ?? "75"} bpm`,
    `${i.durationSeconds}s`,
    "no vocals",
    "background music",
  ];
  return tags.join(", ");
}

/** Mubert prefers a single concise mood phrase. */
function briefMubert(i: MusicBriefInputs): string {
  return [i.mood ?? "warm cinematic", "instrumental", "no vocals", `${i.bpm ?? "80"} bpm`].join(", ");
}

export function buildMusicBrief(provider: MusicProvider, i: MusicBriefInputs): string {
  if (provider === "suno") return briefSuno(i);
  if (provider === "udio") return briefUdio(i);
  if (provider === "mubert") return briefMubert(i);
  return ""; // search-mode providers don't generate a brief
}

/** Derive a 1-2 word search keyword set from brand + concept for the
 *  search-based providers. Pixabay/YT/FMA queries do best with short tags. */
export function searchKeywords(tokens: BrandTokens, conceptHook: string, mood?: string): string {
  const m = mood ?? moodFromBrand(tokens);
  const hookWord = conceptHook.split(/\s+/).filter(w => w.length > 4)[0] ?? "";
  const parts = [m.split(",")[0]!.trim(), "instrumental", hookWord].filter(Boolean);
  return parts.join(" ");
}

/** Open the chosen provider's search page or homepage in a new tab. */
export function openProvider(provider: MusicProvider, q: string): void {
  const p = MUSIC_PROVIDERS[provider];
  let url = p.homepage;
  if (p.mode === "search" && p.searchUrlTemplate) {
    url = p.searchUrlTemplate.replace("{q}", encodeURIComponent(q));
  }
  window.open(url, "_blank", "noopener");
}

/** Convenience: default brief inputs from current brand + reel context. */
export function makeBriefInputs(tokens: BrandTokens, conceptHook: string, durationSeconds: number, moodOverride?: string): MusicBriefInputs {
  return {
    brandVibe: [tokens.motif, tokens.fontDisplay.replace(/['"]/g, "").split(",")[0]!.trim()].join(", "),
    conceptHook,
    durationSeconds,
    mood: moodOverride ?? moodFromBrand(tokens),
  };
}
