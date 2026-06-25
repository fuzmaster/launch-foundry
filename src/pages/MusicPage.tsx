// Round F · Music step. Generate a music brief for Suno / Udio / Mubert,
// open search providers (Pixabay / YT Audio Library / FMA) with brand
// keywords prefilled, drop downloaded MP3s back into LF for the render.

import { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import { loadState, saveState } from "../lib/storage";
import { DEFAULT_TOKENS, type BrandTokens } from "../lib/brandExtract";
import {
  MUSIC_PROVIDERS, buildMusicBrief, makeBriefInputs, openProvider, searchKeywords,
  type MusicProvider,
} from "../lib/musicPrompt";

const PROVIDER_ORDER: MusicProvider[] = ["suno", "udio", "mubert", "pixabay", "youtube-audio", "fma"];

type DroppedTrack = {
  filename: string;
  base64: string;       // for the render pipeline to bundle
  sizeBytes: number;
};

export default function MusicPage() {
  // Pull brand tokens — for the Studio path, tokens live under the
  // launchfoundry.studio.* keys; for the wider campaign path they live on
  // the active project. We try the Studio key first.
  const tokens: BrandTokens = useMemo(() => {
    return loadState<BrandTokens>("launchfoundry.studio.tokens", DEFAULT_TOKENS);
  }, []);

  // Concept hook + duration come from the Studio inputs by default.
  const defaultHook = loadState<string>("launchfoundry.studio.tagline", "tell your story");
  const defaultDuration = 16;

  const [provider, setProvider] = useState<MusicProvider>(() => loadState<MusicProvider>("launchfoundry.music.provider", "suno"));
  const [conceptHook, setConceptHook] = useState<string>(() => loadState("launchfoundry.music.hook", defaultHook));
  const [duration, setDuration] = useState<number>(() => loadState("launchfoundry.music.duration", defaultDuration));
  const [mood, setMood] = useState<string>(() => loadState("launchfoundry.music.mood", ""));
  const [bpm, setBpm] = useState<string>(() => loadState("launchfoundry.music.bpm", ""));
  const [dropped, setDropped] = useState<DroppedTrack | null>(() => loadState<DroppedTrack | null>("launchfoundry.music.dropped", null));
  const [copied, setCopied] = useState(false);

  useEffect(() => saveState("launchfoundry.music.provider", provider), [provider]);
  useEffect(() => saveState("launchfoundry.music.hook", conceptHook), [conceptHook]);
  useEffect(() => saveState("launchfoundry.music.duration", duration), [duration]);
  useEffect(() => saveState("launchfoundry.music.mood", mood), [mood]);
  useEffect(() => saveState("launchfoundry.music.bpm", bpm), [bpm]);
  useEffect(() => saveState("launchfoundry.music.dropped", dropped), [dropped]);

  const briefInputs = useMemo(() => {
    const base = makeBriefInputs(tokens, conceptHook, duration, mood || undefined);
    return { ...base, bpm: bpm || undefined };
  }, [tokens, conceptHook, duration, mood, bpm]);

  const brief = useMemo(() => buildMusicBrief(provider, briefInputs), [provider, briefInputs]);
  const keywords = useMemo(() => searchKeywords(tokens, conceptHook, mood || undefined), [tokens, conceptHook, mood]);

  const isGenerative = MUSIC_PROVIDERS[provider].mode === "generative";

  async function onCopy() {
    try { await navigator.clipboard.writeText(brief); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }

  function onDrop(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is data:audio/mpeg;base64,XXXX
      const b64 = result.split(",")[1] ?? "";
      setDropped({ filename: file.name, base64: b64, sizeBytes: file.size });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="page">
      <h1>Music</h1>
      <p className="lede">
        Generate a brief for an AI music tool, or open a free royalty-free library with brand keywords prefilled.
        Drop the resulting MP3 back here so it bundles into your render.
      </p>

      <Card title="Choose provider" eyebrow="Step 1">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
          {PROVIDER_ORDER.map(id => {
            const p = MUSIC_PROVIDERS[id];
            const picked = provider === id;
            return (
              <label key={id} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px",
                border: `1px solid ${picked ? "var(--accent)" : "var(--line)"}`,
                background: picked ? "var(--accent-glow)" : "transparent",
                cursor: "pointer", lineHeight: 1.45,
              }}>
                <input type="radio" name="musicProvider" checked={picked} onChange={() => setProvider(id)} style={{ marginTop: 3 }} />
                <span>
                  <strong style={{ display: "block", fontSize: 14 }}>{p.label}
                    <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 11, marginLeft: 6 }}>{p.mode === "generative" ? "GEN" : "SEARCH"}</span>
                  </strong>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{p.blurb}</span>
                </span>
              </label>
            );
          })}
        </div>
      </Card>

      <Card title="Inputs" eyebrow="Step 2 — drive the brief / search">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <label>
            <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Concept hook</span>
            <input type="text" value={conceptHook} onChange={e => setConceptHook(e.target.value)} placeholder="30 years of carpentry" />
          </label>
          <label>
            <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Duration (sec)</span>
            <input type="number" min={5} max={60} value={duration} onChange={e => setDuration(Number(e.target.value))} />
          </label>
          <label>
            <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Mood (optional)</span>
            <input type="text" value={mood} onChange={e => setMood(e.target.value)} placeholder="warm cinematic" />
          </label>
          <label>
            <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>BPM (optional)</span>
            <input type="text" value={bpm} onChange={e => setBpm(e.target.value)} placeholder="70-90" />
          </label>
        </div>
      </Card>

      {isGenerative ? (
        <Card title={`Brief for ${MUSIC_PROVIDERS[provider].label}`} eyebrow="Step 3 — paste into the tool">
          <textarea
            value={brief}
            readOnly
            rows={brief.split("\n").length + 1}
            style={{ width: "100%", fontFamily: "var(--mono)", fontSize: 12, padding: 12, background: "rgba(0,0,0,0.4)", border: "1px solid var(--line)", color: "var(--text-soft)" }}
          />
          <div className="button-row" style={{ marginTop: 10 }}>
            <button className="primary" onClick={onCopy}>{copied ? "✓ Copied" : "Copy brief"}</button>
            <button onClick={() => openProvider(provider, keywords)}>Open {MUSIC_PROVIDERS[provider].label} ↗</button>
          </div>
        </Card>
      ) : (
        <Card title={`Search ${MUSIC_PROVIDERS[provider].label}`} eyebrow="Step 3 — find a track">
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-soft)" }}>
            Opens {MUSIC_PROVIDERS[provider].label} with these search keywords prefilled:
            <code style={{ marginLeft: 8 }}>{keywords}</code>
          </p>
          <button className="primary" onClick={() => openProvider(provider, keywords)}>
            Open {MUSIC_PROVIDERS[provider].label} ↗
          </button>
        </Card>
      )}

      <Card title="Drop the MP3 back" eyebrow="Step 4 — bundles into the render">
        <label
          style={{
            display: "block", padding: "28px 18px", textAlign: "center",
            border: "2px dashed var(--line2)", borderRadius: 8, cursor: "pointer",
            background: dropped ? "var(--accent-glow)" : "transparent",
          }}
          onDragOver={e => { e.preventDefault(); }}
          onDrop={e => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) onDrop(f);
          }}
        >
          {dropped ? (
            <div>
              <strong style={{ display: "block", color: "var(--accent)" }}>♪ {dropped.filename}</strong>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{(dropped.sizeBytes / 1024 / 1024).toFixed(2)} MB · base64-embedded for render</span>
            </div>
          ) : (
            <div>
              <strong style={{ display: "block", marginBottom: 6 }}>Drop an MP3 here</strong>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>or click to pick</span>
            </div>
          )}
          <input
            type="file"
            accept="audio/mpeg,audio/mp3,audio/wav,audio/*"
            style={{ display: "none" }}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) onDrop(f);
            }}
          />
        </label>
        {dropped && (
          <div className="button-row" style={{ marginTop: 10 }}>
            <button onClick={() => setDropped(null)}>Remove track</button>
            <audio src={`data:audio/mpeg;base64,${dropped.base64}`} controls style={{ flex: 1, maxWidth: 400 }} />
          </div>
        )}
        <p style={{ margin: "12px 0 0", fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
          Heads-up: the in-app render path (Tauri) will pick this MP3 up automatically.
          The PowerShell-script path doesn't bundle audio yet — that's a Phase D-2 follow-up.
        </p>
      </Card>
    </div>
  );
}
