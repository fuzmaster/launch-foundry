import { useState } from "react";
import Card from "../components/Card";
import type { CampaignConcept, ProjectAsset, Scene } from "../types";

const MOTION_OPTIONS = ["slow_push", "pan_left", "pan_right", "fade", "slide_up", "split_reveal", "none", "Slow push.", "Pan right.", "Pan left.", "Ken Burns 'in'.", "Ken Burns 'out'.", "Brass wipe.", "Word splash."];

export default function StoryboardPage({
  concept,
  concepts,
  updateConcepts,
  assets,
}: {
  concept: CampaignConcept;
  concepts: CampaignConcept[];
  updateConcepts: (next: CampaignConcept[]) => void;
  assets: ProjectAsset[];
}) {
  const [editing, setEditing] = useState(false);

  const writeConcept = (patch: Partial<CampaignConcept>) => {
    updateConcepts(concepts.map(c => c.id === concept.id ? { ...c, ...patch } : c));
  };
  const writeScene = (sceneId: string, patch: Partial<Scene>) => {
    writeConcept({ scenes: concept.scenes.map(s => s.id === sceneId ? { ...s, ...patch } : s) });
  };
  const moveScene = (sceneId: string, dir: -1 | 1) => {
    const idx = concept.scenes.findIndex(s => s.id === sceneId);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= concept.scenes.length) return;
    const next = [...concept.scenes];
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    writeConcept({ scenes: next });
  };
  const deleteScene = (sceneId: string) => {
    if (!confirm("Delete this scene?")) return;
    writeConcept({ scenes: concept.scenes.filter(s => s.id !== sceneId) });
  };
  const addScene = () => {
    const last = concept.scenes[concept.scenes.length - 1];
    const startSecond = last?.endSecond ?? 0;
    const newScene: Scene = {
      id: `s${Date.now().toString(36)}`,
      startSecond,
      endSecond: startSecond + 3,
      visual: "(new scene)",
      assetIds: [],
      textOverlay: "",
      motionNotes: "Slow push.",
    };
    writeConcept({ scenes: [...concept.scenes, newScene] });
  };

  return (
    <div className="page">
      <h1>Storyboard</h1>
      <p className="lede">
        {editing ? "Edit any field. Changes save to the project as you type." : `${concept.title} · ${concept.durationSeconds} seconds`}
      </p>

      <div className="button-row" style={{ marginBottom: 18 }}>
        <button className={editing ? "primary" : ""} onClick={() => setEditing(v => !v)}>
          {editing ? "Done editing" : "Edit concept"}
        </button>
        {editing && <button onClick={addScene}>+ Add scene</button>}
      </div>

      <Card title="Concept" eyebrow="Overview">
        {editing ? (
          <>
            <label>Title<input value={concept.title} onChange={e => writeConcept({ title: e.target.value })} /></label>
            <div className="grid two">
              <label>Hook<input value={concept.hook} onChange={e => writeConcept({ hook: e.target.value })} /></label>
              <label>Duration (s)<input type="number" value={concept.durationSeconds} onChange={e => writeConcept({ durationSeconds: Number(e.target.value) || 0 })} /></label>
            </div>
            <label>Promise<textarea rows={2} value={concept.promise} onChange={e => writeConcept({ promise: e.target.value })} /></label>
            <label>Format<input value={concept.format} onChange={e => writeConcept({ format: e.target.value })} /></label>
            <label>Caption<textarea rows={3} value={concept.caption} onChange={e => writeConcept({ caption: e.target.value })} /></label>
            <label>CTA<input value={concept.cta} onChange={e => writeConcept({ cta: e.target.value })} /></label>
          </>
        ) : (
          <div className="concept-overview">
            <p><strong>Hook:</strong> {concept.hook}</p>
            <p><strong>Promise:</strong> {concept.promise}</p>
            <p><strong>Format:</strong> {concept.format}</p>
            <p><strong>Caption:</strong> {concept.caption}</p>
            <p><strong>CTA:</strong> {concept.cta}</p>
          </div>
        )}
      </Card>

      <div className="timeline">
        {concept.scenes.map((scene, i) => (
          <Card
            key={scene.id}
            title={`${scene.startSecond}–${scene.endSecond}s`}
            eyebrow={scene.id}
            action={editing && (
              <div className="button-row">
                <button onClick={() => moveScene(scene.id, -1)} disabled={i === 0}>↑</button>
                <button onClick={() => moveScene(scene.id, 1)} disabled={i === concept.scenes.length - 1}>↓</button>
                <button className="danger" onClick={() => deleteScene(scene.id)}>Delete</button>
              </div>
            )}
          >
            {editing ? (
              <>
                <div className="grid two">
                  <label>Start (s)<input type="number" step="0.5" value={scene.startSecond} onChange={e => writeScene(scene.id, { startSecond: Number(e.target.value) || 0 })} /></label>
                  <label>End (s)<input type="number" step="0.5" value={scene.endSecond} onChange={e => writeScene(scene.id, { endSecond: Number(e.target.value) || 0 })} /></label>
                </div>
                <label>Visual<textarea rows={2} value={scene.visual} onChange={e => writeScene(scene.id, { visual: e.target.value })} /></label>
                <label>Text overlay<input value={scene.textOverlay} onChange={e => writeScene(scene.id, { textOverlay: e.target.value })} /></label>
                <label>Voiceover (optional)<input value={scene.voiceover ?? ""} onChange={e => writeScene(scene.id, { voiceover: e.target.value || undefined })} /></label>
                <label>Motion
                  <input list="motion-options" value={scene.motionNotes ?? ""} onChange={e => writeScene(scene.id, { motionNotes: e.target.value })} />
                  <datalist id="motion-options">
                    {MOTION_OPTIONS.map(m => <option key={m} value={m} />)}
                  </datalist>
                </label>
                <label>Assets (comma-separated IDs)
                  <input
                    value={scene.assetIds.join(", ")}
                    onChange={e => writeScene(scene.id, { assetIds: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                  />
                </label>
                {assets.length > 0 && (
                  <details>
                    <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--accent)" }}>Pick from {assets.length} assets</summary>
                    <div className="scene-asset-picker">
                      {assets.map(a => {
                        const checked = scene.assetIds.includes(a.id);
                        return (
                          <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 12 }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e => {
                                const next = e.target.checked
                                  ? [...scene.assetIds, a.id]
                                  : scene.assetIds.filter(id => id !== a.id);
                                writeScene(scene.id, { assetIds: next });
                              }}
                              style={{ width: "auto" }}
                            />
                            <span>{a.filename}{a.role ? ` · ${a.role}` : ""}</span>
                          </label>
                        );
                      })}
                    </div>
                  </details>
                )}
              </>
            ) : (
              <>
                <p><strong>Visual:</strong> {scene.visual}</p>
                <p><strong>Text:</strong> {scene.textOverlay}</p>
                {scene.voiceover && <p><strong>Voiceover:</strong> {scene.voiceover}</p>}
                <p><strong>Motion:</strong> {scene.motionNotes}</p>
                <p><strong>Assets:</strong> {scene.assetIds.join(", ") || "—"}</p>
              </>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
