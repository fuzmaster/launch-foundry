import Card from "../components/Card";
import ScorePill from "../components/ScorePill";
import type { CampaignConcept } from "../types";

export default function ConceptsPage({
  concepts,
  selectedId,
  setSelectedId,
}: {
  concepts: CampaignConcept[];
  selectedId: string;
  setSelectedId: (id: string) => void;
}) {
  if (concepts.length === 0) {
    return (
      <div className="page">
        <h1>Campaign Concepts</h1>
        <p className="lede">No concepts yet for this project.</p>
        <Card title="How to populate this" eyebrow="Next step">
          <ol className="plain-list">
            <li>Go to <strong>1 · Project Scan</strong> and click <strong>Copy intake prompt</strong>.</li>
            <li>Paste it into Claude (or any LLM). Wait for the JSON response.</li>
            <li>Click <strong>Paste result →</strong> (or jump to <strong>2 · Campaign Prompt</strong>).</li>
            <li>Paste Claude's JSON into the "Paste mega-prompt result" box and click <strong>Import JSON</strong>.</li>
            <li>Come back here — the 3 concepts will be listed with scores.</li>
          </ol>
          <p style={{ marginTop: 14, fontSize: 13, color: "var(--muted)" }}>
            If you already did the paste-back and still see this empty state: the JSON probably failed validation. Check the Campaign Prompt page for a red "Import failed" message — common causes are missing <code>id</code>, <code>title</code>, <code>platform</code>, or <code>scenes</code> fields on the concept objects.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Campaign Concepts</h1>
      <p className="lede">{concepts.length} scored {concepts[0]!.platform.replace("_", " ")} concept{concepts.length === 1 ? "" : "s"}.</p>
      <div className="concept-list">
        {concepts.map(concept => (
          <Card
            key={concept.id}
            title={concept.title}
            eyebrow={concept.platform.replace("_", " ")}
            action={<ScorePill score={concept.score.total} />}
          >
            <p><strong>Hook:</strong> {concept.hook}</p>
            <p><strong>Angle:</strong> {concept.angle}</p>
            <p><strong>Why:</strong> {concept.score.reason}</p>
            <div className="score-grid">
              <span>Audience {concept.score.audienceFit}</span>
              <span>Platform {concept.score.platformFit}</span>
              <span>Assets {concept.score.assetFit}</span>
              <span>Clarity {concept.score.clarity}</span>
              <span>Effort {concept.score.effort}</span>
            </div>
            <button className={selectedId === concept.id ? "primary" : ""} onClick={() => setSelectedId(concept.id)}>
              {selectedId === concept.id ? "Selected" : "Select concept"}
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
