import type { ReactNode } from "react";
import type { Project } from "../data/projects";

type PageKey = "projects" | "studio" | "prompt" | "scan" | "brand" | "strategy" | "concepts" | "storyboard" | "renderspec" | "publishing" | "qa" | "prompts";

const nav: { key: PageKey; label: string }[] = [
  { key: "projects", label: "Projects" },
  { key: "studio", label: "⚡ Reels Studio" },
  { key: "scan", label: "1 · Project Scan" },
  { key: "prompt", label: "2 · Campaign Prompt" },
  { key: "brand", label: "3 · Brand Profile" },
  { key: "strategy", label: "4 · Audience Strategy" },
  { key: "concepts", label: "5 · Campaign Concepts" },
  { key: "storyboard", label: "6 · Storyboard" },
  { key: "renderspec", label: "7 · Render Spec" },
  { key: "publishing", label: "8 · Publishing Pack" },
  { key: "qa", label: "9 · QA Check" },
  { key: "prompts", label: "Prompt Pack" },
];

export default function AppShell({
  page,
  setPage,
  project,
  projects,
  setProjectId,
  scanActive,
  scanLabel,
  children,
}: {
  page: PageKey;
  setPage: (page: PageKey) => void;
  project: Project;
  projects: ReadonlyArray<Project>;
  setProjectId: (id: string) => void;
  scanActive: boolean;
  scanLabel: string;
  children: ReactNode;
}) {
  // Recent projects (excluding the current one), sorted by updatedAt desc.
  const recents = projects
    .filter(p => p.id !== project.id && !p.archived)
    .slice()
    .sort((a, b) => (b.updatedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.createdAt ?? ""))
    .slice(0, 3);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="logo">LF</div>
          <div>
            <strong>LaunchFoundry</strong>
            <span>Lite campaign dashboard</span>
          </div>
        </div>

        {/* Active project card — replaces the old dropdown. Click → Projects page. */}
        {scanActive ? (
          <div className="project-card project-card--scan">
            <span className="eyebrow" style={{ color: "var(--accent)" }}>Scan mode</span>
            <strong>{scanLabel}</strong>
            <p>Working from your folder scan. Brand + concepts are inferred from the source files, not the registered project below.</p>
          </div>
        ) : (
          <div className="project-card">
            <span className="eyebrow">Active project</span>
            <strong>{project.brand.businessName ?? project.label}</strong>
            <p>{project.blurb}</p>
          </div>
        )}

        <div className="project-actions">
          <button className="primary" onClick={() => setPage("projects")}>
            Open Projects
          </button>
          <span className="project-actions__hint">
            Save, duplicate, archive, switch
          </span>
        </div>

        {recents.length > 0 && (
          <div className="recents">
            <span className="eyebrow">Recent</span>
            {recents.map(p => (
              <button
                key={p.id}
                className="recent-row"
                onClick={() => setProjectId(p.id)}
                title={p.blurb}
              >
                <span className="recent-row__label">{p.label}</span>
                <span className="recent-row__hint">
                  {p.concepts.length} concept{p.concepts.length === 1 ? "" : "s"} · {p.assets.length} assets
                </span>
              </button>
            ))}
          </div>
        )}

        <nav>
          {nav.map(item => (
            <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => setPage(item.key)}>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
