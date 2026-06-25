import { useMemo, useState } from "react";
import Card from "../components/Card";
import {
  PROMPTS,
  renderMegaPrompt,
  renderCustomMegaPrompt,
  renderMultiPlatformPrompt,
  renderPrompt,
  type CaptionPlatform,
  type PromptContext,
  type PromptId,
} from "../lib/prompts";
import { copyToClipboard } from "../lib/templateUtils";
import { downloadJson } from "../lib/exportJson";

type Mode = "mega" | "single" | "custom" | "captions";

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const ALL_CAPTION_PLATFORMS: CaptionPlatform[] = [
  "facebook_reel",
  "instagram_reel",
  "youtube_short",
  "linkedin_post",
  "x_post",
  "threads_post",
];
const CAPTION_PLATFORM_LABEL: Record<CaptionPlatform, string> = {
  facebook_reel: "Facebook Reels",
  instagram_reel: "Instagram Reels",
  youtube_short: "YouTube Shorts",
  linkedin_post: "LinkedIn",
  x_post: "X (Twitter)",
  threads_post: "Threads",
};

export default function PromptPackPage({ ctx }: { ctx: PromptContext }) {
  const [mode, setMode] = useState<Mode>("mega");
  const [openId, setOpenId] = useState<string | null>("mega");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedSteps, setSelectedSteps] = useState<Set<PromptId>>(() => new Set<PromptId>(PROMPTS.map(p => p.id)));
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<CaptionPlatform>>(() => new Set<CaptionPlatform>(["facebook_reel", "instagram_reel", "linkedin_post"]));

  const rendered = useMemo(() => {
    const out: Record<PromptId, string> = {} as Record<PromptId, string>;
    for (const p of PROMPTS) out[p.id] = renderPrompt(p.id, ctx);
    return out;
  }, [ctx]);

  const mega = useMemo(() => renderMegaPrompt(ctx), [ctx]);
  const custom = useMemo(() => renderCustomMegaPrompt(ctx, Array.from(selectedSteps)), [ctx, selectedSteps]);
  const captions = useMemo(() => renderMultiPlatformPrompt(ctx, Array.from(selectedPlatforms)), [ctx, selectedPlatforms]);

  const flash = (id: string) => {
    setCopiedId(id);
    setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 1500);
  };
  const copy = async (id: string, text: string) => {
    try { await copyToClipboard(text); } catch {}
    flash(id);
  };

  const toggleStep = (id: PromptId) => {
    setSelectedSteps(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const togglePlatform = (id: CaptionPlatform) => {
    setSelectedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="page">
      <h1>Prompt Pack</h1>
      <p className="lede">
        {mode === "mega" && "One combined prompt covering all 9 pipeline steps. Paste into Claude, get one JSON back, paste it into the Campaign Prompt page to populate everything."}
        {mode === "single" && "Each pipeline step as a ready-to-paste single prompt, filled with the current project's context."}
        {mode === "custom" && "Pick exactly which steps to combine. Useful when you only need to re-run steps 6–8 after editing a concept."}
        {mode === "captions" && "Same brand + concept → caption + hashtag + posting-notes variants for whichever platforms you pick. One prompt, one round-trip."}
      </p>

      <Card title="Mode" eyebrow="View">
        <div className="button-row" style={{ flexWrap: "wrap" }}>
          <button className={mode === "mega" ? "primary" : ""} onClick={() => setMode("mega")}>Full mega</button>
          <button className={mode === "custom" ? "primary" : ""} onClick={() => setMode("custom")}>Custom combo</button>
          <button className={mode === "captions" ? "primary" : ""} onClick={() => setMode("captions")}>Multi-platform captions</button>
          <button className={mode === "single" ? "primary" : ""} onClick={() => setMode("single")}>Single prompts</button>
        </div>
      </Card>

      {mode === "mega" && (
        <Card
          eyebrow="Steps 1–9 combined"
          title="LaunchFoundry — Full Campaign Mega Prompt"
          action={
            <div className="button-row">
              <button onClick={() => copy("mega", mega)}>{copiedId === "mega" ? "Copied" : "Copy"}</button>
              <button onClick={() => downloadText("launchfoundry-mega-prompt.md", mega)}>Download</button>
              <button onClick={() => setOpenId(openId === "mega" ? null : "mega")}>{openId === "mega" ? "Hide" : "Show"}</button>
            </div>
          }
        >
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            Single round-trip covering brand → asset scan → audience → platform → 3 concepts → storyboard → render spec → publishing pack → QA.
          </p>
          {openId === "mega" && (
            <pre className="prompt-preview">{mega}</pre>
          )}
        </Card>
      )}

      {mode === "custom" && (
        <>
          <Card title="Pick steps to include" eyebrow="Custom combo">
            <div className="step-checkbox-grid">
              {PROMPTS.map(p => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    checked={selectedSteps.has(p.id)}
                    onChange={() => toggleStep(p.id)}
                  />
                  <span><strong>Step {p.step}</strong> · {p.label}</span>
                </label>
              ))}
            </div>
            <div className="button-row" style={{ marginTop: 10 }}>
              <button onClick={() => setSelectedSteps(new Set(PROMPTS.map(p => p.id)))}>All</button>
              <button onClick={() => setSelectedSteps(new Set())}>None</button>
              <button onClick={() => setSelectedSteps(new Set(["brand_reader", "asset_scanner", "audience_strategy", "platform_strategy"]))}>Steps 1–4 (intake)</button>
              <button onClick={() => setSelectedSteps(new Set(["campaign_concepts", "storyboard"]))}>Steps 5–6 (concepts)</button>
              <button onClick={() => setSelectedSteps(new Set(["render_spec", "publishing_pack", "qa_checker"]))}>Steps 7–9 (ship)</button>
            </div>
          </Card>

          <Card
            eyebrow={`${selectedSteps.size} step${selectedSteps.size === 1 ? "" : "s"}`}
            title="Custom combined prompt"
            action={
              <div className="button-row">
                <button onClick={() => copy("custom", custom)} disabled={selectedSteps.size === 0}>{copiedId === "custom" ? "Copied" : "Copy"}</button>
                <button onClick={() => downloadText("launchfoundry-custom-prompt.md", custom)} disabled={selectedSteps.size === 0}>Download</button>
                <button onClick={() => setOpenId(openId === "custom" ? null : "custom")}>{openId === "custom" ? "Hide" : "Show"}</button>
              </div>
            }
          >
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
              Output JSON shape adapts to your selection — only the keys for the steps you picked appear.
            </p>
            {openId === "custom" && (
              <pre className="prompt-preview">{custom}</pre>
            )}
          </Card>
        </>
      )}

      {mode === "captions" && (
        <>
          <Card title="Pick platforms" eyebrow="Multi-platform captions">
            <div className="step-checkbox-grid">
              {ALL_CAPTION_PLATFORMS.map(p => (
                <label key={p}>
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.has(p)}
                    onChange={() => togglePlatform(p)}
                  />
                  <span>{CAPTION_PLATFORM_LABEL[p]}</span>
                </label>
              ))}
            </div>
            <div className="button-row" style={{ marginTop: 10 }}>
              <button onClick={() => setSelectedPlatforms(new Set(ALL_CAPTION_PLATFORMS))}>All 6</button>
              <button onClick={() => setSelectedPlatforms(new Set(["facebook_reel", "instagram_reel"]))}>Just FB + IG</button>
              <button onClick={() => setSelectedPlatforms(new Set(["linkedin_post", "x_post", "threads_post"]))}>Just text feeds</button>
            </div>
          </Card>

          <Card
            eyebrow={`${selectedPlatforms.size} platform${selectedPlatforms.size === 1 ? "" : "s"}`}
            title="Caption variants prompt"
            action={
              <div className="button-row">
                <button onClick={() => copy("captions", captions)} disabled={selectedPlatforms.size === 0}>{copiedId === "captions" ? "Copied" : "Copy"}</button>
                <button onClick={() => downloadText("launchfoundry-captions-prompt.md", captions)} disabled={selectedPlatforms.size === 0}>Download</button>
                <button onClick={() => setOpenId(openId === "captions" ? null : "captions")}>{openId === "captions" ? "Hide" : "Show"}</button>
              </div>
            }
          >
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
              Returns a single JSON object with one caption variant per platform — paste back anywhere or copy each line into your scheduler.
            </p>
            {openId === "captions" && (
              <pre className="prompt-preview">{captions}</pre>
            )}
          </Card>
        </>
      )}

      {mode === "single" && (
        <>
          <Card title="Export all" eyebrow="Bulk">
            <div className="button-row">
              <button onClick={() => downloadJson("launchfoundry-prompts.json", rendered)}>Download all (JSON)</button>
              <button
                onClick={() =>
                  downloadText(
                    "launchfoundry-prompts.md",
                    PROMPTS.map(p => `${rendered[p.id]}\n\n---\n`).join("\n")
                  )
                }
              >
                Download all (Markdown)
              </button>
            </div>
          </Card>

          {PROMPTS.map(p => {
            const isOpen = openId === p.id;
            const isCopied = copiedId === p.id;
            return (
              <Card
                key={p.id}
                eyebrow={`Step ${p.step}`}
                title={p.label}
                action={
                  <div className="button-row">
                    <button onClick={() => copy(p.id, rendered[p.id])}>{isCopied ? "Copied" : "Copy"}</button>
                    <button onClick={() => downloadText(`${String(p.step).padStart(2, "0")}_${p.id}.md`, rendered[p.id])}>Download</button>
                    <button onClick={() => setOpenId(isOpen ? null : p.id)}>{isOpen ? "Hide" : "Show"}</button>
                  </div>
                }
              >
                <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                  Uses: {p.uses.join(", ")}
                </p>
                {isOpen && (
                  <pre className="prompt-preview">{rendered[p.id]}</pre>
                )}
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
