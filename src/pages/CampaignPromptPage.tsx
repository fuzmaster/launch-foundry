import { useState } from "react";
import Card from "../components/Card";
import { importCampaignJson } from "../lib/importCampaign";
import type { BrandProfile, CampaignConcept, CampaignPrompt } from "../types";

export default function CampaignPromptPage({
  prompt,
  setPrompt,
  setBrand,
  setImportedConcepts,
  setSelectedConceptId,
}: {
  prompt: CampaignPrompt;
  setPrompt: (prompt: CampaignPrompt) => void;
  setBrand: (brand: BrandProfile) => void;
  setImportedConcepts: (concepts: CampaignConcept[] | null) => void;
  setSelectedConceptId: (id: string) => void;
}) {
  const [pasted, setPasted] = useState("");
  const [feedback, setFeedback] = useState<
    | { kind: "ok"; summary: string; warnings: string[] }
    | { kind: "error"; error: string }
    | null
  >(null);

  const handleImport = () => {
    const result = importCampaignJson(pasted);
    if (!result.ok) {
      setFeedback({ kind: "error", error: result.error });
      return;
    }
    const parts: string[] = [];
    if (result.brand) {
      setBrand(result.brand);
      parts.push("brand");
    }
    if (result.concepts && result.concepts.length > 0) {
      setImportedConcepts(result.concepts);
      setSelectedConceptId(result.concepts[0]!.id);
      parts.push(`${result.concepts.length} concept${result.concepts.length === 1 ? "" : "s"}`);
    }
    setFeedback({
      kind: "ok",
      summary: `Imported ${parts.join(" + ")}.${result.recommendation ? " Recommendation: " + result.recommendation : ""}`,
      warnings: result.warnings,
    });
    setPasted("");
  };

  const clearImported = () => {
    setImportedConcepts(null);
    setFeedback(null);
  };

  return (
    <div className="page">
      <h1>Campaign Prompt</h1>
      <p className="lede">Start with the campaign goal. Paste an AI product brief or full campaign JSON below to populate the project.</p>

      <Card title="Input prompt" eyebrow="Step 1">
        <label>
          Project name
          <input value={prompt.projectName} onChange={e => setPrompt({ ...prompt, projectName: e.target.value })} />
        </label>
        <label>
          Platform
          <select
            value={prompt.platform}
            onChange={e => setPrompt({ ...prompt, platform: e.target.value as CampaignPrompt["platform"] })}
          >
            <option value="facebook_reel">Facebook Reel</option>
            <option value="instagram_reel">Instagram Reel</option>
            <option value="youtube_short">YouTube Short</option>
            <option value="linkedin_post">LinkedIn Post</option>
          </select>
        </label>
        <label>
          Goal
          <textarea value={prompt.goal} onChange={e => setPrompt({ ...prompt, goal: e.target.value })} rows={7} />
        </label>
        <div className="grid two">
          <label>
            Audience hint
            <input value={prompt.audienceHint ?? ""} onChange={e => setPrompt({ ...prompt, audienceHint: e.target.value })} />
          </label>
          <label>
            Tone hint
            <input value={prompt.toneHint ?? ""} onChange={e => setPrompt({ ...prompt, toneHint: e.target.value })} />
          </label>
        </div>
      </Card>

      <Card
        title="Paste AI result"
        eyebrow="Import"
        action={
          <div className="button-row">
            <button className="primary" onClick={handleImport} disabled={!pasted.trim()}>
              Import JSON
            </button>
            <button onClick={clearImported}>Clear imported</button>
          </div>
        }
      >
        <p style={{ margin: "0 0 10px", color: "var(--muted)", fontSize: 13 }}>
          Paste the product brief from Step 3 or the full campaign prompt result from Step 4. Product briefs update the brand profile; full campaign JSON can also replace the project's concepts. Triple-backtick fences and leading prose are stripped automatically.
        </p>
        <details style={{ margin: "0 0 12px" }}>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--accent)", marginBottom: 8 }}>
            Expected shape (click to expand)
          </summary>
          <pre
            style={{
              marginTop: 8,
              fontSize: 11,
              background: "rgba(0,0,0,0.25)",
              padding: 12,
              borderRadius: 6,
              overflow: "auto",
              maxHeight: 300,
              whiteSpace: "pre-wrap",
            }}
          >
{`{
  "brand": {
    "projectName": "...",
    "businessName": "...",
    "websiteUrl": "...",
    "category": "...",
    "oneLiner": "...",
    "offerSummary": "...",
    "targetCustomer": "...",
    "tone": "...",
    "colors": ["#...", "#..."],
    "fonts": ["..."],
    "proofPoints": ["..."],
    "differentiators": ["..."],
    "avoidClaims": ["..."],
    "cta": "..."
  },
  "concepts": [
    {
      "id": "concept-...",
      "title": "...",
      "platform": "facebook_reel",
      "hook": "...",
      "promise": "...",
      "format": "ProjectShowcase reel — ...",
      "durationSeconds": 14,
      "recommendedAssets": ["asset-..."],
      "missingAssets": [],
      "caption": "...",
      "cta": "...",
      "scenes": [
        {
          "id": "s1",
          "startSecond": 0,
          "endSecond": 2,
          "visual": "...",
          "assetIds": ["..."],
          "textOverlay": "...",
          "motionNotes": "Slow push."
        }
      ],
      "score": {
        "audienceFit": 90,
        "platformFit": 88,
        "assetFit": 82,
        "clarity": 90,
        "effort": 86,
        "total": 87,
        "reason": "..."
      }
    }
  ],
  "recommendation": "Take concept #1 — strongest hook and lowest asset gap."
}`}
          </pre>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)" }}>
            Minimum required to import: <code>brand</code> with <code>projectName + oneLiner + category</code>, a Step 3 product brief with <code>projectName</code> plus <code>oneLiner</code> or <code>coreProblemSolved</code>, OR a non-empty <code>concepts</code> array. Extra fields are accepted but may be ignored.
          </p>
        </details>
        <textarea
          value={pasted}
          onChange={e => setPasted(e.target.value)}
          rows={10}
          placeholder='{ "brand": { ... }, "concepts": [ ... ], "recommendation": "..." }'
          style={{ fontFamily: "var(--mono)", fontSize: 12 }}
        />
        {feedback?.kind === "ok" && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "rgba(123, 232, 137, 0.10)",
              borderLeft: "3px solid #7be889",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            <strong>Imported.</strong> {feedback.summary}
            {feedback.warnings.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--muted)" }}>
                {feedback.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {feedback?.kind === "error" && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "rgba(201, 122, 74, 0.12)",
              borderLeft: "3px solid var(--danger, #c97a4a)",
              fontSize: 13,
            }}
          >
            <strong>Import failed.</strong> {feedback.error}
          </div>
        )}
      </Card>
    </div>
  );
}
