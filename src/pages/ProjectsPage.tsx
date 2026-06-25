import { useMemo, useRef, useState } from "react";
import Card from "../components/Card";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  createBlankProject,
  createProjectFromScan,
  downloadProjectJson,
  parseImportedProject,
  type Project,
} from "../data/projects";
import type { BrandProfile, CampaignConcept, ProjectAsset } from "../types";

export default function ProjectsPage({
  projects,
  setProjects,
  currentProjectId,
  setProjectId,
  restoreBuiltins,
  builtinIds,
  scanActive,
  scanAssets,
  scanExcerpts,
  scanLabel,
  liveBrand,
  liveConcepts,
}: {
  projects: Project[];
  setProjects: (next: Project[]) => void;
  currentProjectId: string;
  setProjectId: (id: string) => void;
  restoreBuiltins: () => void;
  builtinIds: string[];
  scanActive: boolean;
  scanAssets: ProjectAsset[];
  scanExcerpts: Record<string, string>;
  scanLabel: string;
  liveBrand: BrandProfile;
  liveConcepts: CampaignConcept[];
}) {
  const [newName, setNewName] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [importText, setImportText] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  const active = useMemo(() => projects.filter(p => !p.archived), [projects]);
  const archived = useMemo(() => projects.filter(p => p.archived), [projects]);

  const filter = (list: Project[]) => {
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(p => p.label.toLowerCase().includes(q) || (p.brand.businessName ?? "").toLowerCase().includes(q) || p.id.includes(q));
  };

  const activeFiltered = useMemo(() => filter(active), [active, search]);
  const archivedFiltered = useMemo(() => filter(archived), [archived, search]);

  const missingBuiltinCount = builtinIds.filter(id => !projects.some(p => p.id === id)).length;

  const createBlank = () => {
    if (!newName.trim()) return;
    const project = createBlankProject(newName, projects);
    setProjects([project, ...projects]);
    setNewName("");
    setProjectId(project.id);
  };

  const saveScanAsProject = () => {
    if (!scanActive) return;
    const project = createProjectFromScan({
      label: scanLabel || "Saved Scan",
      existing: projects,
      assets: scanAssets,
      sourceExcerpts: scanExcerpts,
      brand: liveBrand,
      concepts: liveConcepts,
    });
    setProjects([project, ...projects]);
    setProjectId(project.id);
  };

  const duplicate = (p: Project) => {
    const copy = createBlankProject(`${p.label} (copy)`, projects);
    copy.blurb = p.blurb;
    copy.brand = JSON.parse(JSON.stringify(p.brand));
    copy.assets = JSON.parse(JSON.stringify(p.assets));
    copy.concepts = JSON.parse(JSON.stringify(p.concepts));
    copy.defaultConceptId = p.defaultConceptId;
    copy.defaultPrompt = JSON.parse(JSON.stringify(p.defaultPrompt));
    copy.sourceExcerpts = p.sourceExcerpts ? { ...p.sourceExcerpts } : undefined;
    setProjects([copy, ...projects]);
    setProjectId(copy.id);
  };

  const startRename = (p: Project) => {
    setRenameId(p.id);
    setRenameDraft(p.label);
  };
  const commitRename = () => {
    const trimmed = renameDraft.trim();
    if (!renameId || !trimmed) { setRenameId(null); return; }
    setProjects(projects.map(p => p.id === renameId
      ? { ...p, label: trimmed, brand: { ...p.brand, projectName: trimmed, businessName: p.brand.businessName ?? trimmed }, updatedAt: new Date().toISOString() }
      : p));
    setRenameId(null);
  };
  const cancelRename = () => setRenameId(null);

  const archive = (p: Project) => {
    setProjects(projects.map(x => x.id === p.id ? { ...x, archived: true, updatedAt: new Date().toISOString() } : x));
    if (currentProjectId === p.id) {
      const next = projects.find(x => x.id !== p.id && !x.archived);
      if (next) setProjectId(next.id);
    }
  };
  const unarchive = (p: Project) => {
    setProjects(projects.map(x => x.id === p.id ? { ...x, archived: false, updatedAt: new Date().toISOString() } : x));
  };

  const permanentDelete = (p: Project) => {
    const remaining = projects.filter(x => x.id !== p.id);
    setProjects(remaining);
    if (currentProjectId === p.id) {
      const next = remaining.find(x => !x.archived);
      if (next) setProjectId(next.id);
    }
    setDeleteTarget(null);
  };

  const importFromText = () => {
    setImportErr(null);
    const res = parseImportedProject(importText, projects);
    if (!res.ok) { setImportErr(res.error); return; }
    setProjects([res.project, ...projects]);
    setProjectId(res.project.id);
    setImportText("");
  };

  const importFromFile = async (file: File | null) => {
    if (!file) return;
    setImportErr(null);
    const text = await file.text();
    const res = parseImportedProject(text, projects);
    if (!res.ok) { setImportErr(res.error); return; }
    setProjects([res.project, ...projects]);
    setProjectId(res.project.id);
  };

  const switchTo = (p: Project) => {
    setProjectId(p.id);
    setProjects(projects.map(x => x.id === p.id ? { ...x, updatedAt: new Date().toISOString() } : x));
  };

  return (
    <div className="page">
      <h1>Projects</h1>
      <p className="lede">
        Every project is editable — rename, duplicate, archive, export, or delete. Built-in examples sit alongside your own. {projects.length} total · {active.length} active · {archived.length} archived.
      </p>

      <Card title="New" eyebrow="Create / import / save scan">
        <div className="projects-toolbar">
          <div className="projects-toolbar__row">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="New project name"
              onKeyDown={e => e.key === "Enter" && createBlank()}
            />
            <button onClick={createBlank} disabled={!newName.trim()}>Create blank</button>
            <button onClick={() => importFileRef.current?.click()}>Import .json file…</button>
            <input ref={importFileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={e => importFromFile(e.target.files?.[0] ?? null)} />
            {scanActive && (
              <button className="primary" onClick={saveScanAsProject}>
                Save scan ({scanLabel || "untitled"}) as project
              </button>
            )}
            {missingBuiltinCount > 0 && (
              <button onClick={restoreBuiltins}>Restore {missingBuiltinCount} built-in example{missingBuiltinCount === 1 ? "" : "s"}</button>
            )}
          </div>
          <details>
            <summary>…or paste a project JSON</summary>
            <textarea
              rows={6}
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder='{ "label": "…", "brand": {…}, "assets": [], "concepts": [] }'
              style={{ marginTop: 8, fontFamily: "var(--mono)", fontSize: 12 }}
            />
            <div className="button-row" style={{ marginTop: 8 }}>
              <button onClick={importFromText} disabled={!importText.trim()}>Import from paste</button>
            </div>
            {importErr && <div className="alert alert--err">{importErr}</div>}
          </details>
        </div>
      </Card>

      {projects.length > 5 && (
        <Card eyebrow="Filter" title="Search">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search project name, business, or id…"
          />
        </Card>
      )}

      <Card title={`Active (${activeFiltered.length})`} eyebrow="Working set">
        {activeFiltered.length === 0 ? (
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
            {active.length === 0 ? "No active projects. Create one above or restore the built-in examples." : "No matches."}
          </p>
        ) : (
          <div className="projects-list">
            {activeFiltered.map(p => (
              <ProjectRow
                key={p.id}
                p={p}
                isCurrent={p.id === currentProjectId}
                isRenaming={renameId === p.id}
                renameDraft={renameDraft}
                onRenameDraft={setRenameDraft}
                onStartRename={() => startRename(p)}
                onCommitRename={commitRename}
                onCancelRename={cancelRename}
                onSwitch={() => switchTo(p)}
                onDuplicate={() => duplicate(p)}
                onExport={() => downloadProjectJson(p)}
                onArchive={() => archive(p)}
              />
            ))}
          </div>
        )}
      </Card>

      {archived.length > 0 && (
        <Card title={`Archived (${archivedFiltered.length})`} eyebrow="Hidden from sidebar">
          <div className="projects-list">
            {archivedFiltered.map(p => (
              <ProjectRow
                key={p.id}
                p={p}
                isCurrent={p.id === currentProjectId}
                isArchived
                onSwitch={() => switchTo(p)}
                onDuplicate={() => duplicate(p)}
                onExport={() => downloadProjectJson(p)}
                onUnarchive={() => unarchive(p)}
                onPermanentDelete={() => setDeleteTarget(p)}
              />
            ))}
          </div>
        </Card>
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete project forever?"
          message={`This will permanently delete "${deleteTarget.label}". This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => permanentDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function ProjectRow({
  p,
  isCurrent,
  isArchived,
  isRenaming,
  renameDraft,
  onRenameDraft,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onSwitch,
  onDuplicate,
  onExport,
  onArchive,
  onUnarchive,
  onPermanentDelete,
}: {
  p: Project;
  isCurrent: boolean;
  isArchived?: boolean;
  isRenaming?: boolean;
  renameDraft?: string;
  onRenameDraft?: (v: string) => void;
  onStartRename?: () => void;
  onCommitRename?: () => void;
  onCancelRename?: () => void;
  onSwitch: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onPermanentDelete?: () => void;
}) {
  return (
    <div className={`project-row${isCurrent ? " project-row--current" : ""}${isArchived ? " project-row--archived" : ""}`}>
      <div className="project-row__head">
        <div className="project-row__id">
          {isRenaming ? (
            <input
              autoFocus
              value={renameDraft}
              onChange={e => onRenameDraft?.(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") onCommitRename?.();
                if (e.key === "Escape") onCancelRename?.();
              }}
              onBlur={onCommitRename}
              style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}
            />
          ) : (
            <>
              <strong>{p.label}</strong>
              {isCurrent && <span className="badge badge--accent">Active</span>}
              {isArchived && <span className="badge badge--muted">Archived</span>}
            </>
          )}
        </div>
        <div className="project-row__actions">
          {!isArchived && (
            <button onClick={onSwitch} disabled={isCurrent} className={isCurrent ? "" : "primary"}>
              {isCurrent ? "Active" : "Open"}
            </button>
          )}
          {isArchived && <button className="primary" onClick={onSwitch}>Open</button>}
          {!isRenaming && onStartRename && <button onClick={onStartRename}>Rename</button>}
          <button onClick={onDuplicate}>Duplicate</button>
          <button onClick={onExport}>Export</button>
          {!isArchived && onArchive && <button onClick={onArchive}>Archive</button>}
          {isArchived && onUnarchive && <button onClick={onUnarchive}>Unarchive</button>}
          {isArchived && onPermanentDelete && (
            <button className="danger" onClick={onPermanentDelete}>Delete</button>
          )}
        </div>
      </div>
      <p className="project-row__blurb">{p.blurb}</p>
      <div className="project-row__meta">
        <span>{p.assets.length} assets</span>
        <span>{p.concepts.length} concepts</span>
        {p.sourceExcerpts && Object.keys(p.sourceExcerpts).length > 0 && (
          <span>{Object.keys(p.sourceExcerpts).length} source excerpts</span>
        )}
        {p.createdAt && <span>created {new Date(p.createdAt).toLocaleDateString()}</span>}
        {p.updatedAt && p.updatedAt !== p.createdAt && <span>updated {new Date(p.updatedAt).toLocaleDateString()}</span>}
      </div>
    </div>
  );
}
