// Round E — full-page wizard chrome. Replaces the AppShell sidebar with a
// horizontal top stepper, an active-project lockup, and a gear menu that
// hides secondary tools (brand, render spec, storyboard, etc.) behind a
// dropdown so they don't dilute the wizard feel.
//
// Step content fills the page. A bottom bar holds Back / Next.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Project } from "../data/projects";
import { usePreferences } from "../lib/preferences";
import AskForHelp from "./AskForHelp";
import { speak, stopSpeaking, ttsAvailable } from "../lib/voice";

export type WizardStepKey = "project" | "research" | "concepts" | "build" | "music" | "schedule" | "platforms";
export type SecondaryPageKey = "projects" | "brand" | "strategy" | "storyboard" | "renderspec" | "publishing" | "qa" | "prompts";
export type AnyPageKey = WizardStepKey | SecondaryPageKey;

export const WIZARD_STEPS: { key: WizardStepKey; num: number; label: string; plainLabel: string; tagline: string }[] = [
  { key: "project",   num: 1, label: "Project",   plainLabel: "What are we promoting?", tagline: "Drop your project folder, paste a website URL, or upload a code-review file" },
  { key: "research",  num: 2, label: "Research",  plainLabel: "Tell me about it",       tagline: "Send a prompt to ChatGPT or Claude, paste the answer back here" },
  { key: "concepts",  num: 3, label: "Concepts",  plainLabel: "Pick the videos",         tagline: "Choose which video ads to actually make" },
  { key: "build",     num: 4, label: "Build",     plainLabel: "Make the videos",         tagline: "Live preview + render to MP4" },
  { key: "music",     num: 5, label: "Music",     plainLabel: "Add music",               tagline: "Find a soundtrack — optional" },
  { key: "schedule",  num: 6, label: "Schedule",  plainLabel: "When to post",            tagline: "Calendar export for posting" },
  { key: "platforms", num: 7, label: "Platforms", plainLabel: "Where to post",           tagline: "Per-platform posts + setup briefs" },
];

const SECONDARY_PAGES: { key: SecondaryPageKey; label: string; group: "Project" | "Campaign" | "Reference" }[] = [
  { key: "projects",   label: "Switch project",   group: "Project" },
  { key: "brand",      label: "Brand profile",    group: "Campaign" },
  { key: "strategy",   label: "Audience strategy", group: "Campaign" },
  { key: "storyboard", label: "Storyboard",       group: "Campaign" },
  { key: "renderspec", label: "Render spec (advanced)", group: "Campaign" },
  { key: "publishing", label: "Publishing pack",  group: "Campaign" },
  { key: "qa",         label: "QA check",         group: "Campaign" },
  { key: "prompts",    label: "Prompt pack",      group: "Reference" },
];

export default function WizardShell({
  page,
  setPage,
  project,
  scanActive,
  scanLabel,
  stepCompletion,
  children,
}: {
  page: AnyPageKey;
  setPage: (page: AnyPageKey) => void;
  project: Project;
  scanActive: boolean;
  scanLabel: string;
  /** Map from step key → done? Used to enable Next + show ✓ on the stepper. */
  stepCompletion: Record<WizardStepKey, boolean>;
  children: ReactNode;
}) {
  const [prefs, setPrefs] = usePreferences();
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  // Apply bigText to the document root so every page benefits without
  // each component opting in.
  useEffect(() => {
    document.documentElement.classList.toggle("lf-big-text", prefs.bigText);
  }, [prefs.bigText]);

  useEffect(() => {
    const onStorageError = (e: Event) => {
      const detail = (e as CustomEvent<{ key?: string }>).detail;
      setStorageWarning(`Browser storage could not save ${detail?.key ?? "your latest change"}. This session will keep working, but export anything important before closing.`);
    };
    window.addEventListener("lf-storage-error", onStorageError);
    return () => window.removeEventListener("lf-storage-error", onStorageError);
  }, []);

  // H-8 — auto-narrate the current step's tagline when voice is on.
  useEffect(() => {
    if (!prefs.voiceEnabled) return;
    const step = WIZARD_STEPS.find(s => s.key === page);
    if (!step) return;
    speak(`Step ${step.num} of 7. ${step.plainLabel}. ${step.tagline}`);
    return () => stopSpeaking();
  }, [page, prefs.voiceEnabled]);

  const isWizardStep = WIZARD_STEPS.some(s => s.key === page);
  const currentStep = isWizardStep ? (page as WizardStepKey) : null;
  const currentIdx = currentStep ? WIZARD_STEPS.findIndex(s => s.key === currentStep) : -1;
  const currentStepComplete = currentStep ? stepCompletion[currentStep] : true;
  const isLastStep = currentIdx === WIZARD_STEPS.length - 1;
  const goNext = () => { if (currentIdx >= 0 && currentIdx < WIZARD_STEPS.length - 1) setPage(WIZARD_STEPS[currentIdx + 1]!.key); };
  const finish = () => setFinishOpen(true);
  const goPrev = () => { if (currentIdx > 0) setPage(WIZARD_STEPS[currentIdx - 1]!.key); };

  const [gearOpen, setGearOpen] = useState(false);
  const gearRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!gearOpen) return;
    function onClick(e: MouseEvent) {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) setGearOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [gearOpen]);

  const secondaryGroups: Record<string, typeof SECONDARY_PAGES> = {};
  for (const sp of SECONDARY_PAGES) {
    (secondaryGroups[sp.group] ??= []).push(sp);
  }

  const projectName = scanActive
    ? scanLabel
    : (project.brand.businessName ?? project.label);

  return (
    <div className="wizard-shell">
      <header className="wizard-shell__topbar">
        <div className="wizard-shell__toprow">
          <div className="wizard-shell__brand" onClick={() => setPage("project")} role="button">
            <div className="logo">LF</div>
            <div className="wizard-shell__brandtext">
              <strong>LaunchFoundry</strong>
              <span>Lite</span>
            </div>
          </div>

          <div className="wizard-shell__project">
            {scanActive ? <span className="eyebrow" style={{ color: "var(--accent)" }}>SCAN</span> : <span className="eyebrow">PROJECT</span>}
            <strong>{projectName}</strong>
          </div>

          <div className="wizard-shell__toprow-spacer" />

          <div className="wizard-shell__rightcontrols">
          {/* H-8 — voice narration toggle */}
          {ttsAvailable() && (
            <button
              type="button"
              className={"wizard-shell__textsize" + (prefs.voiceEnabled ? " wizard-shell__textsize--active" : "")}
              onClick={() => { setPrefs({ voiceEnabled: !prefs.voiceEnabled }); if (prefs.voiceEnabled) stopSpeaking(); }}
              title={prefs.voiceEnabled ? "Turn off voice" : "Read steps out loud"}
              aria-label={prefs.voiceEnabled ? "Turn off voice" : "Read steps out loud"}
            >
              🔊
            </button>
          )}

          {/* H-7 — bigger text toggle. Bright accent border when active. */}
          <button
            type="button"
            className={"wizard-shell__textsize" + (prefs.bigText ? " wizard-shell__textsize--active" : "")}
            onClick={() => setPrefs({ bigText: !prefs.bigText })}
            title={prefs.bigText ? "Switch to normal text" : "Make text bigger"}
            aria-label={prefs.bigText ? "Switch to normal text" : "Make text bigger"}
          >
            A<sup>↑</sup>
          </button>

          {/* H-5 — gear menu hidden in simple mode. */}
          {!prefs.simpleMode && (
            <div className="wizard-shell__gear" ref={gearRef}>
              <button type="button" className="wizard-shell__gearbtn" onClick={() => setGearOpen(o => !o)} title="More tools" aria-label="More tools">
                ⚙
              </button>
              {gearOpen && (
                <div className="wizard-shell__menu" role="menu">
                  {Object.entries(secondaryGroups).map(([group, items]) => (
                    <div key={group} className="wizard-shell__menugroup">
                      <span className="wizard-shell__menugroup-label">{group}</span>
                      {items.map(it => (
                        <button
                          key={it.key}
                          type="button"
                          role="menuitem"
                          className={"wizard-shell__menuitem" + (page === it.key ? " wizard-shell__menuitem--current" : "")}
                          onClick={() => { setPage(it.key); setGearOpen(false); }}
                        >
                          {it.label}
                        </button>
                      ))}
                    </div>
                  ))}
                  <div className="wizard-shell__menugroup">
                    <button
                      type="button"
                      role="menuitem"
                      className="wizard-shell__menuitem"
                      onClick={() => { setPrefs({ simpleMode: true }); setGearOpen(false); }}
                    >
                      ↩ Back to simple mode
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        </div>

        <nav className="wizard-shell__stepper" aria-label="Wizard steps">
          {WIZARD_STEPS.map(step => {
            const done = stepCompletion[step.key];
            const isCurrent = step.key === currentStep;
            const label = prefs.simpleMode ? step.plainLabel : step.label;
            return (
              <button
                key={step.key}
                type="button"
                className={
                  "wizard-shell__stepbtn"
                  + (isCurrent ? " wizard-shell__stepbtn--current" : "")
                  + (done ? " wizard-shell__stepbtn--done" : "")
                }
                title={step.tagline}
                onClick={() => setPage(step.key)}
              >
                <span className="wizard-shell__stepnum">{done ? "✓" : step.num}</span>
                <span className="wizard-shell__steplabel">{label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      <main className="wizard-shell__main">{children}</main>

      {storageWarning && (
        <div className="toast toast--warning" role="status">
          <span>{storageWarning}</span>
          <button type="button" onClick={() => setStorageWarning(null)}>Dismiss</button>
        </div>
      )}

      {prefs.simpleMode && currentStep && (
        <AskForHelp
          stepLabel={WIZARD_STEPS[currentIdx]?.plainLabel ?? "this step"}
          problemHint={WIZARD_STEPS[currentIdx]?.tagline}
        />
      )}

      {finishOpen && (
        <div className="modal-backdrop" onClick={() => setFinishOpen(false)}>
          <div className="modal finish-modal" role="dialog" aria-modal="true" aria-labelledby="finish-title" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <strong id="finish-title">Campaign plan is ready</strong>
              <button type="button" onClick={() => setFinishOpen(false)}>Close</button>
            </div>
            <div className="modal-body">
              <p className="finish-modal__copy">
                You have a project, campaign concepts, render path, music choice, schedule, and platform plan. Pick what you want to do next.
              </p>
              <div className="finish-modal__actions">
                <button className="primary" type="button" onClick={() => { setPage("renderspec"); setFinishOpen(false); }}>Review render spec</button>
                <button type="button" onClick={() => { setPage("build"); setFinishOpen(false); }}>Open video builder</button>
                <button type="button" onClick={() => { setPage("publishing"); setFinishOpen(false); }}>Review publishing pack</button>
                <button type="button" onClick={() => { setPage("qa"); setFinishOpen(false); }}>Run QA check</button>
                <button type="button" onClick={() => { setPage("projects"); setFinishOpen(false); }}>Back to projects</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {currentStep && (
        <footer className="wizard-shell__footer">
          <button type="button" onClick={goPrev} disabled={currentIdx === 0}>
            ← Back
          </button>
          <span className="wizard-shell__progress">
            Step {currentIdx + 1} of {WIZARD_STEPS.length}
            {prefs.simpleMode && (
              <>
                {" · "}
                <button
                  type="button"
                  className="wizard-shell__advanced-link"
                  onClick={() => setPrefs({ simpleMode: false })}
                  title="Show advanced tools (gear menu, raw labels)"
                >
                  Advanced tools
                </button>
              </>
            )}
          </span>
          <button
            type="button"
            className="primary"
            onClick={isLastStep ? finish : goNext}
            disabled={!currentStepComplete}
            title={!currentStepComplete ? "Finish this step before continuing" : undefined}
          >
            {isLastStep
              ? "Finish"
              : `Next: ${prefs.simpleMode
                ? (WIZARD_STEPS[currentIdx + 1]?.plainLabel ?? "Done")
                : (WIZARD_STEPS[currentIdx + 1]?.label ?? "Done")} →`}
          </button>
        </footer>
      )}
    </div>
  );
}
