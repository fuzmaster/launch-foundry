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
import { loadState, saveState } from "../lib/storage";

export type WizardStepKey = "project" | "research" | "concepts" | "build" | "schedule";
export type SecondaryPageKey = "projects" | "brand" | "strategy" | "storyboard" | "renderspec" | "publishing" | "qa" | "prompts" | "music" | "platforms";
export type AnyPageKey = WizardStepKey | SecondaryPageKey;

export const WIZARD_STEPS: { key: WizardStepKey; num: number; label: string; plainLabel: string; tagline: string }[] = [
  { key: "project",   num: 1, label: "Add Stuff",   plainLabel: "Add your stuff",       tagline: "Give LaunchFoundry your website, folder, photos, or videos" },
  { key: "research",  num: 2, label: "AI Sorts",    plainLabel: "Let AI sort it",       tagline: "Ask AI to read everything and tell us what matters" },
  { key: "concepts",  num: 3, label: "Pick Videos", plainLabel: "Pick the best videos", tagline: "Choose the ideas you actually want to make" },
  { key: "build",     num: 4, label: "Make",        plainLabel: "Make the videos",      tagline: "Preview the video and render it when it looks right" },
  { key: "schedule",  num: 5, label: "Post",        plainLabel: "Post it",              tagline: "Choose where and when the finished videos should go" },
];

const SECONDARY_PAGES: { key: SecondaryPageKey; label: string; group: "Project" | "Campaign" | "Reference" }[] = [
  { key: "projects",   label: "Switch project",   group: "Project" },
  { key: "brand",      label: "Brand profile",    group: "Campaign" },
  { key: "strategy",   label: "Audience strategy", group: "Campaign" },
  { key: "storyboard", label: "Storyboard",       group: "Campaign" },
  { key: "renderspec", label: "Render spec (advanced)", group: "Campaign" },
  { key: "publishing", label: "Publishing pack",  group: "Campaign" },
  { key: "qa",         label: "QA check",         group: "Campaign" },
  { key: "platforms",  label: "Platform captions", group: "Campaign" },
  { key: "music",      label: "Music choice",     group: "Campaign" },
  { key: "prompts",    label: "Prompt pack",      group: "Reference" },
];

const COACH_COPY: Record<WizardStepKey, { title: string; short: string; steps: string[]; done: string }> = {
  project: {
    title: "Add the things AI should look at",
    short: "Start here. Add a website, folder, photos, videos, or a review file.",
    steps: [
      "Pick the closest business type.",
      "Choose a folder, paste a website, or upload a review file.",
      "If you have lots of images, run the review command to make a picture sheet.",
    ],
    done: "You are done when the recipe says Project files is green.",
  },
  research: {
    title: "Ask AI to explain the project",
    short: "Copy the prompt, send it to AI, then paste the JSON answer back.",
    steps: [
      "Click the AI button for the brief or campaign prompt.",
      "Attach the review file or picture sheet if you made one.",
      "Paste AI's JSON answer back into LaunchFoundry.",
    ],
    done: "You are done when AI notes is green.",
  },
  concepts: {
    title: "Pick the videos worth making",
    short: "Choose the best ideas. You do not need to use every idea.",
    steps: [
      "Read the titles and hooks.",
      "Pick the one that sounds clearest for your customer.",
      "Use the score as a helper, not a rule.",
    ],
    done: "You are done when Video picks is green.",
  },
  build: {
    title: "Preview the video",
    short: "Check the draft, then render when it looks right.",
    steps: [
      "Open the preview.",
      "Check text, images, timing, and missing assets.",
      "Render the video when the preview makes sense.",
    ],
    done: "You are done when Video draft is green.",
  },
  schedule: {
    title: "Choose where and when to post",
    short: "Pick platforms and dates, then export the posting plan.",
    steps: [
      "Choose the platforms you want.",
      "Pick a start date and posting rhythm.",
      "Download the calendar or CSV file.",
    ],
    done: "You are done when Posting plan is green.",
  },
};

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
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachTipHidden, setCoachTipHidden] = useState(false);
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
    speak(`Step ${step.num} of ${WIZARD_STEPS.length}. ${step.plainLabel}. ${step.tagline}`);
    return () => stopSpeaking();
  }, [page, prefs.voiceEnabled]);

  const isWizardStep = WIZARD_STEPS.some(s => s.key === page);
  const currentStep = isWizardStep ? (page as WizardStepKey) : null;
  const currentIdx = currentStep ? WIZARD_STEPS.findIndex(s => s.key === currentStep) : -1;
  const currentStepComplete = currentStep ? stepCompletion[currentStep] : true;
  const currentCoach = currentStep ? COACH_COPY[currentStep] : null;
  const isLastStep = currentIdx === WIZARD_STEPS.length - 1;
  const goNext = () => { if (currentIdx >= 0 && currentIdx < WIZARD_STEPS.length - 1) setPage(WIZARD_STEPS[currentIdx + 1]!.key); };
  const finish = () => setFinishOpen(true);
  const goPrev = () => { if (currentIdx > 0) setPage(WIZARD_STEPS[currentIdx - 1]!.key); };

  useEffect(() => {
    if (!currentStep) return;
    setCoachTipHidden(loadState(`launchfoundry.coach.v2.tipHidden.${currentStep}`, false));
  }, [currentStep]);

  useEffect(() => {
    if (!prefs.simpleMode || !currentStep) return;
    const key = `launchfoundry.coach.v2.seen.${currentStep}`;
    if (loadState(key, false)) return;
    const timer = window.setTimeout(() => {
      saveState(key, true);
      setCoachOpen(true);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [currentStep, prefs.simpleMode]);

  const hideCoachTip = () => {
    if (!currentStep) return;
    saveState(`launchfoundry.coach.v2.tipHidden.${currentStep}`, true);
    setCoachTipHidden(true);
  };

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
  const recipeItems = [
    { label: "Project files", done: stepCompletion.project, hint: scanActive ? "Folder loaded" : "Ready to add" },
    { label: "AI notes", done: stepCompletion.research, hint: "Brief + ideas" },
    { label: "Video picks", done: stepCompletion.concepts, hint: "Concepts chosen" },
    { label: "Video draft", done: stepCompletion.build, hint: "Preview ready" },
    { label: "Posting plan", done: stepCompletion.schedule, hint: "Calendar ready" },
  ];

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
          {currentCoach && (
            <button
              type="button"
              className="coach-help-button"
              onClick={() => setCoachOpen(true)}
              title="Show simple help for this step"
            >
              Help me
            </button>
          )}

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

      <main className="wizard-shell__main">
        <aside className="recipe-panel" aria-label="Your recipe">
          <span className="recipe-panel__label">Your Recipe</span>
          <strong>{projectName}</strong>
          <p>Follow these boxes in order. Green means that part is ready.</p>
          <div className="recipe-panel__list">
            {recipeItems.map(item => (
              <div key={item.label} className={"recipe-panel__item" + (item.done ? " recipe-panel__item--done" : "")}>
                <span>{item.done ? "✓" : "○"}</span>
                <div>
                  <b>{item.label}</b>
                  <small>{item.hint}</small>
                </div>
              </div>
            ))}
          </div>
        </aside>
        <section key={page} className="wizard-shell__content">
          {prefs.simpleMode && currentCoach && !coachTipHidden && (
            <div className="coach-tip" role="status">
              <div>
                <span className="coach-tip__label">Start here</span>
                <strong>{currentCoach.title}</strong>
                <p>{currentCoach.short}</p>
              </div>
              <div className="coach-tip__actions">
                <button type="button" className="primary" onClick={() => setCoachOpen(true)}>Show me</button>
                <button type="button" onClick={hideCoachTip}>Hide tip</button>
              </div>
            </div>
          )}
          {children}
        </section>
      </main>

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

      {coachOpen && currentCoach && (
        <div className="modal-backdrop coach-modal-backdrop" onClick={() => setCoachOpen(false)}>
          <div className="modal coach-modal" role="dialog" aria-modal="true" aria-labelledby="coach-title" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="coach-modal__step">Step {currentIdx + 1} of {WIZARD_STEPS.length}</span>
                <strong id="coach-title">{currentCoach.title}</strong>
              </div>
              <button type="button" onClick={() => setCoachOpen(false)}>Close</button>
            </div>
            <div className="modal-body">
              <p className="coach-modal__plain">{currentCoach.short}</p>
              <ol className="coach-modal__list">
                {currentCoach.steps.map((item, idx) => (
                  <li key={item}>
                    <span>{idx + 1}</span>
                    <p>{item}</p>
                  </li>
                ))}
              </ol>
              <div className="coach-modal__done">
                <strong>How you know you are done</strong>
                <span>{currentCoach.done}</span>
              </div>
              <div className="button-row coach-modal__actions">
                {ttsAvailable() && (
                  <button
                    type="button"
                    onClick={() => speak(`${currentCoach.title}. ${currentCoach.short}. ${currentCoach.steps.join(". ")}. ${currentCoach.done}`)}
                  >
                    Read this out loud
                  </button>
                )}
                <button type="button" className="primary" onClick={() => setCoachOpen(false)}>Got it</button>
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
