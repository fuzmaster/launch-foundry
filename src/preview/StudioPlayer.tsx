// Wraps @remotion/player around the runtime StudioReel composition and adds
// a "Record to WebM" button that uses the Player's underlying canvas + the
// MediaRecorder API. The result is a downloadable video file produced
// entirely in the browser — no PowerShell, no FFmpeg, no Remotion CLI.

import { useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { StudioReel, reelDurationFrames, type ReelProps } from "./StudioReel";

const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;

export type StudioPlayerProps = {
  tokens: ReelProps["tokens"];
  tagline: string;
  oneLiner: string;
  cta: string;
  projectName: string;
  url?: string;
  /** Each step's image as either a project File or a pre-resolved URL. */
  steps: { label: string; sub: string; file?: File; url?: string }[];
  slug: string;
  layoutSupported: boolean;
  /** Optional soundtrack as a base64-encoded MP3. Becomes a data: URL inside
   *  the Player so the live preview plays the audio in sync with the visuals. */
  audioFilename?: string;
  audioBase64?: string;
};

export default function StudioPlayer({ tokens, tagline, oneLiner, cta, projectName, url, steps, slug, layoutSupported, audioFilename, audioBase64 }: StudioPlayerProps) {
  const playerRef = useRef<PlayerRef | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);

  // Build blob URLs for any step.file we got. Revoke when component unmounts
  // or when the step list changes.
  const stepUrls = useMemo(() => {
    return steps.map(s => {
      if (s.url) return s.url;
      if (s.file) {
        try { return URL.createObjectURL(s.file); } catch { return undefined; }
      }
      return undefined;
    });
  }, [steps]);

  useEffect(() => {
    return () => {
      for (let i = 0; i < stepUrls.length; i++) {
        const u = stepUrls[i];
        // Only revoke URLs we created (not ones passed in as already-resolved).
        if (u && steps[i]?.file) URL.revokeObjectURL(u);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepUrls]);

  const audioUrl = useMemo(() => {
    if (!audioBase64 || !audioFilename) return undefined;
    // Heuristic MIME by extension; falls back to mpeg.
    const ext = audioFilename.toLowerCase().split(".").pop();
    const mime = ext === "wav" ? "audio/wav" : ext === "ogg" ? "audio/ogg" : "audio/mpeg";
    return `data:${mime};base64,${audioBase64}`;
  }, [audioBase64, audioFilename]);

  const reelProps: ReelProps = {
    tokens,
    tagline,
    oneLiner,
    cta,
    projectName,
    url,
    steps: steps.map((s, i) => ({ label: s.label, sub: s.sub, imageUrl: stepUrls[i] })),
    audioUrl,
  };

  const duration = reelDurationFrames(steps.length || 1);
  const durationSec = duration / FPS;

  /**
   * Find the <canvas> the Player renders into (Remotion uses HTML+CSS, not a
   * single canvas — but Player wraps everything in a measured div). To record,
   * we use html-to-canvas-like screenshotting via captureStream on a tabbed
   * <video> isn't possible. So instead we use the actual approach: ask the
   * user's browser to record this tab via getDisplayMedia. Crisp, real frames.
   */
  async function recordTab() {
    setRecordError(null);
    setRecordedUrl(null);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setRecordError("Your browser doesn't support tab-recording (getDisplayMedia). Try Chrome or Edge.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: FPS },
        audio: false,
      });
    } catch (err) {
      setRecordError("Recording cancelled.");
      return;
    }

    const mimeCandidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const mime = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
    const chunks: Blob[] = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    } catch (err) {
      setRecordError("Failed to start MediaRecorder: " + (err as Error).message);
      stream.getTracks().forEach(t => t.stop());
      return;
    }

    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      setRecordedUrl(url);
      stream.getTracks().forEach(t => t.stop());
    };

    setRecording(true);
    recorder.start(250);

    // Play the reel from frame 0, then stop the recorder when it ends.
    const p = playerRef.current;
    if (p) {
      p.seekTo(0);
      p.play();
    }

    setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
      setRecording(false);
      const p2 = playerRef.current;
      if (p2) p2.pause();
    }, (durationSec + 0.5) * 1000);
  }

  if (!layoutSupported) {
    return (
      <div style={{ padding: "20px 24px", background: "var(--surface)", border: "1px solid var(--border)", fontSize: 13, lineHeight: 1.6 }}>
        <strong>Live preview not yet wired for this layout.</strong>{" "}
        The in-browser player currently supports <code>step-walkthrough</code>. Other layouts will render correctly via the disk script — switch the layout in <em>Tokens</em> to preview, or use the script render below to produce an MP4.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "block", padding: 16, background: "#000", textAlign: "center" }}>
        <div style={{ display: "inline-block", width: 360, height: 640 }}>
          <Player
            ref={playerRef}
            component={StudioReel}
            inputProps={reelProps}
            compositionWidth={WIDTH}
            compositionHeight={HEIGHT}
            fps={FPS}
            durationInFrames={duration}
            controls
            loop
            acknowledgeRemotionLicense
            style={{ width: 360, height: 640, display: "block" }}
          />
        </div>
      </div>

      <div className="button-row" style={{ marginTop: 14 }}>
        <button onClick={recordTab} disabled={recording}>
          {recording ? "Recording…" : "Record preview to WebM"}
        </button>
        {recordedUrl && (
          <a className="button" href={recordedUrl} download={`${slug}.webm`} style={{ alignSelf: "center", padding: "8px 14px", border: "1px solid var(--border)", textDecoration: "none", color: "var(--text)" }}>
            Download {slug}.webm
          </a>
        )}
      </div>

      {recordError && (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--danger, #c97a4a)" }}>{recordError}</p>
      )}

      <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
        Tip: when the browser prompts for what to share, pick <strong>This Tab</strong> for the cleanest result. Recording runs for {durationSec.toFixed(1)}s and downloads a WebM. For an MP4 with FFmpeg-grade quality, use the disk-render script below.
      </p>
    </div>
  );
}
