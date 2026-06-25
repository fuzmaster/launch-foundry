import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import WizardShell, { type AnyPageKey, type WizardStepKey } from "./components/WizardShell";
import WelcomeScreen from "./components/WelcomeScreen";
import { usePreferences } from "./lib/preferences";
import { createRenderSpecFromConcept } from "./lib/renderSpec";
import { renderPublishingPack } from "./lib/templateUtils";
import { runQA } from "./lib/qa";
import { loadState, saveState } from "./lib/storage";
import {
  BUILTIN_EXAMPLES,
  DEFAULT_PROJECT_ID,
  getProject,
  loadDynamicProjects,
  saveDynamicProjects,
  seedBuiltinsIntoRegistry,
  hasSeededOnce,
  markSeeded,
  createProjectFromScan,
} from "./data/projects";
import type { Project } from "./data/projects";
import { humanizeFolderName } from "./lib/scanContext";
import type { BrandProfile, CampaignConcept, CampaignPrompt, ProjectAsset } from "./types";

const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));
const StudioPage = lazy(() => import("./pages/StudioPage"));
const CampaignPromptPage = lazy(() => import("./pages/CampaignPromptPage"));
const ProjectScanPage = lazy(() => import("./pages/ProjectScanPage"));
const BrandProfilePage = lazy(() => import("./pages/BrandProfilePage"));
const StrategyPage = lazy(() => import("./pages/StrategyPage"));
const ConceptsPage = lazy(() => import("./pages/ConceptsPage"));
const StoryboardPage = lazy(() => import("./pages/StoryboardPage"));
const RenderSpecPage = lazy(() => import("./pages/RenderSpecPage"));
const PublishingPackPage = lazy(() => import("./pages/PublishingPackPage"));
const QAPage = lazy(() => import("./pages/QAPage"));
const PromptPackPage = lazy(() => import("./pages/PromptPackPage"));
const MusicPage = lazy(() => import("./pages/MusicPage"));
const SchedulePage = lazy(() => import("./pages/SchedulePage"));
const PlatformsPage = lazy(() => import("./pages/PlatformsPage"));

const SCAN_KEY = {
  assets: "launchfoundry.scan.assets",
  excerpts: "launchfoundry.scan.excerpts",
  rootPath: "launchfoundry.scan.rootPath",
  detectedRoot: "launchfoundry.scan.detectedRoot",
  previews: "launchfoundry.scan.previewDataUrls",
};

const pageFallback = (
  <div className="page">
    <p className="lede">Loading...</p>
  </div>
);

/**
 * One-time migration from the older per-project storage keys
 * (launchfoundry.<projectId>.{brand,prompt,selectedConcept,importedConcepts}).
 * Anything found is merged onto the matching project, then the old keys are removed.
 */
const MIGRATION_KEY = "launchfoundry.storage.unified.v1";
function migrateLegacyKeys(projects: Project[]): { changed: boolean; next: Project[] } {
  if (loadState<boolean>(MIGRATION_KEY, false)) return { changed: false, next: projects };
  let changed = false;
  const next = projects.map(p => {
    let copy = p;
    const oldBrand = loadState<BrandProfile | null>(`launchfoundry.${p.id}.brand`, null);
    const oldPrompt = loadState<CampaignPrompt | null>(`launchfoundry.${p.id}.prompt`, null);
    const oldSelected = loadState<string | null>(`launchfoundry.${p.id}.selectedConcept`, null);
    const oldImported = loadState<CampaignConcept[] | null>(`launchfoundry.${p.id}.importedConcepts`, null);
    if (oldBrand) copy = { ...copy, brand: oldBrand };
    if (oldPrompt) copy = { ...copy, defaultPrompt: oldPrompt };
    if (oldImported && oldImported.length > 0) copy = { ...copy, concepts: oldImported };
    if (oldSelected) copy = { ...copy, defaultConceptId: oldSelected };
    if (copy !== p) changed = true;
    // Always remove the legacy keys
    for (const suffix of ["brand", "prompt", "selectedConcept", "importedConcepts", "scannedAssets", "sourceExcerpts", "scanRootPath", "scanDetectedRoot"]) {
      localStorage.removeItem(`launchfoundry.${p.id}.${suffix}`);
    }
    return copy;
  });
  saveState(MIGRATION_KEY, true);
  return { changed, next };
}

export default function App() {
  // Round E — wizard keying. Old PageKey "scan/prompt/studio" mapped onto
  // new wizard step keys "project/research/build" automatically here.
  const migrateLegacyPageKey = (legacy: string): AnyPageKey => {
    const map: Record<string, AnyPageKey> = {
      scan: "project", prompt: "research", studio: "build",
    };
    return (map[legacy] ?? legacy) as AnyPageKey;
  };
  const [page, setPage] = useState<AnyPageKey>(() => {
    const stored = loadState<string>("launchfoundry.lastPage", "project");
    return migrateLegacyPageKey(stored);
  });
  useEffect(() => saveState("launchfoundry.lastPage", page), [page]);
  const [projectId, setProjectId] = useState<string>(() => loadState("launchfoundry.currentProject", DEFAULT_PROJECT_ID));
  const [projects, setProjectsState] = useState<Project[]>(() => {
    let stored = loadDynamicProjects();
    if (!hasSeededOnce()) {
      const { next } = seedBuiltinsIntoRegistry(stored, BUILTIN_EXAMPLES);
      stored = next;
      saveDynamicProjects(stored);
      markSeeded();
    }
    const { changed, next } = migrateLegacyKeys(stored);
    if (changed) {
      saveDynamicProjects(next);
      return next;
    }
    return stored;
  });
  const setProjects = (next: Project[] | ((prev: Project[]) => Project[])) => {
    setProjectsState(prev => {
      const value = typeof next === "function" ? (next as (prev: Project[]) => Project[])(prev) : next;
      saveDynamicProjects(value);
      return value;
    });
  };
  const restoreBuiltins = () => {
    const { next, added } = seedBuiltinsIntoRegistry(projects, BUILTIN_EXAMPLES);
    if (added > 0) setProjects(next);
  };
  const activeProjects = useMemo(() => projects.filter(p => !p.archived), [projects]);
  const project = getProject(projectId, projects);

  // Scan state — single global slot, not per-project. Cleared when "Save scan as project" runs.
  const [scannedAssets, setScannedAssetsState] = useState<ProjectAsset[] | null>(() => loadState<ProjectAsset[] | null>(SCAN_KEY.assets, null));
  const [sourceExcerpts, setSourceExcerptsState] = useState<Record<string, string>>(() => loadState<Record<string, string>>(SCAN_KEY.excerpts, {}));
  const [scanRootPath, setScanRootPathState] = useState<string>(() => loadState(SCAN_KEY.rootPath, ""));
  const [detectedRoot, setDetectedRootState] = useState<string>(() => loadState(SCAN_KEY.detectedRoot, ""));
  const [previewDataUrls, setPreviewDataUrlsState] = useState<Record<string, string>>(() => loadState<Record<string, string>>(SCAN_KEY.previews, {}));
  const [, setStorageTick] = useState(0);
  // Preview blob URLs — kept at App level so they survive ProjectScanPage unmount/remount
  // when the user navigates away and back. They still vanish on reload (blob URLs are tied to the document).
  const [previewUrls, setPreviewUrlsState] = useState<Record<string, string>>({});
  const setPreviewUrls = (next: Record<string, string>) => {
    // Revoke any URLs being replaced or dropped.
    for (const [id, url] of Object.entries(previewUrls)) {
      if (next[id] !== url) URL.revokeObjectURL(url);
    }
    setPreviewUrlsState(next);
  };
  const setScannedAssets = (next: ProjectAsset[] | null) => { setScannedAssetsState(next); saveState(SCAN_KEY.assets, next); };
  const setSourceExcerpts = (next: Record<string, string>) => { setSourceExcerptsState(next); saveState(SCAN_KEY.excerpts, next); };
  const setScanRootPath = (next: string) => { setScanRootPathState(next); saveState(SCAN_KEY.rootPath, next); };
  const setDetectedRoot = (next: string) => { setDetectedRootState(next); saveState(SCAN_KEY.detectedRoot, next); };
  const setPreviewDataUrls = (next: Record<string, string>) => { setPreviewDataUrlsState(next); saveState(SCAN_KEY.previews, next); };

  useEffect(() => saveState("launchfoundry.currentProject", projectId), [projectId]);
  useEffect(() => {
    const onStorageChange = () => setStorageTick(t => t + 1);
    window.addEventListener("lf-storage-changed", onStorageChange);
    window.addEventListener("storage", onStorageChange);
    return () => {
      window.removeEventListener("lf-storage-changed", onStorageChange);
      window.removeEventListener("storage", onStorageChange);
    };
  }, []);

  /** Apply a partial update to the currently-active project. Bumps updatedAt.
   *  Uses the functional setProjects form so back-to-back calls compose
   *  (otherwise each call would see the same stale `projects` closure).
   */
  const updateCurrentProject = (partial: Partial<Project>) => {
    setProjects(prev => prev.map(p => p.id === projectId
      ? { ...p, ...partial, updatedAt: new Date().toISOString() }
      : p));
  };

  // Project-derived state — single source of truth, no parallel cache.
  const brand = project.brand;
  const prompt = project.defaultPrompt;
  const selectedId = project.defaultConceptId;
  const liveAssets = scannedAssets ?? project.assets;
  const liveConcepts = project.concepts;

  const setBrand = (next: BrandProfile) => updateCurrentProject({ brand: next });
  const setPrompt = (next: CampaignPrompt) => updateCurrentProject({ defaultPrompt: next });
  const setSelectedId = (id: string) => updateCurrentProject({ defaultConceptId: id });
  // Paste-back replaces the active project's concepts wholesale.
  const setImportedConcepts = (next: CampaignConcept[] | null) => {
    if (!next) return; // "Clear imported" is a no-op now — concepts live on the project.
    updateCurrentProject({ concepts: next, defaultConceptId: next[0]?.id ?? "" });
  };

  // Asset-list mutations also go through the project.
  const updateProjectAssets = (next: ProjectAsset[]) => updateCurrentProject({ assets: next });
  const updateConcepts = (next: CampaignConcept[]) => updateCurrentProject({ concepts: next });

  const selectedConcept = liveConcepts.find(c => c.id === selectedId) ?? liveConcepts[0];
  const hasConcepts = liveConcepts.length > 0 && !!selectedConcept;
  const renderSpec = useMemo(
    () => (hasConcepts ? createRenderSpecFromConcept(selectedConcept!, brand, liveAssets) : null),
    [hasConcepts, selectedConcept, brand, liveAssets]
  );
  const publishingPack = useMemo(
    () => (hasConcepts ? renderPublishingPack(selectedConcept!, brand) : null),
    [hasConcepts, selectedConcept, brand]
  );
  const qaReport = useMemo(
    () => (hasConcepts && renderSpec ? runQA(selectedConcept!, renderSpec, brand, liveAssets) : null),
    [hasConcepts, selectedConcept, renderSpec, brand, liveAssets]
  );

  const promptCtx = useMemo(
    () => ({
      brand,
      prompt,
      assets: liveAssets,
      concept: selectedConcept ?? {
        id: "concept-pending",
        title: "(none yet — run the intake prompt to generate concepts)",
        platform: prompt.platform,
        targetAudience: "",
        angle: "",
        hook: "",
        promise: "",
        format: "",
        durationSeconds: 0,
        scenes: [],
        recommendedAssets: [],
        missingAssets: [],
        caption: "",
        cta: "",
        score: { audienceFit: 0, platformFit: 0, assetFit: 0, clarity: 0, effort: 0, total: 0, reason: "" },
      },
      platform: prompt.platform,
    }),
    [brand, prompt, liveAssets, selectedConcept]
  );

  const emptyState = (
    <div className="page">
      <h1>No concepts yet</h1>
      <p className="lede">
        This project doesn't have any campaign concepts yet. Run the intake prompt from Project Scan, paste Claude's result on the Campaign Prompt page, and concepts will populate.
      </p>
    </div>
  );

  const [prefs] = usePreferences();

  // H-4 — Welcome screen before the wizard for first-time users. The
  // "See an example" button seeds Britten as the active project + jumps
  // straight to Concepts so the user sees a working campaign immediately.
  if (!prefs.hasStarted) {
    return (
      <WelcomeScreen
        onStart={() => setPage("project")}
        onLoadExample={() => {
          // Switch to the seeded Britten Woodworking demo project and land on Concepts.
          const britten = projects.find(p => p.id === "britten-woodworking");
          if (britten) setProjectId(britten.id);
          setPage("concepts");
        }}
      />
    );
  }

  // Wizard step completion — informs the stepper ✓ marks + Next button hint.
  const stepCompletion: Record<WizardStepKey, boolean> = {
    project:   !!scannedAssets || (project.assets.length > 0),
    research:  hasConcepts,
    concepts:  hasConcepts && !!selectedId,
    build:     hasConcepts,                          // user can render at any time once concepts exist
    music:     !!loadState("launchfoundry.music.dropped", null),
    schedule:  loadState<string[]>("launchfoundry.schedule.platforms", []).length > 0 && !!loadState<string>("launchfoundry.schedule.start", ""),
    platforms: loadState<string[]>("launchfoundry.platforms.composerPlatforms", []).length > 0 || !!loadState("launchfoundry.platforms.recResult", null),
  };

  return (
    <WizardShell
      page={page}
      setPage={setPage}
      project={project}
      scanActive={!!scannedAssets}
      scanLabel={humanizeFolderName(detectedRoot)}
      stepCompletion={stepCompletion}
    >
      <Suspense fallback={pageFallback}>
      {page === "research" && (
        <CampaignPromptPage
          prompt={prompt}
          setPrompt={setPrompt}
          setBrand={setBrand}
          setImportedConcepts={setImportedConcepts}
          setSelectedConceptId={setSelectedId}
        />
      )}
      {page === "project" && (
        <ProjectScanPage
          assets={project.assets}
          scannedAssets={scannedAssets}
          setScannedAssets={setScannedAssets}
          updateProjectAssets={updateProjectAssets}
          rootPath={scanRootPath}
          setRootPath={setScanRootPath}
          detectedRoot={detectedRoot}
          setDetectedRoot={setDetectedRoot}
          sourceExcerpts={sourceExcerpts}
          setSourceExcerpts={setSourceExcerpts}
          previewUrls={previewUrls}
          setPreviewUrls={setPreviewUrls}
          previewDataUrls={previewDataUrls}
          setPreviewDataUrls={setPreviewDataUrls}
          setBrand={setBrand}
          setPrompt={setPrompt}
          setImportedConcepts={setImportedConcepts}
          setSelectedConceptId={setSelectedId}
          promptCtx={promptCtx}
          goToCampaignPrompt={() => setPage("research")}
          goToProjects={() => setPage("projects")}
          saveScanAsProject={() => {
            if (!scannedAssets) return;
            const newProj = createProjectFromScan({
              label: humanizeFolderName(detectedRoot) || "Saved Scan",
              existing: projects,
              assets: scannedAssets,
              sourceExcerpts,
              brand: undefined,
              concepts: [],
              platform: prompt.platform,
            });
            setProjects([newProj, ...projects]);
            setProjectId(newProj.id);
            setScannedAssets(null);
            setSourceExcerpts({});
            setDetectedRoot("");
            setPreviewDataUrls({});
          }}
        />
      )}
      {page === "brand" && <BrandProfilePage brand={brand} setBrand={setBrand} />}
      {page === "strategy" && <StrategyPage />}
      {page === "concepts" && <ConceptsPage concepts={liveConcepts} selectedId={selectedId} setSelectedId={setSelectedId} />}
      {page === "storyboard" && (hasConcepts
        ? <StoryboardPage concept={selectedConcept!} concepts={liveConcepts} updateConcepts={updateConcepts} assets={liveAssets} />
        : emptyState)}
      {page === "renderspec" && (hasConcepts && renderSpec ? <RenderSpecPage renderSpec={renderSpec} concept={selectedConcept!} brand={brand} assets={liveAssets} /> : emptyState)}
      {page === "publishing" && (hasConcepts && publishingPack ? <PublishingPackPage pack={publishingPack} /> : emptyState)}
      {page === "qa" && (hasConcepts && qaReport ? <QAPage report={qaReport} /> : emptyState)}
      {page === "prompts" && <PromptPackPage ctx={promptCtx} />}
      {page === "build" && <StudioPage />}
      {page === "music" && <MusicPage />}
      {page === "schedule" && <SchedulePage />}
      {page === "platforms" && <PlatformsPage />}
      {page === "projects" && (
        <ProjectsPage
          projects={projects}
          setProjects={setProjects}
          currentProjectId={projectId}
          setProjectId={setProjectId}
          restoreBuiltins={restoreBuiltins}
          builtinIds={BUILTIN_EXAMPLES.map(p => p.id)}
          scanActive={!!scannedAssets}
          scanAssets={scannedAssets ?? []}
          scanExcerpts={sourceExcerpts}
          scanLabel={humanizeFolderName(detectedRoot)}
          liveBrand={brand}
          liveConcepts={liveConcepts}
        />
      )}
      </Suspense>
    </WizardShell>
  );
}
