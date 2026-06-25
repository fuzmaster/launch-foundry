import type { BrandTokens } from "./brandExtract";

/** Output aspect ratios the render pipeline can emit. Each maps to its own
 *  Composition in Root.tsx, so one script run can produce up to 4 MP4s. */
export type OutputFormat = "9x16" | "1x1" | "16x9" | "4x5";

export const OUTPUT_FORMATS: ReadonlyArray<{ id: OutputFormat; width: number; height: number; label: string; hint: string }> = [
  { id: "9x16", width: 1080, height: 1920, label: "Reel 9:16",    hint: "Instagram Reels · TikTok · Shorts" },
  { id: "1x1",  width: 1080, height: 1080, label: "Square 1:1",   hint: "Feed posts · LinkedIn" },
  { id: "16x9", width: 1920, height: 1080, label: "Wide 16:9",    hint: "YouTube · website hero" },
  { id: "4x5",  width: 1080, height: 1350, label: "Portrait 4:5", hint: "LinkedIn · Facebook feed" },
];

/** Quality preset: maps to Remotion's --scale and --crf flags. Draft cuts
 *  resolution to half for ~4× faster iteration. Final cranks bitrate. */
export type QualityPreset = "draft" | "standard" | "final";

export const QUALITY_PRESETS: ReadonlyArray<{ id: QualityPreset; scale: number; crf: number; label: string; speedHint: string }> = [
  { id: "draft",    scale: 0.5, crf: 28, label: "Draft",    speedHint: "Half resolution · ~4× faster · iteration" },
  { id: "standard", scale: 1.0, crf: 23, label: "Standard", speedHint: "Full resolution · Remotion default" },
  { id: "final",    scale: 1.0, crf: 18, label: "Final",    speedHint: "Full resolution · higher bitrate · larger file" },
];

export type StudioInputs = {
  projectName: string;        // human label, e.g. "Will My Helix Work"
  projectHomeWin: string;     // absolute Windows path, e.g. "C:\Sites\will-my-helix-work"
  reelsEngineWin: string;     // typically "C:\Sites\brittenwoodworking-reels"
  slug: string;               // e.g. "five-risks"
  oneLiner: string;
  tagline: string;            // 2-3 word end card tagline
  cta: string;                // e.g. "Check your helix — free"
  url: string;                // e.g. "will-my-helix-work.vercel.app"
  steps: Array<{ label: string; sub: string; assetFile: string }>; // ≤4
  tokens: BrandTokens;
  /** Relative paths inside the project folder, e.g. ["public/spot-blueprints.png"] */
  assetSources: string[];
  /** Generated images dropped into the browser. They get base64-embedded
   *  in the script and decoded into the engine's photos/ folder at runtime. */
  droppedImages?: Array<{ filename: string; base64: string }>;
  /** Layout-specific extras. */
  kineticPhrases?: string[];  // for layout="kinetic-text" — 4-8 short phrases
  quote?: { text: string; author: string; role?: string };
  heroAssetFile?: string;     // for layout="parallax-hero"
  beforeAfter?: { before: string; after: string; beforeLabel?: string; afterLabel?: string };
  bigNumber?: { value: string; suffix?: string; label: string; second?: { value: string; suffix?: string; label: string } };
  codeReveal?: { lines: string[]; language?: string; output?: string };
  deviceFrame?: { screenshot: string; frame: "iphone" | "laptop" | "browser"; caption: string };
  /** Which aspect ratios to render. Empty defaults to ["9x16"]. */
  outputs?: OutputFormat[];
  /** Render quality preset. Defaults to "standard". */
  quality?: QualityPreset;
  /** Optional soundtrack — base64-encoded MP3/WAV. When present, the generated
   *  Reel.tsx adds a top-level <Audio> tag and the script + Rust pipeline
   *  decode the bytes into engine/public/photos/&lt;filename&gt;. */
  audioFilename?: string;
  audioBase64?: string;
};

/** Post-process any layout's Reel.tsx to inject an <Audio> tag if the user
 *  attached a soundtrack. Touches exactly two things:
 *    1. Adds Audio + staticFile to the `from "remotion"` import line.
 *    2. Inserts <Audio src={staticFile("photos/<file>")} volume={0.85} />
 *       inside the *Reel component's* outermost JSX wrapper. Anchored to
 *       `export const Reel` so it never grabs an internal helper's
 *       self-closing <AbsoluteFill />.
 *  This way every layout gets audio support without 8 duplicated edits. */
function withAudio(reelTsx: string, i: StudioInputs): string {
  if (!i.audioFilename) return reelTsx;
  // (1) Add Audio + staticFile (if absent) to the remotion import.
  const importRe = /(import \{)([^}]+)(\} from "remotion";)/;
  reelTsx = reelTsx.replace(importRe, (_m, open, names, close) => {
    const tokens = names.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (!tokens.includes("Audio")) tokens.push("Audio");
    if (!tokens.includes("staticFile")) tokens.push("staticFile");
    return `${open} ${tokens.join(", ")} ${close}`;
  });
  // (2) Find the FIRST non-self-closing JSX opening tag inside the Reel
  // component's body and inject after it. Imperative scan beats a fragile
  // regex with lookbehind that some browsers don't ship.
  const tag = `<Audio src={staticFile(${JSON.stringify(`photos/${i.audioFilename}`)})} volume={0.85} />`;
  const reelIdx = reelTsx.indexOf("export const Reel");
  if (reelIdx >= 0) {
    // Walk forward from after `export const Reel` looking for "<X...>" where
    // the closing `>` is not part of a `/>` self-close.
    let cursor = reelIdx;
    while (cursor < reelTsx.length) {
      const open = reelTsx.indexOf("<", cursor);
      if (open < 0) break;
      const next = reelTsx[open + 1];
      // JSX-element-opening starts with an uppercase letter or "<>" (fragment).
      if (next === ">") {
        // Plain fragment — inject right after.
        reelTsx = reelTsx.slice(0, open + 2) + `\n      ${tag}` + reelTsx.slice(open + 2);
        break;
      }
      if (next && /[A-Z]/.test(next)) {
        const close = reelTsx.indexOf(">", open);
        if (close < 0) break;
        const isSelfClosing = reelTsx[close - 1] === "/";
        if (!isSelfClosing) {
          reelTsx = reelTsx.slice(0, close + 1) + `\n      ${tag}` + reelTsx.slice(close + 1);
          break;
        }
        cursor = close + 1;
        continue;
      }
      cursor = open + 1;
    }
  }
  return reelTsx;
}

// The Reel.tsx body, parameterized by tokens.
function reelTsx(t: BrandTokens, steps: StudioInputs["steps"], i: StudioInputs): string {
  const bgStyle = ((): string => {
    switch (t.motif) {
      case "graph-paper":
        return `backgroundImage: \`
        linear-gradient(${"rgba(0,0,0,0.07)"} 1px, transparent 1px),
        linear-gradient(90deg, ${"rgba(0,0,0,0.07)"} 1px, transparent 1px),
        linear-gradient(${"rgba(0,0,0,0.04)"} 1px, transparent 1px),
        linear-gradient(90deg, ${"rgba(0,0,0,0.04)"} 1px, transparent 1px)
      \`,
      backgroundSize: "100px 100px, 100px 100px, 20px 20px, 20px 20px"`;
      case "blueprint":
        return `backgroundImage: \`linear-gradient(${"rgba(255,255,255,0.08)"} 1px, transparent 1px), linear-gradient(90deg, ${"rgba(255,255,255,0.08)"} 1px, transparent 1px)\`,
      backgroundSize: "80px 80px"`;
      case "gradient":
        return `backgroundImage: "radial-gradient(circle at 20% 0%, ${t.accentSoft}, transparent 50%), radial-gradient(circle at 80% 100%, ${t.accentSoft}, transparent 60%)"`;
      case "editorial":
        return `backgroundImage: "linear-gradient(180deg, transparent 0%, " + "${t.accentSoft}" + " 100%)"`;
      case "mono":
        return `backgroundImage: "repeating-linear-gradient(0deg, transparent 0 38px, " + "rgba(0,0,0,0.04)" + " 38px 39px)"`;
      case "dot-grid":
        return `backgroundImage: "radial-gradient(${"rgba(0,0,0,0.18)"} 1.5px, transparent 1.5px)",
      backgroundSize: "32px 32px"`;
      case "vintage-paper":
        return `backgroundImage: \`
        radial-gradient(circle at 18% 22%, rgba(120, 80, 40, 0.08) 1px, transparent 2px),
        radial-gradient(circle at 73% 67%, rgba(120, 80, 40, 0.07) 1px, transparent 2px),
        radial-gradient(circle at 90% 12%, rgba(120, 80, 40, 0.06) 1px, transparent 2px),
        linear-gradient(180deg, ${t.accentSoft}, transparent 70%)
      \`,
      backgroundSize: "120px 120px, 180px 180px, 240px 240px, 100% 100%"`;
      case "terminal-green":
        return `backgroundImage: \`
        linear-gradient(${"rgba(0, 255, 149, 0.04)"} 1px, transparent 1px),
        linear-gradient(90deg, ${"rgba(0, 255, 149, 0.04)"} 1px, transparent 1px)
      \`,
      backgroundSize: "24px 24px"`;
      case "scan-lines":
        return `backgroundImage: \`
        repeating-linear-gradient(0deg, transparent 0 3px, ${"rgba(0,0,0,0.18)"} 3px 4px),
        radial-gradient(circle at 50% 50%, transparent 0%, ${"rgba(0,0,0,0.45)"} 100%)
      \`,
      backgroundSize: "100% 4px, 100% 100%"`;
      default:
        return `backgroundImage: "none"`;
    }
  })();

  return `// Auto-generated by LaunchFoundry Reels Studio for ${i.projectName}.
// Visual identity inferred from this project's CSS.
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import React from "react";
import { scenes, totalDurationFrames, type Scene } from "./data";

export const fps = 30;
export const width = 1080;
export const height = 1920;
export const durationInFrames = totalDurationFrames;

const BG = "${t.background}";
const SURFACE = "${t.surface}";
const TEXT = "${t.text}";
const TEXT_SOFT = "${t.textSoft}";
const ACCENT = "${t.accent}";
const ACCENT_SOFT = "${t.accentSoft}";
const FONT_DISPLAY = ${JSON.stringify(t.fontDisplay)};
const FONT_BODY = ${JSON.stringify(t.fontBody)};

if (typeof document !== "undefined" && !document.getElementById("lf-fonts")) {
  const link = document.createElement("link");
  link.id = "lf-fonts";
  link.rel = "stylesheet";
  link.href = ${JSON.stringify(t.googleFontsHref)};
  document.head.appendChild(link);
}

const Motif: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: BG, ${bgStyle} }} />
);

const TitleScene: React.FC<{ scene: Extract<Scene, { kind: "title" }> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeIn = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
  const line1Rise = interpolate(frame, [0, 25], [40, 0], { extrapolateRight: "clamp" });
  const line2Rise = interpolate(frame, [10, 35], [40, 0], { extrapolateRight: "clamp" });
  const ruleGrow = spring({ frame: frame - 12, fps, config: { damping: 18, stiffness: 120 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ opacity: fadeIn, textAlign: "center" }}>
        <div style={{ fontFamily: FONT_BODY, fontSize: 32, fontWeight: 600, letterSpacing: "0.32em", color: ACCENT, marginBottom: 64 }}>{scene.eyebrow}</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 168, fontWeight: 900, color: TEXT, lineHeight: 0.95, letterSpacing: "-0.02em", transform: \`translateY(\${line1Rise}px)\`, opacity: interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" }) }}>{scene.line1}</div>
        {scene.line2 && (
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 168, fontWeight: 900, color: ACCENT, lineHeight: 0.95, letterSpacing: "-0.02em", transform: \`translateY(\${line2Rise}px)\`, opacity: interpolate(frame, [10, 30], [0, 1], { extrapolateRight: "clamp" }), marginTop: 8 }}>{scene.line2}</div>
        )}
        <div style={{ marginTop: 56, display: "flex", justifyContent: "center" }}>
          <div style={{ width: 200 * ruleGrow, height: 4, backgroundColor: ACCENT, borderRadius: 2 }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const StepScene: React.FC<{ scene: Extract<Scene, { kind: "step" }> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const numberPop = spring({ frame, fps, config: { damping: 12, stiffness: 130 } });
  const labelRise = interpolate(frame, [8, 30], [30, 0], { extrapolateRight: "clamp" });
  const labelFade = interpolate(frame, [8, 30], [0, 1], { extrapolateRight: "clamp" });
  const imageScale = interpolate(frame, [0, 75], [1.0, 1.06], { extrapolateRight: "clamp" });
  const imageFade = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ padding: 80 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 32, opacity: labelFade }}>
        <div style={{ fontFamily: FONT_BODY, fontSize: 24, fontWeight: 600, letterSpacing: "0.32em", color: TEXT_SOFT }}>${i.projectName.toUpperCase().replace(/['"\\\\]/g, '')}</div>
      </div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 340, fontWeight: 900, color: ACCENT, lineHeight: 1, letterSpacing: "-0.04em", transform: \`scale(\${numberPop})\`, transformOrigin: "left center", marginBottom: 12 }}>{scene.number}</div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 132, fontWeight: 900, color: TEXT, letterSpacing: "-0.02em", lineHeight: 1, transform: \`translateY(\${labelRise}px)\`, opacity: labelFade, marginBottom: 20 }}>{scene.label}</div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 44, fontWeight: 500, color: TEXT_SOFT, lineHeight: 1.25, maxWidth: 920, opacity: labelFade, marginBottom: 60 }}>{scene.sub}</div>
      <div style={{ marginTop: "auto", marginBottom: 40, backgroundColor: SURFACE, border: \`2px solid \${ACCENT_SOFT}\`, borderRadius: 24, padding: 60, display: "flex", alignItems: "center", justifyContent: "center", flex: 1, opacity: imageFade }}>
        <Img src={staticFile(\`photos/\${scene.assetSrc}\`)} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", transform: \`scale(\${imageScale})\`, transformOrigin: "center center" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: "auto" }}>
        <div style={{ width: 120, height: 2, backgroundColor: ACCENT, opacity: labelFade, borderRadius: 1 }} />
      </div>
    </AbsoluteFill>
  );
};

const EndCardScene: React.FC<{ scene: Extract<Scene, { kind: "endcard" }> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const taglineFade = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
  const ctaPulse = 1 + 0.02 * Math.sin((frame / fps) * 2 * Math.PI * 1.1);
  const ruleGrow = spring({ frame: frame - 5, fps, config: { damping: 16, stiffness: 110 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ textAlign: "center", opacity: taglineFade }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 116, fontWeight: 700, color: TEXT, lineHeight: 1.08, letterSpacing: "-0.015em", maxWidth: 900, margin: "0 auto" }}>{scene.tagline}</div>
        <div style={{ marginTop: 60, marginBottom: 60, display: "flex", justifyContent: "center" }}>
          <div style={{ width: 320 * ruleGrow, height: 3, backgroundColor: ACCENT, borderRadius: 1.5 }} />
        </div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 56, fontWeight: 700, color: ACCENT, letterSpacing: "-0.01em", transform: \`scale(\${ctaPulse})\` }}>{scene.cta}</div>
        <div style={{ marginTop: 40, fontFamily: FONT_BODY, fontSize: 38, fontWeight: 500, color: TEXT_SOFT, letterSpacing: "0.04em" }}>{scene.url}</div>
      </div>
    </AbsoluteFill>
  );
};

// 12-frame fade between scenes; slide-up just before the end card.
const TRANSITION_FRAMES = 12;
const renderScene = (scene: Scene) => {
  if (scene.kind === "title") return <TitleScene scene={scene} />;
  if (scene.kind === "step") return <StepScene scene={scene} />;
  return <EndCardScene scene={scene} />;
};

export const Reel: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BG, color: TEXT, fontFamily: FONT_BODY }}>
      <Motif />
      <TransitionSeries>
        {scenes.flatMap((scene, idx) => {
          const isLast = idx === scenes.length - 1;
          const sceneEl = (
            <TransitionSeries.Sequence key={"scene-" + idx} durationInFrames={scene.durationFrames}>
              {renderScene(scene)}
            </TransitionSeries.Sequence>
          );
          if (isLast) return [sceneEl];
          const nextIsEndcard = scenes[idx + 1]?.kind === "endcard";
          return [
            sceneEl,
            <TransitionSeries.Transition
              key={"xfade-" + idx}
              presentation={nextIsEndcard ? slide({ direction: "from-bottom" }) : fade()}
              timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
            />,
          ];
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
`;
}

function dataTs(steps: StudioInputs["steps"], i: StudioInputs): string {
  const stepLines = steps
    .slice(0, 4)
    .map((s, idx) => `  { kind: "step", number: ${idx + 1}, label: ${JSON.stringify(s.label)}, sub: ${JSON.stringify(s.sub)}, assetSrc: ${JSON.stringify(s.assetFile)}, durationFrames: 90 }`)
    .join(",\n");

  return `export type Scene =
  | { kind: "title"; eyebrow: string; line1: string; line2?: string; durationFrames: number }
  | { kind: "step"; number: number; label: string; sub: string; assetSrc: string; durationFrames: number }
  | { kind: "endcard"; tagline: string; cta: string; url: string; durationFrames: number };

export const scenes: Scene[] = [
  { kind: "title", eyebrow: ${JSON.stringify(i.projectName.toUpperCase())}, line1: ${JSON.stringify(i.tagline.split(" ").slice(0, 2).join(" "))}, line2: ${JSON.stringify(i.tagline.split(" ").slice(2).join(" "))}, durationFrames: 60 },
${stepLines},
  { kind: "endcard", tagline: ${JSON.stringify(i.oneLiner)}, cta: ${JSON.stringify(i.cta)}, url: ${JSON.stringify(i.url)}, durationFrames: 75 },
];

export const totalDurationFrames = scenes.reduce((acc, s) => acc + s.durationFrames, 0);
`;
}

/** Build a Root.tsx that registers one <Composition> per picked output format.
 *  Each composition shares the same <Reel> component but renders at a different
 *  width/height, so a single script run can emit multiple aspect ratios. */
function buildRootTsx(outputs: OutputFormat[]): string {
  const picks = outputs.length ? outputs : (["9x16"] as OutputFormat[]);
  const compLines = picks.map(id => {
    const fmt = OUTPUT_FORMATS.find(f => f.id === id)!;
    return `    <Composition id=${JSON.stringify(`Reel-${id}`)} component={Reel} fps={fps} width={${fmt.width}} height={${fmt.height}} durationInFrames={durationInFrames} />`;
  }).join("\n");
  return `import { Composition } from "remotion";
import { Reel, fps, durationInFrames } from "./Reel";
export const RemotionRoot: React.FC = () => (
  <>
${compLines}
  </>
);
`;
}

// ════════════════════════════════════════════════════════════════════
// Layout: kinetic-text
// ════════════════════════════════════════════════════════════════════

function dataKineticText(i: StudioInputs): string {
  const phrases = (i.kineticPhrases && i.kineticPhrases.length > 0)
    ? i.kineticPhrases
    : [
        i.tagline || "Pay attention.",
        i.oneLiner || "This is the thing.",
        "Look closer.",
        "Stop guessing.",
        i.cta || "Start here.",
      ];
  const phraseLines = phrases.slice(0, 8).map(p => `  { kind: "phrase", text: ${JSON.stringify(p)}, durationFrames: 54 }`).join(",\n");
  return `export type Scene =
  | { kind: "title"; eyebrow: string; line1: string; durationFrames: number }
  | { kind: "phrase"; text: string; durationFrames: number }
  | { kind: "endcard"; tagline: string; cta: string; url: string; durationFrames: number };

export const scenes: Scene[] = [
  { kind: "title", eyebrow: ${JSON.stringify(i.projectName.toUpperCase())}, line1: ${JSON.stringify(i.tagline)}, durationFrames: 60 },
${phraseLines},
  { kind: "endcard", tagline: ${JSON.stringify(i.oneLiner)}, cta: ${JSON.stringify(i.cta)}, url: ${JSON.stringify(i.url)}, durationFrames: 75 },
];

export const totalDurationFrames = scenes.reduce((acc, s) => acc + s.durationFrames, 0);
`;
}

function reelKineticText(t: BrandTokens, i: StudioInputs): string {
  return `// Kinetic typography reel for ${i.projectName}. No images — pure text animation.
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import React from "react";
import { scenes, totalDurationFrames, type Scene } from "./data";

export const fps = 30;
export const width = 1080;
export const height = 1920;
export const durationInFrames = totalDurationFrames;

const BG = "${t.background}";
const TEXT = "${t.text}";
const ACCENT = "${t.accent}";
const ACCENT_SOFT = "${t.accentSoft}";
const FONT_DISPLAY = ${JSON.stringify(t.fontDisplay)};
const FONT_BODY = ${JSON.stringify(t.fontBody)};

if (typeof document !== "undefined" && !document.getElementById("lf-fonts")) {
  const link = document.createElement("link");
  link.id = "lf-fonts"; link.rel = "stylesheet"; link.href = ${JSON.stringify(t.googleFontsHref)};
  document.head.appendChild(link);
}

const TitleScene: React.FC<{ scene: Extract<Scene, { kind: "title" }> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeIn = spring({ frame, fps, config: { damping: 16, stiffness: 100 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ opacity: fadeIn, textAlign: "center" }}>
        <div style={{ fontFamily: FONT_BODY, fontSize: 28, fontWeight: 600, letterSpacing: "0.36em", color: ACCENT, marginBottom: 48 }}>{scene.eyebrow}</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 144, fontWeight: 900, color: TEXT, lineHeight: 0.95, letterSpacing: "-0.02em" }}>{scene.line1}</div>
      </div>
    </AbsoluteFill>
  );
};

const PhraseScene: React.FC<{ scene: Extract<Scene, { kind: "phrase" }> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = scene.text.split(/\\s+/).filter(Boolean);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ textAlign: "center", lineHeight: 1.05 }}>
        {words.map((w, i) => {
          const start = i * 4;
          const yIn = interpolate(frame, [start, start + 14], [50, 0], { extrapolateRight: "clamp" });
          const opIn = interpolate(frame, [start, start + 12], [0, 1], { extrapolateRight: "clamp" });
          const color = i === words.length - 1 ? ACCENT : TEXT;
          return (
            <span key={i} style={{ display: "inline-block", margin: "0 12px", fontFamily: FONT_DISPLAY, fontSize: 132, fontWeight: 900, color, letterSpacing: "-0.02em", transform: \`translateY(\${yIn}px)\`, opacity: opIn }}>
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const EndCardScene: React.FC<{ scene: Extract<Scene, { kind: "endcard" }> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
  const pulse = 1 + 0.02 * Math.sin((frame / fps) * 2 * Math.PI * 1.1);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ textAlign: "center", opacity: fade }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 104, fontWeight: 700, color: TEXT, lineHeight: 1.1, maxWidth: 900, margin: "0 auto" }}>{scene.tagline}</div>
        <div style={{ marginTop: 56, marginBottom: 56, display: "flex", justifyContent: "center" }}><div style={{ width: 280, height: 3, backgroundColor: ACCENT, borderRadius: 1.5 }} /></div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 56, fontWeight: 700, color: ACCENT, transform: \`scale(\${pulse})\` }}>{scene.cta}</div>
        <div style={{ marginTop: 32, fontFamily: FONT_BODY, fontSize: 36, fontWeight: 500, color: TEXT, opacity: 0.6, letterSpacing: "0.04em" }}>{scene.url}</div>
      </div>
    </AbsoluteFill>
  );
};

export const Reel: React.FC = () => {
  let offset = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: BG, color: TEXT, fontFamily: FONT_BODY }}>
      {scenes.map((scene, idx) => {
        const from = offset; offset += scene.durationFrames;
        return (
          <Sequence key={idx} from={from} durationInFrames={scene.durationFrames}>
            {scene.kind === "title" && <TitleScene scene={scene} />}
            {scene.kind === "phrase" && <PhraseScene scene={scene} />}
            {scene.kind === "endcard" && <EndCardScene scene={scene} />}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
`;
}

// ════════════════════════════════════════════════════════════════════
// Layout: parallax-hero — single image, layered zoom + caption crawl
// ════════════════════════════════════════════════════════════════════

function dataParallaxHero(i: StudioInputs): string {
  const hero = i.heroAssetFile || i.steps[0]?.assetFile || "hero.png";
  return `export type Scene =
  | { kind: "phase"; heroSrc: string; eyebrow: string; headline: string; durationFrames: number };

export const heroSrc = ${JSON.stringify(hero)};

export const scenes: Scene[] = [
  { kind: "phase", heroSrc, eyebrow: ${JSON.stringify(i.projectName.toUpperCase())}, headline: ${JSON.stringify(i.tagline)}, durationFrames: 120 },
  { kind: "phase", heroSrc, eyebrow: ${JSON.stringify(i.steps[0]?.label ?? "")}, headline: ${JSON.stringify(i.oneLiner)}, durationFrames: 150 },
  { kind: "phase", heroSrc, eyebrow: "GO", headline: ${JSON.stringify(i.cta)}, durationFrames: 120 },
];

export const totalDurationFrames = scenes.reduce((acc, s) => acc + s.durationFrames, 0);
`;
}

function reelParallaxHero(t: BrandTokens, i: StudioInputs): string {
  return `// Parallax hero reel for ${i.projectName}. One image, layered zoom + caption crawl.
import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame, interpolate, useVideoConfig } from "remotion";
import React from "react";
import { scenes, totalDurationFrames, heroSrc, type Scene } from "./data";

export const fps = 30;
export const width = 1080;
export const height = 1920;
export const durationInFrames = totalDurationFrames;

const BG = "${t.background}";
const TEXT = "${t.text}";
const ACCENT = "${t.accent}";
const FONT_DISPLAY = ${JSON.stringify(t.fontDisplay)};
const FONT_BODY = ${JSON.stringify(t.fontBody)};

if (typeof document !== "undefined" && !document.getElementById("lf-fonts")) {
  const link = document.createElement("link");
  link.id = "lf-fonts"; link.rel = "stylesheet"; link.href = ${JSON.stringify(t.googleFontsHref)};
  document.head.appendChild(link);
}

const PhaseScene: React.FC<{ scene: Extract<Scene, { kind: "phase" }>; index: number; totalScenes: number }> = ({ scene, index, totalScenes }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  // Hero scale drifts up across the whole composition for parallax feel
  const totalProgress = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: "clamp" });
  const baseScale = 1.05 + 0.35 * (index / Math.max(1, totalScenes - 1));
  const innerScale = baseScale + 0.06 * totalProgress;
  // Caption crawl up from below
  const captionY = interpolate(frame, [0, 30], [80, 0], { extrapolateRight: "clamp" });
  const captionOp = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <Img src={staticFile(\`photos/\${scene.heroSrc}\`)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: \`scale(\${innerScale})\` }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: \`linear-gradient(180deg, transparent 30%, \${BG} 100%)\` }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", padding: 80, paddingBottom: 160 }}>
        <div style={{ textAlign: "center", transform: \`translateY(\${captionY}px)\`, opacity: captionOp }}>
          <div style={{ fontFamily: FONT_BODY, fontSize: 26, fontWeight: 600, letterSpacing: "0.4em", color: ACCENT, marginBottom: 28 }}>{scene.eyebrow}</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 112, fontWeight: 800, color: TEXT, lineHeight: 1.05, letterSpacing: "-0.015em", maxWidth: 920 }}>{scene.headline}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Reel: React.FC = () => {
  let offset = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: BG, color: TEXT, fontFamily: FONT_BODY }}>
      {scenes.map((scene, idx) => {
        const from = offset; offset += scene.durationFrames;
        return (
          <Sequence key={idx} from={from} durationInFrames={scene.durationFrames}>
            <PhaseScene scene={scene} index={idx} totalScenes={scenes.length} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
`;
}

// ════════════════════════════════════════════════════════════════════
// Layout: quote-card — big italic quote + attribution
// ════════════════════════════════════════════════════════════════════

function dataQuoteCard(i: StudioInputs): string {
  const q = i.quote ?? { text: i.tagline, author: i.projectName };
  return `export type Scene =
  | { kind: "title"; eyebrow: string; durationFrames: number }
  | { kind: "quote"; text: string; durationFrames: number }
  | { kind: "attribution"; author: string; role: string; cta: string; url: string; durationFrames: number };

export const scenes: Scene[] = [
  { kind: "title", eyebrow: ${JSON.stringify(i.projectName.toUpperCase())}, durationFrames: 50 },
  { kind: "quote", text: ${JSON.stringify(q.text)}, durationFrames: 220 },
  { kind: "attribution", author: ${JSON.stringify(q.author)}, role: ${JSON.stringify(q.role ?? "")}, cta: ${JSON.stringify(i.cta)}, url: ${JSON.stringify(i.url)}, durationFrames: 110 },
];

export const totalDurationFrames = scenes.reduce((acc, s) => acc + s.durationFrames, 0);
`;
}

function reelQuoteCard(t: BrandTokens, i: StudioInputs): string {
  return `// Quote-card reel for ${i.projectName}. Single big quote + attribution.
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import React from "react";
import { scenes, totalDurationFrames, type Scene } from "./data";

export const fps = 30;
export const width = 1080;
export const height = 1920;
export const durationInFrames = totalDurationFrames;

const BG = "${t.background}";
const TEXT = "${t.text}";
const TEXT_SOFT = "${t.textSoft}";
const ACCENT = "${t.accent}";
const FONT_DISPLAY = ${JSON.stringify(t.fontDisplay)};
const FONT_BODY = ${JSON.stringify(t.fontBody)};

if (typeof document !== "undefined" && !document.getElementById("lf-fonts")) {
  const link = document.createElement("link");
  link.id = "lf-fonts"; link.rel = "stylesheet"; link.href = ${JSON.stringify(t.googleFontsHref)};
  document.head.appendChild(link);
}

const TitleScene: React.FC<{ scene: Extract<Scene, { kind: "title" }> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const op = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: FONT_BODY, fontSize: 32, fontWeight: 600, letterSpacing: "0.4em", color: ACCENT, opacity: op }}>{scene.eyebrow}</div>
    </AbsoluteFill>
  );
};

const QuoteScene: React.FC<{ scene: Extract<Scene, { kind: "quote" }> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const op = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const yIn = interpolate(frame, [0, 30], [40, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ textAlign: "center", opacity: op, transform: \`translateY(\${yIn}px)\` }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 320, fontWeight: 900, color: ACCENT, lineHeight: 0.6, marginBottom: 24 }}>"</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 96, fontStyle: "italic", fontWeight: 600, color: TEXT, lineHeight: 1.18, letterSpacing: "-0.005em", maxWidth: 900 }}>{scene.text}</div>
      </div>
    </AbsoluteFill>
  );
};

const AttributionScene: React.FC<{ scene: Extract<Scene, { kind: "attribution" }> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const op = spring({ frame, fps, config: { damping: 16, stiffness: 110 } });
  const ruleGrow = spring({ frame: frame - 5, fps, config: { damping: 18, stiffness: 120 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ textAlign: "center", opacity: op }}>
        <div style={{ marginBottom: 36, display: "flex", justifyContent: "center" }}><div style={{ width: 200 * ruleGrow, height: 3, backgroundColor: ACCENT, borderRadius: 1.5 }} /></div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 72, fontWeight: 700, color: TEXT, letterSpacing: "-0.01em" }}>{scene.author}</div>
        {scene.role && <div style={{ marginTop: 14, fontFamily: FONT_BODY, fontSize: 38, color: TEXT_SOFT, letterSpacing: "0.02em" }}>{scene.role}</div>}
        <div style={{ marginTop: 56, fontFamily: FONT_BODY, fontSize: 48, fontWeight: 700, color: ACCENT }}>{scene.cta}</div>
        <div style={{ marginTop: 28, fontFamily: FONT_BODY, fontSize: 32, color: TEXT_SOFT, letterSpacing: "0.04em" }}>{scene.url}</div>
      </div>
    </AbsoluteFill>
  );
};

export const Reel: React.FC = () => {
  let offset = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: BG, color: TEXT, fontFamily: FONT_BODY }}>
      {scenes.map((scene, idx) => {
        const from = offset; offset += scene.durationFrames;
        return (
          <Sequence key={idx} from={from} durationInFrames={scene.durationFrames}>
            {scene.kind === "title" && <TitleScene scene={scene} />}
            {scene.kind === "quote" && <QuoteScene scene={scene} />}
            {scene.kind === "attribution" && <AttributionScene scene={scene} />}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
`;
}

const INDEX_TS = `import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";
registerRoot(RemotionRoot);
`;

// ════════════════════════════════════════════════════════════════════
// Layout: before-after — two images split by a diagonal brass wipe
// ════════════════════════════════════════════════════════════════════
function dataBeforeAfter(i: StudioInputs): string {
  const ba = i.beforeAfter ?? { before: i.steps[0]?.assetFile ?? "before.png", after: i.steps[1]?.assetFile ?? "after.png" };
  return `export type Scene =
  | { kind: "title"; eyebrow: string; line: string; durationFrames: number }
  | { kind: "ba"; beforeSrc: string; afterSrc: string; beforeLabel: string; afterLabel: string; durationFrames: number }
  | { kind: "endcard"; tagline: string; cta: string; url: string; durationFrames: number };

export const scenes: Scene[] = [
  { kind: "title", eyebrow: ${JSON.stringify(i.projectName.toUpperCase())}, line: ${JSON.stringify(i.tagline)}, durationFrames: 60 },
  { kind: "ba", beforeSrc: ${JSON.stringify(ba.before)}, afterSrc: ${JSON.stringify(ba.after)}, beforeLabel: ${JSON.stringify(ba.beforeLabel ?? "Before")}, afterLabel: ${JSON.stringify(ba.afterLabel ?? "After")}, durationFrames: 300 },
  { kind: "endcard", tagline: ${JSON.stringify(i.oneLiner)}, cta: ${JSON.stringify(i.cta)}, url: ${JSON.stringify(i.url)}, durationFrames: 75 },
];
export const totalDurationFrames = scenes.reduce((acc, s) => acc + s.durationFrames, 0);
`;
}
function reelBeforeAfter(t: BrandTokens, i: StudioInputs): string {
  return `// Before/after reel for ${i.projectName}. Diagonal brass wipe between two images.
import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import React from "react";
import { scenes, totalDurationFrames, type Scene } from "./data";
export const fps = 30;
export const width = 1080;
export const height = 1920;
export const durationInFrames = totalDurationFrames;
const BG = "${t.background}"; const TEXT = "${t.text}"; const TEXT_SOFT = "${t.textSoft}"; const ACCENT = "${t.accent}";
const FONT_DISPLAY = ${JSON.stringify(t.fontDisplay)}; const FONT_BODY = ${JSON.stringify(t.fontBody)};
if (typeof document !== "undefined" && !document.getElementById("lf-fonts")) {
  const l = document.createElement("link"); l.id = "lf-fonts"; l.rel = "stylesheet"; l.href = ${JSON.stringify(t.googleFontsHref)}; document.head.appendChild(l);
}
const TitleScene: React.FC<{ scene: Extract<Scene,{kind:"title"}> }> = ({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const op = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", opacity: op }}>
        <div style={{ fontFamily: FONT_BODY, fontSize: 28, fontWeight: 600, letterSpacing: "0.36em", color: ACCENT, marginBottom: 32 }}>{scene.eyebrow}</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 140, fontWeight: 900, color: TEXT, lineHeight: 1, letterSpacing: "-0.02em" }}>{scene.line}</div>
      </div>
    </AbsoluteFill>
  );
};
const BAScene: React.FC<{ scene: Extract<Scene,{kind:"ba"}> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  // Wipe progress 0 -> 1 across the scene
  const wipe = interpolate(frame, [30, scene.durationFrames - 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Wedge path goes from left edge to right, diagonal slash
  return (
    <AbsoluteFill>
      <AbsoluteFill><Img src={staticFile("photos/" + scene.beforeSrc)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /></AbsoluteFill>
      <AbsoluteFill style={{ clipPath: \`polygon(0 0, \${wipe * 100}% 0, \${(wipe + 0.06) * 100}% 100%, 0 100%)\` }}>
        <Img src={staticFile("photos/" + scene.afterSrc)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      {/* Brass diagonal stripe at the wipe boundary */}
      <AbsoluteFill style={{ clipPath: \`polygon(\${wipe * 100}% 0, \${(wipe + 0.06) * 100}% 0, \${wipe * 100 + 6} 100%, \${(wipe - 0.005) * 100}% 100%)\`, background: ACCENT, opacity: 0.95 }} />
      {/* Labels */}
      <AbsoluteFill style={{ padding: 60, justifyContent: "space-between", flexDirection: "column" }}>
        <div style={{ fontFamily: FONT_BODY, fontSize: 28, fontWeight: 700, color: "#fff", letterSpacing: "0.32em", textShadow: "0 2px 16px rgba(0,0,0,0.6)" }}>{scene.beforeLabel}</div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 28, fontWeight: 700, color: "#fff", letterSpacing: "0.32em", alignSelf: "flex-end", textShadow: "0 2px 16px rgba(0,0,0,0.6)" }}>{scene.afterLabel}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
const EndCardScene: React.FC<{ scene: Extract<Scene,{kind:"endcard"}> }> = ({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const op = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
  return (
    <AbsoluteFill style={{ backgroundColor: BG, alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ textAlign: "center", opacity: op }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 100, fontWeight: 700, color: TEXT, lineHeight: 1.1 }}>{scene.tagline}</div>
        <div style={{ marginTop: 40, marginBottom: 40, display: "flex", justifyContent: "center" }}><div style={{ width: 240, height: 3, backgroundColor: ACCENT }} /></div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 52, fontWeight: 700, color: ACCENT }}>{scene.cta}</div>
        <div style={{ marginTop: 28, fontFamily: FONT_BODY, fontSize: 32, color: TEXT_SOFT, letterSpacing: "0.04em" }}>{scene.url}</div>
      </div>
    </AbsoluteFill>
  );
};
export const Reel: React.FC = () => {
  let offset = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: BG, color: TEXT, fontFamily: FONT_BODY }}>
      {scenes.map((scene, idx) => {
        const from = offset; offset += scene.durationFrames;
        return (
          <Sequence key={idx} from={from} durationInFrames={scene.durationFrames}>
            {scene.kind === "title" && <TitleScene scene={scene} />}
            {scene.kind === "ba" && <BAScene scene={scene} />}
            {scene.kind === "endcard" && <EndCardScene scene={scene} />}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
`;
}

// ════════════════════════════════════════════════════════════════════
// Layout: big-number — one (or two) enormous figures with context
// ════════════════════════════════════════════════════════════════════
function dataBigNumber(i: StudioInputs): string {
  const bn = i.bigNumber ?? { value: "30", suffix: "+ yrs", label: "in business" };
  const second = bn.second ? `, { kind: "stat", value: ${JSON.stringify(bn.second.value)}, suffix: ${JSON.stringify(bn.second.suffix ?? "")}, label: ${JSON.stringify(bn.second.label)}, durationFrames: 120 }` : "";
  return `export type Scene =
  | { kind: "title"; eyebrow: string; line: string; durationFrames: number }
  | { kind: "stat"; value: string; suffix: string; label: string; durationFrames: number }
  | { kind: "endcard"; tagline: string; cta: string; url: string; durationFrames: number };
export const scenes: Scene[] = [
  { kind: "title", eyebrow: ${JSON.stringify(i.projectName.toUpperCase())}, line: ${JSON.stringify(i.tagline)}, durationFrames: 60 },
  { kind: "stat", value: ${JSON.stringify(bn.value)}, suffix: ${JSON.stringify(bn.suffix ?? "")}, label: ${JSON.stringify(bn.label)}, durationFrames: 160 }${second},
  { kind: "endcard", tagline: ${JSON.stringify(i.oneLiner)}, cta: ${JSON.stringify(i.cta)}, url: ${JSON.stringify(i.url)}, durationFrames: 75 },
];
export const totalDurationFrames = scenes.reduce((acc, s) => acc + s.durationFrames, 0);
`;
}
function reelBigNumber(t: BrandTokens, i: StudioInputs): string {
  return `// Big-number stat reel for ${i.projectName}.
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import React from "react";
import { scenes, totalDurationFrames, type Scene } from "./data";
export const fps = 30; export const width = 1080; export const height = 1920;
export const durationInFrames = totalDurationFrames;
const BG = "${t.background}"; const TEXT = "${t.text}"; const TEXT_SOFT = "${t.textSoft}"; const ACCENT = "${t.accent}";
const FONT_DISPLAY = ${JSON.stringify(t.fontDisplay)}; const FONT_BODY = ${JSON.stringify(t.fontBody)};
if (typeof document !== "undefined" && !document.getElementById("lf-fonts")) {
  const l = document.createElement("link"); l.id = "lf-fonts"; l.rel = "stylesheet"; l.href = ${JSON.stringify(t.googleFontsHref)}; document.head.appendChild(l);
}
const TitleScene: React.FC<{ scene: Extract<Scene,{kind:"title"}> }> = ({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const op = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ textAlign: "center", opacity: op }}>
        <div style={{ fontFamily: FONT_BODY, fontSize: 28, fontWeight: 600, letterSpacing: "0.36em", color: ACCENT, marginBottom: 32 }}>{scene.eyebrow}</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 132, fontWeight: 900, color: TEXT, lineHeight: 1 }}>{scene.line}</div>
      </div>
    </AbsoluteFill>
  );
};
const StatScene: React.FC<{ scene: Extract<Scene,{kind:"stat"}> }> = ({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  // Count-up animation if value is a pure integer
  const target = parseFloat(scene.value.replace(/[^0-9.]/g, ""));
  const isNumeric = !Number.isNaN(target) && scene.value.match(/^[0-9.]+$/);
  const progress = spring({ frame, fps, config: { damping: 28, stiffness: 70 } });
  const display = isNumeric ? Math.round(target * progress).toString() : scene.value;
  const labelOp = interpolate(frame, [30, 55], [0, 1], { extrapolateRight: "clamp" });
  const labelY = interpolate(frame, [30, 55], [24, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 60 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 560, fontWeight: 900, color: ACCENT, lineHeight: 1, letterSpacing: "-0.06em" }}>{display}</div>
        {scene.suffix && <div style={{ fontFamily: FONT_DISPLAY, fontSize: 144, fontWeight: 700, color: TEXT, marginTop: -8 }}>{scene.suffix}</div>}
        <div style={{ marginTop: 36, fontFamily: FONT_BODY, fontSize: 56, fontWeight: 500, color: TEXT_SOFT, opacity: labelOp, transform: \`translateY(\${labelY}px)\` }}>{scene.label}</div>
      </div>
    </AbsoluteFill>
  );
};
const EndCardScene: React.FC<{ scene: Extract<Scene,{kind:"endcard"}> }> = ({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const op = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ textAlign: "center", opacity: op }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 100, fontWeight: 700, color: TEXT, lineHeight: 1.1 }}>{scene.tagline}</div>
        <div style={{ marginTop: 40, marginBottom: 40, display: "flex", justifyContent: "center" }}><div style={{ width: 240, height: 3, backgroundColor: ACCENT }} /></div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 52, fontWeight: 700, color: ACCENT }}>{scene.cta}</div>
        <div style={{ marginTop: 28, fontFamily: FONT_BODY, fontSize: 32, color: TEXT_SOFT, letterSpacing: "0.04em" }}>{scene.url}</div>
      </div>
    </AbsoluteFill>
  );
};
export const Reel: React.FC = () => {
  let offset = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: BG, color: TEXT, fontFamily: FONT_BODY }}>
      {scenes.map((scene, idx) => {
        const from = offset; offset += scene.durationFrames;
        return (
          <Sequence key={idx} from={from} durationInFrames={scene.durationFrames}>
            {scene.kind === "title" && <TitleScene scene={scene} />}
            {scene.kind === "stat" && <StatScene scene={scene} />}
            {scene.kind === "endcard" && <EndCardScene scene={scene} />}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
`;
}

// ════════════════════════════════════════════════════════════════════
// Layout: code-reveal — typewriter terminal lines + output
// ════════════════════════════════════════════════════════════════════
function dataCodeReveal(i: StudioInputs): string {
  const cr = i.codeReveal ?? { lines: ["$ npm install your-tool", "$ your-tool init"], language: "shell", output: "✓ Ready." };
  return `export type Scene =
  | { kind: "title"; eyebrow: string; line: string; durationFrames: number }
  | { kind: "code"; lines: string[]; language: string; output: string; durationFrames: number }
  | { kind: "endcard"; tagline: string; cta: string; url: string; durationFrames: number };
export const scenes: Scene[] = [
  { kind: "title", eyebrow: ${JSON.stringify(i.projectName.toUpperCase())}, line: ${JSON.stringify(i.tagline)}, durationFrames: 60 },
  { kind: "code", lines: ${JSON.stringify(cr.lines)}, language: ${JSON.stringify(cr.language ?? "shell")}, output: ${JSON.stringify(cr.output ?? "")}, durationFrames: 360 },
  { kind: "endcard", tagline: ${JSON.stringify(i.oneLiner)}, cta: ${JSON.stringify(i.cta)}, url: ${JSON.stringify(i.url)}, durationFrames: 75 },
];
export const totalDurationFrames = scenes.reduce((acc, s) => acc + s.durationFrames, 0);
`;
}
function reelCodeReveal(t: BrandTokens, i: StudioInputs): string {
  return `// Code-reveal reel for ${i.projectName}. Typewriter terminal aesthetic.
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import React from "react";
import { scenes, totalDurationFrames, type Scene } from "./data";
export const fps = 30; export const width = 1080; export const height = 1920;
export const durationInFrames = totalDurationFrames;
const BG = "${t.background}"; const TEXT = "${t.text}"; const ACCENT = "${t.accent}";
const FONT_DISPLAY = ${JSON.stringify(t.fontDisplay)}; const FONT_BODY = ${JSON.stringify(t.fontBody)};
const FONT_MONO = "'JetBrains Mono', 'Roboto Mono', Consolas, monospace";
if (typeof document !== "undefined" && !document.getElementById("lf-fonts")) {
  const l = document.createElement("link"); l.id = "lf-fonts"; l.rel = "stylesheet"; l.href = ${JSON.stringify(t.googleFontsHref)}; document.head.appendChild(l);
}
const TitleScene: React.FC<{ scene: Extract<Scene,{kind:"title"}> }> = ({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const op = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ textAlign: "center", opacity: op }}>
        <div style={{ fontFamily: FONT_BODY, fontSize: 28, fontWeight: 600, letterSpacing: "0.36em", color: ACCENT, marginBottom: 32 }}>{scene.eyebrow}</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 132, fontWeight: 900, color: TEXT, lineHeight: 1 }}>{scene.line}</div>
      </div>
    </AbsoluteFill>
  );
};
const CodeScene: React.FC<{ scene: Extract<Scene,{kind:"code"}> }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const totalLines = scene.lines.length + (scene.output ? 1 : 0);
  const framesPerSegment = Math.floor((scene.durationFrames - 30) / totalLines);
  const cursorOn = Math.floor(frame / 10) % 2 === 0;
  return (
    <AbsoluteFill style={{ padding: 60, justifyContent: "center" }}>
      <div style={{ backgroundColor: "rgba(0,0,0,0.4)", border: \`1px solid \${ACCENT}\`, borderRadius: 12, padding: 36, fontFamily: FONT_MONO, fontSize: 40, lineHeight: 1.4 }}>
        {scene.lines.map((line, i) => {
          const start = 30 + i * framesPerSegment;
          const charsShown = interpolate(frame, [start, start + framesPerSegment - 6], [0, line.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const visible = line.slice(0, Math.floor(charsShown));
          const showCursor = frame >= start && frame < start + framesPerSegment && cursorOn;
          return (
            <div key={i} style={{ color: TEXT }}>
              <span style={{ color: ACCENT }}>{line.startsWith("$") ? "" : "> "}</span>{visible}{showCursor && <span style={{ color: ACCENT }}>▍</span>}
            </div>
          );
        })}
        {scene.output && (() => {
          const start = 30 + scene.lines.length * framesPerSegment;
          const op = interpolate(frame, [start, start + 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return <div style={{ marginTop: 24, color: ACCENT, opacity: op, fontWeight: 600 }}>{scene.output}</div>;
        })()}
      </div>
    </AbsoluteFill>
  );
};
const EndCardScene: React.FC<{ scene: Extract<Scene,{kind:"endcard"}> }> = ({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const op = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ textAlign: "center", opacity: op }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 100, fontWeight: 700, color: TEXT, lineHeight: 1.1 }}>{scene.tagline}</div>
        <div style={{ marginTop: 40, marginBottom: 40, display: "flex", justifyContent: "center" }}><div style={{ width: 240, height: 3, backgroundColor: ACCENT }} /></div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 52, fontWeight: 700, color: ACCENT }}>{scene.cta}</div>
        <div style={{ marginTop: 28, fontFamily: FONT_MONO, fontSize: 32, color: TEXT, opacity: 0.6 }}>{scene.url}</div>
      </div>
    </AbsoluteFill>
  );
};
export const Reel: React.FC = () => {
  let offset = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: BG, color: TEXT, fontFamily: FONT_BODY }}>
      {scenes.map((scene, idx) => {
        const from = offset; offset += scene.durationFrames;
        return (
          <Sequence key={idx} from={from} durationInFrames={scene.durationFrames}>
            {scene.kind === "title" && <TitleScene scene={scene} />}
            {scene.kind === "code" && <CodeScene scene={scene} />}
            {scene.kind === "endcard" && <EndCardScene scene={scene} />}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
`;
}

// ════════════════════════════════════════════════════════════════════
// Layout: device-frame — screenshot inside iPhone/laptop/browser chrome
// ════════════════════════════════════════════════════════════════════
function dataDeviceFrame(i: StudioInputs): string {
  const df = i.deviceFrame ?? { screenshot: i.steps[0]?.assetFile ?? "screenshot.png", frame: "iphone", caption: i.tagline };
  return `export type Scene =
  | { kind: "title"; eyebrow: string; line: string; durationFrames: number }
  | { kind: "device"; screenshot: string; frame: "iphone" | "laptop" | "browser"; caption: string; durationFrames: number }
  | { kind: "endcard"; tagline: string; cta: string; url: string; durationFrames: number };
export const scenes: Scene[] = [
  { kind: "title", eyebrow: ${JSON.stringify(i.projectName.toUpperCase())}, line: ${JSON.stringify(i.tagline)}, durationFrames: 60 },
  { kind: "device", screenshot: ${JSON.stringify(df.screenshot)}, frame: ${JSON.stringify(df.frame)}, caption: ${JSON.stringify(df.caption)}, durationFrames: 240 },
  { kind: "endcard", tagline: ${JSON.stringify(i.oneLiner)}, cta: ${JSON.stringify(i.cta)}, url: ${JSON.stringify(i.url)}, durationFrames: 75 },
];
export const totalDurationFrames = scenes.reduce((acc, s) => acc + s.durationFrames, 0);
`;
}
function reelDeviceFrame(t: BrandTokens, i: StudioInputs): string {
  return `// Device-frame reel for ${i.projectName}. Screenshot inside iPhone/laptop/browser chrome.
import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import React from "react";
import { scenes, totalDurationFrames, type Scene } from "./data";
export const fps = 30; export const width = 1080; export const height = 1920;
export const durationInFrames = totalDurationFrames;
const BG = "${t.background}"; const TEXT = "${t.text}"; const TEXT_SOFT = "${t.textSoft}"; const ACCENT = "${t.accent}";
const FONT_DISPLAY = ${JSON.stringify(t.fontDisplay)}; const FONT_BODY = ${JSON.stringify(t.fontBody)};
if (typeof document !== "undefined" && !document.getElementById("lf-fonts")) {
  const l = document.createElement("link"); l.id = "lf-fonts"; l.rel = "stylesheet"; l.href = ${JSON.stringify(t.googleFontsHref)}; document.head.appendChild(l);
}
const TitleScene: React.FC<{ scene: Extract<Scene,{kind:"title"}> }> = ({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const op = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ textAlign: "center", opacity: op }}>
        <div style={{ fontFamily: FONT_BODY, fontSize: 28, fontWeight: 600, letterSpacing: "0.36em", color: ACCENT, marginBottom: 32 }}>{scene.eyebrow}</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 132, fontWeight: 900, color: TEXT, lineHeight: 1 }}>{scene.line}</div>
      </div>
    </AbsoluteFill>
  );
};
const DeviceScene: React.FC<{ scene: Extract<Scene,{kind:"device"}> }> = ({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const enterScale = spring({ frame, fps, config: { damping: 16, stiffness: 80 } });
  const floatY = Math.sin(frame / fps * 1.6) * 6;
  // Frame proportions
  const isIphone = scene.frame === "iphone";
  const isLaptop = scene.frame === "laptop";
  const isBrowser = scene.frame === "browser";
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ transform: \`scale(\${enterScale}) translateY(\${floatY}px)\` }}>
        {isIphone && (
          <div style={{ width: 540, height: 1100, borderRadius: 64, background: "#0a0a0a", padding: 18, boxShadow: \`0 30px 80px rgba(0,0,0,0.55), 0 0 0 4px \${ACCENT}55\` }}>
            <div style={{ width: "100%", height: "100%", borderRadius: 48, overflow: "hidden", background: "#000" }}>
              <Img src={staticFile("photos/" + scene.screenshot)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ position: "absolute", top: 22, left: "50%", transform: "translateX(-50%)", width: 140, height: 32, borderRadius: 16, background: "#0a0a0a" }} />
          </div>
        )}
        {isLaptop && (
          <div>
            <div style={{ width: 820, height: 540, borderRadius: 18, background: "#0a0a0a", padding: 14, boxShadow: \`0 30px 80px rgba(0,0,0,0.55)\` }}>
              <div style={{ width: "100%", height: "100%", borderRadius: 8, overflow: "hidden", background: "#000" }}>
                <Img src={staticFile("photos/" + scene.screenshot)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            </div>
            <div style={{ marginTop: -4, width: 920, marginLeft: -50, height: 24, borderRadius: \`0 0 32px 32px\`, background: "#222", boxShadow: \`0 16px 30px rgba(0,0,0,0.4)\` }} />
          </div>
        )}
        {isBrowser && (
          <div style={{ width: 820, borderRadius: 18, overflow: "hidden", background: "#0a0a0a", boxShadow: \`0 30px 80px rgba(0,0,0,0.55)\` }}>
            <div style={{ height: 48, background: "#1a1a1a", display: "flex", alignItems: "center", padding: "0 18px", gap: 8 }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, background: "#ff5f57" }} />
              <div style={{ width: 14, height: 14, borderRadius: 7, background: "#febc2e" }} />
              <div style={{ width: 14, height: 14, borderRadius: 7, background: "#28c840" }} />
            </div>
            <Img src={staticFile("photos/" + scene.screenshot)} style={{ width: "100%", height: 920, objectFit: "cover", display: "block" }} />
          </div>
        )}
      </div>
      <div style={{ position: "absolute", bottom: 120, textAlign: "center", fontFamily: FONT_DISPLAY, fontSize: 72, fontWeight: 800, color: TEXT, maxWidth: 900, padding: "0 40px" }}>{scene.caption}</div>
    </AbsoluteFill>
  );
};
const EndCardScene: React.FC<{ scene: Extract<Scene,{kind:"endcard"}> }> = ({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const op = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ textAlign: "center", opacity: op }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 100, fontWeight: 700, color: TEXT, lineHeight: 1.1 }}>{scene.tagline}</div>
        <div style={{ marginTop: 40, marginBottom: 40, display: "flex", justifyContent: "center" }}><div style={{ width: 240, height: 3, backgroundColor: ACCENT }} /></div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 52, fontWeight: 700, color: ACCENT }}>{scene.cta}</div>
        <div style={{ marginTop: 28, fontFamily: FONT_BODY, fontSize: 32, color: TEXT_SOFT, letterSpacing: "0.04em" }}>{scene.url}</div>
      </div>
    </AbsoluteFill>
  );
};
export const Reel: React.FC = () => {
  let offset = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: BG, color: TEXT, fontFamily: FONT_BODY }}>
      {scenes.map((scene, idx) => {
        const from = offset; offset += scene.durationFrames;
        return (
          <Sequence key={idx} from={from} durationInFrames={scene.durationFrames}>
            {scene.kind === "title" && <TitleScene scene={scene} />}
            {scene.kind === "device" && <DeviceScene scene={scene} />}
            {scene.kind === "endcard" && <EndCardScene scene={scene} />}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
`;
}

/**
 * Compose the entire pipeline as one PowerShell script:
 *   1. Write .lf-reels/{src/index.ts, Root.tsx, Reel.tsx, data.ts}
 *   2. Copy referenced assets into the engine's public/photos/
 *   3. cd into the engine and run \`npx remotion render <entry> Reel <out>\`
 *   4. Open the resulting MP4
 */
export function buildStudioScript(i: StudioInputs): string {
  const reelsRoot = i.reelsEngineWin;
  const projHome = i.projectHomeWin;
  const slug = i.slug;
  const reelDir = `${projHome}\\.lf-reels\\src`;

  // Asset copies — assetSources are relative to projHome
  const copyLines = i.assetSources.map(rel => {
    const winRel = rel.replace(/\//g, "\\");
    const base = winRel.split("\\").pop();
    return `Copy-Item -LiteralPath '${projHome}\\${winRel}' -Destination "$Photos\\${base}" -Force`;
  });

  const layout = i.tokens.layout ?? "step-walkthrough";
  const reelTsxRaw =
      layout === "kinetic-text" ? reelKineticText(i.tokens, i)
    : layout === "parallax-hero" ? reelParallaxHero(i.tokens, i)
    : layout === "quote-card" ? reelQuoteCard(i.tokens, i)
    : layout === "before-after" ? reelBeforeAfter(i.tokens, i)
    : layout === "big-number" ? reelBigNumber(i.tokens, i)
    : layout === "code-reveal" ? reelCodeReveal(i.tokens, i)
    : layout === "device-frame" ? reelDeviceFrame(i.tokens, i)
    : reelTsx(i.tokens, i.steps, i);
  const reelTsxBody = withAudio(reelTsxRaw, i);
  const dataTsBody =
      layout === "kinetic-text" ? dataKineticText(i)
    : layout === "parallax-hero" ? dataParallaxHero(i)
    : layout === "quote-card" ? dataQuoteCard(i)
    : layout === "before-after" ? dataBeforeAfter(i)
    : layout === "big-number" ? dataBigNumber(i)
    : layout === "code-reveal" ? dataCodeReveal(i)
    : layout === "device-frame" ? dataDeviceFrame(i)
    : dataTs(i.steps, i);

  return [
    `# LaunchFoundry Reels Studio — one-click render for ${i.projectName}`,
    `# Project home: ${projHome}`,
    `# Engine:       ${reelsRoot}`,
    `# Slug:         ${slug}`,
    "",
    "$ErrorActionPreference = 'Stop'",
    `$ProjHome = '${projHome}'`,
    `$ReelsRoot = '${reelsRoot}'`,
    `$Slug = '${slug}'`,
    `$Photos = "$ReelsRoot\\public\\photos"`,
    `$ReelDir = "$ProjHome\\.lf-reels\\src"`,
    `$OutDir = "$ProjHome\\out"`,
    "",
    `if (-not (Test-Path $ReelsRoot)) { Write-Host "Reels engine not found at $ReelsRoot" -ForegroundColor Red; Read-Host 'Press Enter'; exit 1 }`,
    `if (-not (Test-Path $ProjHome)) { Write-Host "Project home not found at $ProjHome" -ForegroundColor Red; Read-Host 'Press Enter'; exit 1 }`,
    "",
    `if (-not (Test-Path "$ReelsRoot\\node_modules")) {`,
    `  Write-Host '[setup] Installing engine deps (one-time)...' -ForegroundColor Cyan`,
    `  Push-Location $ReelsRoot; try { npm install } finally { Pop-Location }`,
    "}",
    "",
    "# Auto-install Studio companion packages on first run, PINNED to the engine's Remotion version.",
    "# Remotion is strict — every @remotion/* package must be the exact same version.",
    "$ExtraPkgs = @('@remotion/transitions','@remotion/animation-utils','@remotion/google-fonts','@remotion/preload','@remotion/shapes')",
    `$RemotionPkgJson = Join-Path "$ReelsRoot\\node_modules\\remotion" 'package.json'`,
    "if (-not (Test-Path $RemotionPkgJson)) {",
    `  Write-Host "Engine's remotion package.json not found — run 'npm install' in the engine first." -ForegroundColor Red`,
    "  Read-Host 'Press Enter to exit'; exit 1",
    "}",
    "$RemotionVersion = (Get-Content $RemotionPkgJson -Raw | ConvertFrom-Json).version",
    "$NeedsInstall = @()",
    "foreach ($pkg in $ExtraPkgs) {",
    `  $pkgDir = Join-Path "$ReelsRoot\\node_modules" $pkg`,
    "  $pkgVerOk = $false",
    "  if (Test-Path $pkgDir) {",
    "    $installedVer = (Get-Content (Join-Path $pkgDir 'package.json') -Raw | ConvertFrom-Json).version",
    "    if ($installedVer -eq $RemotionVersion) { $pkgVerOk = $true }",
    "  }",
    "  if (-not $pkgVerOk) { $NeedsInstall += (\"{0}@{1}\" -f $pkg, $RemotionVersion) }",
    "}",
    "if ($NeedsInstall.Count -gt 0) {",
    "  Write-Host '[setup] Pinning Studio packages to Remotion' $RemotionVersion ':' ($NeedsInstall -join ', ') -ForegroundColor Cyan",
    "  Push-Location $ReelsRoot",
    "  try { & npm install --save-exact $NeedsInstall } finally { Pop-Location }",
    "}",
    "",
    "# Webpack resolves @remotion/* from the entry-point file's parent tree. Since this",
    "# project lives outside the engine's tree, we create a directory junction so",
    "# .lf-reels/node_modules -> engine's node_modules. Junctions don't need admin.",
    "$NodeModulesLink = Join-Path $ProjHome '.lf-reels\\node_modules'",
    "$LinkTarget = Join-Path $ReelsRoot 'node_modules'",
    "$LinkOk = $false",
    "if (Test-Path $NodeModulesLink) {",
    "  $item = Get-Item $NodeModulesLink -Force -ErrorAction SilentlyContinue",
    "  if ($item -and ($item.LinkType -eq 'Junction' -or $item.LinkType -eq 'SymbolicLink')) {",
    "    $LinkOk = $true",
    "  } else {",
    "    Write-Host '[setup] Removing stale .lf-reels/node_modules (was a real directory, expected a junction)...' -ForegroundColor Yellow",
    "    Remove-Item -LiteralPath $NodeModulesLink -Recurse -Force",
    "  }",
    "}",
    "if (-not $LinkOk) {",
    "  Write-Host '[setup] Linking .lf-reels/node_modules -> engine node_modules' -ForegroundColor Cyan",
    "  $linkOut = cmd /c mklink /J \"$NodeModulesLink\" \"$LinkTarget\" 2>&1",
    "  if ($LASTEXITCODE -ne 0) {",
    "    Write-Host ('mklink failed: ' + $linkOut) -ForegroundColor Red",
    "    Read-Host 'Press Enter to exit'; exit 1",
    "  }",
    "}",
    "",
    "New-Item -ItemType Directory -Force -Path $ReelDir, $Photos, $OutDir | Out-Null",
    "",
    "Write-Host '[1/4] Writing .lf-reels/src/* ...' -ForegroundColor Cyan",
    "Set-Content -Path \"$ReelDir\\index.ts\" -Encoding UTF8 -Value @'",
    INDEX_TS.trimEnd(),
    "'@",
    "Set-Content -Path \"$ReelDir\\Root.tsx\" -Encoding UTF8 -Value @'",
    buildRootTsx(i.outputs ?? ["9x16"]).trimEnd(),
    "'@",
    "Set-Content -Path \"$ReelDir\\Reel.tsx\" -Encoding UTF8 -Value @'",
    reelTsxBody.trimEnd(),
    "'@",
    "Set-Content -Path \"$ReelDir\\data.ts\" -Encoding UTF8 -Value @'",
    dataTsBody.trimEnd(),
    "'@",
    "",
    `Write-Host '[2/4] Copying ${i.assetSources.length} asset(s) into engine...' -ForegroundColor Cyan`,
    ...copyLines,
    "",
    // Dropped images (base64 decode → write to engine/photos)
    ...(i.droppedImages?.length ? [
      `Write-Host '[2b/4] Decoding ${i.droppedImages.length} dropped image(s)...' -ForegroundColor Cyan`,
      ...i.droppedImages.flatMap((img, idx) => [
        `$B64_${idx} = @'`,
        img.base64,
        "'@",
        `[IO.File]::WriteAllBytes((Join-Path $Photos '${img.filename}'), [Convert]::FromBase64String($B64_${idx}))`,
        "",
      ]),
    ] : []),
    // Audio (base64 decode → write to engine/photos as a sibling of images)
    ...(i.audioFilename && i.audioBase64 ? [
      `Write-Host '[2c/4] Decoding soundtrack ${i.audioFilename}...' -ForegroundColor Cyan`,
      `$AudioB64 = @'`,
      i.audioBase64,
      "'@",
      `[IO.File]::WriteAllBytes((Join-Path $Photos '${i.audioFilename}'), [Convert]::FromBase64String($AudioB64))`,
      "",
    ] : []),
    ...(() => {
      const picks = (i.outputs && i.outputs.length ? i.outputs : (["9x16"] as OutputFormat[]));
      const quality = QUALITY_PRESETS.find(q => q.id === (i.quality ?? "standard"))!;
      const renderItems = picks.map(id => `  @{ Id = 'Reel-${id}'; Out = "$OutDir\\${i.slug}-${id}.mp4"; Label = '${OUTPUT_FORMATS.find(f => f.id === id)!.label}' }`).join("\n");
      return [
        `# Render ${picks.length} output(s) at ${quality.label.toLowerCase()} quality (scale=${quality.scale}, crf=${quality.crf}).`,
        "$Renders = @(",
        renderItems,
        ")",
        `$Scale = ${quality.scale}`,
        `$Crf = ${quality.crf}`,
        `Write-Host ('[3/4] Rendering ' + $Renders.Count + ' output(s) at ${quality.label} quality...') -ForegroundColor Cyan`,
        "$Produced = @()",
        "$Failed = @()",
        "Push-Location $ReelsRoot",
        "try {",
        "  foreach ($r in $Renders) {",
        "    Write-Host (\"  ▶ \" + $r.Label + \"  →  \" + $r.Out) -ForegroundColor Cyan",
        "    & npx remotion render \"$ReelDir\\index.ts\" $r.Id $r.Out --codec=h264 --crf=$Crf --scale=$Scale",
        "    if ($LASTEXITCODE -eq 0 -and (Test-Path $r.Out)) { $Produced += $r.Out } else { $Failed += $r.Label }",
        "  }",
        "} finally { Pop-Location }",
        "",
        "if ($Produced.Count -gt 0) {",
        "  Write-Host ('[4/4] Done. Produced ' + $Produced.Count + ' file(s):') -ForegroundColor Green",
        "  $Produced | ForEach-Object { Write-Host ('  ' + $_) }",
        "  if ($Failed.Count -eq 0) { Start-Process $OutDir }",
        "}",
        "if ($Failed.Count -gt 0) {",
        "  Write-Host ('[4/4] ' + $Failed.Count + ' render(s) failed: ' + ($Failed -join ', ')) -ForegroundColor Red",
        "}",
      ];
    })(),
    "",
    "Read-Host 'Press Enter to close this window'",
  ].join("\n");
}
