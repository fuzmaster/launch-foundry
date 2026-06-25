// Round H — boomer-friendly preferences store. A single localStorage-backed
// object so the App + every page can read/write the same flags without
// scattering ad-hoc keys. Use the hook in components; the bare functions for
// non-React callers (e.g. lib code).

import { useEffect, useState } from "react";
import { loadState, saveState } from "./storage";

export type Preferences = {
  /** First-launch users see the welcome screen until they click "Start". */
  hasStarted: boolean;
  /** Hide the gear menu + advanced pages unless the user opts in. Default ON. */
  simpleMode: boolean;
  /** Scale base font from 14→18px, line-height breathes. */
  bigText: boolean;
  /** Auto-narrate each wizard step via SpeechSynthesis. */
  voiceEnabled: boolean;
  /** Business type the user picked on the Project step. Drives "Pick for me" defaults. */
  businessType: string | null;
  /** Email address the user wants help-emails to go to ("Stuck? Email my kid"). */
  helpEmail: string;
};

const DEFAULTS: Preferences = {
  hasStarted: false,
  simpleMode: true,
  bigText: false,
  voiceEnabled: false,
  businessType: null,
  helpEmail: "",
};

const KEY = "launchfoundry.preferences.v1";

export function loadPreferences(): Preferences {
  return { ...DEFAULTS, ...loadState<Preferences>(KEY, DEFAULTS) };
}

export function savePreferences(next: Preferences): void {
  saveState(KEY, next);
  // Broadcast — other tabs / windows can sync their state.
  try {
    window.dispatchEvent(new CustomEvent("lf-preferences-changed", { detail: next }));
  } catch { /* SSR / no-window */ }
}

/** React hook. Subscribes to changes from anywhere in the app. */
export function usePreferences(): [Preferences, (patch: Partial<Preferences>) => void] {
  const [prefs, setPrefs] = useState<Preferences>(() => loadPreferences());
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<Preferences>).detail;
      if (detail) setPrefs(detail);
    };
    window.addEventListener("lf-preferences-changed", onChange);
    return () => window.removeEventListener("lf-preferences-changed", onChange);
  }, []);
  const update = (patch: Partial<Preferences>) => {
    const merged = { ...prefs, ...patch };
    setPrefs(merged);
    savePreferences(merged);
  };
  return [prefs, update];
}
