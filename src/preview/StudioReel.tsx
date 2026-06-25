// Runtime Remotion composition mirroring what the script generator emits for
// the step-walkthrough layout. Renders in-browser via @remotion/player. Other
// layouts fall back to a "preview not implemented" card so the user still gets
// the title slate + the disk-render path.

import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Img } from "remotion";
import type { BrandTokens, Motif } from "../lib/brandExtract";

/** Public shape — only the props we need for runtime, decoupled from the
 *  PowerShell-script StudioInputs (which carries file paths). */
export type ReelProps = {
  tokens: BrandTokens;
  tagline: string;
  oneLiner: string;
  cta: string;
  projectName: string;
  url?: string;
  /** Steps with already-resolved blob URLs (caller maps file → URL.createObjectURL). */
  steps: { label: string; sub: string; imageUrl?: string }[];
  /** Optional soundtrack data URL or blob URL for the live Player preview. */
  audioUrl?: string;
};

const TITLE_FRAMES = 90;
const STEP_FRAMES = 75;
const ENDCARD_FRAMES = 105;

export function reelDurationFrames(stepCount: number): number {
  return TITLE_FRAMES + STEP_FRAMES * Math.max(1, stepCount) + ENDCARD_FRAMES;
}

function MotifBackground({ motif, tokens }: { motif: Motif; tokens: BrandTokens }) {
  const common: React.CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };
  if (motif === "graph-paper") {
    return (
      <div style={{
        ...common,
        backgroundImage: "linear-gradient(rgba(0,0,0,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.07) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }} />
    );
  }
  if (motif === "blueprint") {
    return (
      <div style={{
        ...common,
        backgroundImage: "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }} />
    );
  }
  if (motif === "gradient") {
    return (
      <div style={{
        ...common,
        backgroundImage: `radial-gradient(circle at 20% 0%, ${tokens.accentSoft}, transparent 50%), radial-gradient(circle at 80% 100%, ${tokens.accentSoft}, transparent 60%)`,
      }} />
    );
  }
  if (motif === "dot-grid") {
    return (
      <div style={{
        ...common,
        backgroundImage: "radial-gradient(rgba(255,255,255,0.18) 1.5px, transparent 1.5px)",
        backgroundSize: "26px 26px",
      }} />
    );
  }
  if (motif === "vintage-paper") {
    return (
      <div style={{
        ...common,
        backgroundImage: "radial-gradient(circle at 30% 30%, rgba(255,220,180,0.08), transparent 40%), radial-gradient(circle at 70% 70%, rgba(160,120,80,0.10), transparent 50%)",
      }} />
    );
  }
  if (motif === "terminal-green") {
    return (
      <div style={{
        ...common,
        backgroundImage: "linear-gradient(rgba(0,255,128,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,128,0.06) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }} />
    );
  }
  if (motif === "scan-lines") {
    return (
      <div style={{
        ...common,
        backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 2px, transparent 4px), radial-gradient(circle at center, transparent 60%, rgba(0,0,0,0.5))",
      }} />
    );
  }
  return null;
}

function TitleScene({ tokens, projectName, tagline, oneLiner }: { tokens: BrandTokens; projectName: string; tagline: string; oneLiner: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const eyebrowO = spring({ frame, fps, config: { damping: 18 } });
  const titleO = spring({ frame: frame - 8, fps, config: { damping: 18 } });
  const ruleW = interpolate(frame - 16, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const subO = interpolate(frame - 24, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 100, textAlign: "center" }}>
      <div style={{ opacity: eyebrowO, color: tokens.accent, fontFamily: tokens.fontBody, fontSize: 28, letterSpacing: 6, marginBottom: 36 }}>
        {projectName.toUpperCase()}
      </div>
      <div style={{ opacity: titleO, transform: `translateY(${interpolate(titleO, [0, 1], [12, 0])}px)`, color: tokens.text, fontFamily: tokens.fontDisplay, fontSize: 110, lineHeight: 1.08, fontWeight: 700 }}>
        {tagline}
      </div>
      <div style={{ width: ruleW * 220, height: 4, background: tokens.accent, margin: "44px 0 36px" }} />
      <div style={{ opacity: subO, color: tokens.textSoft, fontFamily: tokens.fontBody, fontSize: 36, maxWidth: 800, lineHeight: 1.4 }}>
        {oneLiner}
      </div>
    </AbsoluteFill>
  );
}

function StepScene({ tokens, index, label, sub, imageUrl, total }: { tokens: BrandTokens; index: number; label: string; sub: string; imageUrl?: string; total: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = spring({ frame, fps, config: { damping: 18 } });
  const imgScale = interpolate(frame, [0, STEP_FRAMES], [1.04, 1.0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ flexDirection: "column" }}>
      <div style={{ flex: 1.4, position: "relative", overflow: "hidden", backgroundColor: tokens.surface }}>
        {imageUrl ? (
          <Img src={imageUrl} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: `scale(${imgScale})`, opacity: o }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: tokens.textSoft, fontFamily: tokens.fontBody, fontSize: 36, opacity: 0.4 }}>
            no image
          </div>
        )}
      </div>
      <div style={{ flex: 1, padding: 80, backgroundColor: tokens.background, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ opacity: o, color: tokens.accent, fontFamily: tokens.fontBody, fontSize: 26, letterSpacing: 5, marginBottom: 22 }}>
          STEP {index + 1} / {total}
        </div>
        <div style={{ opacity: o, transform: `translateY(${interpolate(o, [0, 1], [10, 0])}px)`, color: tokens.text, fontFamily: tokens.fontDisplay, fontSize: 92, fontWeight: 700, marginBottom: 16 }}>
          {label}
        </div>
        <div style={{ opacity: o, color: tokens.textSoft, fontFamily: tokens.fontBody, fontSize: 34, lineHeight: 1.4 }}>
          {sub}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function EndCard({ tokens, cta, url }: { tokens: BrandTokens; cta: string; url?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = spring({ frame, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 100, textAlign: "center" }}>
      <div style={{ opacity: o, transform: `translateY(${interpolate(o, [0, 1], [16, 0])}px)`, color: tokens.text, fontFamily: tokens.fontDisplay, fontSize: 96, fontWeight: 700, marginBottom: 48 }}>
        {cta}
      </div>
      {url && (
        <div style={{ opacity: o, padding: "16px 36px", border: `2px solid ${tokens.accent}`, color: tokens.accent, fontFamily: tokens.fontBody, fontSize: 30, letterSpacing: 2 }}>
          {url}
        </div>
      )}
    </AbsoluteFill>
  );
}

export function StudioReel({ tokens, tagline, oneLiner, cta, projectName, url, steps, audioUrl }: ReelProps) {
  const safeSteps = steps.length ? steps : [{ label: "STEP", sub: "—", imageUrl: undefined }];
  return (
    <AbsoluteFill style={{ backgroundColor: tokens.background, color: tokens.text }}>
      {audioUrl && <Audio src={audioUrl} volume={0.85} />}
      <MotifBackground motif={tokens.motif} tokens={tokens} />

      <Sequence durationInFrames={TITLE_FRAMES}>
        <TitleScene tokens={tokens} projectName={projectName} tagline={tagline} oneLiner={oneLiner} />
      </Sequence>

      {safeSteps.map((s, i) => (
        <Sequence key={i} from={TITLE_FRAMES + i * STEP_FRAMES} durationInFrames={STEP_FRAMES}>
          <StepScene tokens={tokens} index={i} label={s.label} sub={s.sub} imageUrl={s.imageUrl} total={safeSteps.length} />
        </Sequence>
      ))}

      <Sequence from={TITLE_FRAMES + safeSteps.length * STEP_FRAMES} durationInFrames={ENDCARD_FRAMES}>
        <EndCard tokens={tokens} cta={cta} url={url} />
      </Sequence>
    </AbsoluteFill>
  );
}
