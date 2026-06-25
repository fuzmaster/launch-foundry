// Round F · Schedule step. Pick platforms + cadence + start date, then preview
// the generated schedule + download .ics or CSV.

import { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import { loadState, saveState } from "../lib/storage";
import type { CampaignConcept } from "../types";
import {
  PLATFORM_LABEL, BEST_TIMES, generateSchedule, exportIcs, exportCsv, downloadFile,
  type Platform, type Cadence, type PlannedPost,
} from "../lib/scheduleExport";

const PLATFORM_ORDER: Platform[] = ["instagram", "tiktok", "youtube", "linkedin", "x", "facebook", "pinterest"];

const CADENCES: { id: Cadence; label: string; hint: string }[] = [
  { id: "daily",           label: "Daily",            hint: "1 post/day across selected platforms" },
  { id: "every-other-day", label: "Every other day",  hint: "Spread across alternating days" },
  { id: "mwf",             label: "Mon · Wed · Fri",  hint: "3 weekly slots, classic content rhythm" },
  { id: "weekly",          label: "Weekly",           hint: "1 post per week per concept" },
];

function mapConcepts(concepts: CampaignConcept[]): { id: string; title: string; caption: string; link?: string }[] {
  return concepts.map(c => ({
    id: c.id,
    title: c.title || c.angle || "Untitled concept",
    caption: c.caption || c.hook || "",
    link: undefined,
  }));
}

export default function SchedulePage({ concepts: campaignConcepts }: { concepts: CampaignConcept[] }) {
  const concepts = useMemo(() => mapConcepts(campaignConcepts), [campaignConcepts]);
  const [platforms, setPlatforms] = useState<Platform[]>(() => loadState<Platform[]>("launchfoundry.schedule.platforms", ["instagram", "tiktok"]));
  const [cadence, setCadence] = useState<Cadence>(() => loadState<Cadence>("launchfoundry.schedule.cadence", "every-other-day"));
  const [startDateStr, setStartDateStr] = useState<string>(() => {
    const saved = loadState<string>("launchfoundry.schedule.start", "");
    if (saved) return saved;
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  });

  useEffect(() => saveState("launchfoundry.schedule.platforms", platforms), [platforms]);
  useEffect(() => saveState("launchfoundry.schedule.cadence", cadence), [cadence]);
  useEffect(() => saveState("launchfoundry.schedule.start", startDateStr), [startDateStr]);

  const togglePlatform = (p: Platform) => setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const posts: PlannedPost[] = useMemo(() => {
    const startDate = new Date(`${startDateStr}T00:00:00`);
    if (Number.isNaN(startDate.getTime())) return [];
    return generateSchedule({ concepts, platforms, cadence, startDate });
  }, [concepts, platforms, cadence, startDateStr]);

  return (
    <div className="page">
      <h1>Schedule</h1>
      <p className="lede">
        Build a posting calendar from your approved concepts × platforms × cadence. Export
        to .ics for Apple Calendar / Google Calendar / Outlook, or .csv for Buffer / Later / Hootsuite.
      </p>

      <Card title="Platforms" eyebrow={`Step 1 · ${platforms.length} picked`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
          {PLATFORM_ORDER.map(p => {
            const picked = platforms.includes(p);
            const slots = BEST_TIMES[p].map(t => `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`).join(", ");
            return (
              <label key={p} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
                border: `1px solid ${picked ? "var(--accent)" : "var(--line)"}`,
                background: picked ? "var(--accent-glow)" : "transparent", cursor: "pointer",
              }}>
                <input type="checkbox" checked={picked} onChange={() => togglePlatform(p)} style={{ marginTop: 3 }} />
                <span>
                  <strong style={{ display: "block", fontSize: 14 }}>{PLATFORM_LABEL[p]}</strong>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>Best time: {slots}</span>
                </span>
              </label>
            );
          })}
        </div>
      </Card>

      <Card title="Cadence + start" eyebrow="Step 2">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px" }}>
            <strong style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>POSTING CADENCE</strong>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {CADENCES.map(c => {
                const picked = cadence === c.id;
                return (
                  <label key={c.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
                    border: `1px solid ${picked ? "var(--accent)" : "var(--line)"}`,
                    background: picked ? "var(--accent-glow)" : "transparent", cursor: "pointer",
                  }}>
                    <input type="radio" name="cadence" checked={picked} onChange={() => setCadence(c.id)} style={{ marginTop: 3 }} />
                    <span>
                      <strong style={{ display: "block", fontSize: 13 }}>{c.label}</strong>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>{c.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <div style={{ flex: "0 0 220px" }}>
            <strong style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>START DATE</strong>
            <input type="date" value={startDateStr} onChange={e => setStartDateStr(e.target.value)} />
            <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--muted)" }}>
              Times pulled from each platform's best-time medians.
            </p>
          </div>
        </div>
      </Card>

      <Card title="Preview" eyebrow={`Step 3 · ${posts.length} planned post${posts.length === 1 ? "" : "s"}`}>
        {posts.length === 0 ? (
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            No posts yet. Pick at least one platform and one concept.
          </p>
        ) : (
          <div style={{ maxHeight: 360, overflow: "auto", border: "1px solid var(--line)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--panel)" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--muted)", fontWeight: 500 }}>When</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--muted)", fontWeight: 500 }}>Platform</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--muted)", fontWeight: 500 }}>Title</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--muted)", fontWeight: 500 }}>Caption</th>
                </tr>
              </thead>
              <tbody>
                {posts.slice(0, 30).map(p => (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{p.scheduledAt.replace("T", " ").slice(0, 16)}</td>
                    <td style={{ padding: "8px 12px", color: "var(--accent)" }}>{PLATFORM_LABEL[p.platform]}</td>
                    <td style={{ padding: "8px 12px" }}>{p.title}</td>
                    <td style={{ padding: "8px 12px", color: "var(--text-soft)" }}>{p.content.slice(0, 80)}{p.content.length > 80 ? "…" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {posts.length > 30 && (
              <p style={{ margin: "8px 12px", fontSize: 11, color: "var(--muted)" }}>
                +{posts.length - 30} more — full set will be included in the export.
              </p>
            )}
          </div>
        )}
      </Card>

      <Card title="Export" eyebrow="Step 4">
        <div className="button-row">
          <button
            className="primary"
            disabled={posts.length === 0}
            onClick={() => downloadFile("launchfoundry-schedule.ics", exportIcs(posts), "text/calendar")}
          >
            Download .ics ({posts.length} events)
          </button>
          <button
            disabled={posts.length === 0}
            onClick={() => downloadFile("launchfoundry-schedule.csv", exportCsv(posts), "text/csv")}
          >
            Download Buffer/Later CSV
          </button>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
          <strong>.ics</strong> imports into Apple Calendar, Google Calendar (Settings → Import &amp; export), or Outlook (Open &amp; Export → Import).
          <br />
          <strong>CSV</strong> matches Buffer's "Bulk upload" + Later's "CSV import" columns. Open it in a spreadsheet first to tweak captions or links.
        </p>
      </Card>
    </div>
  );
}
