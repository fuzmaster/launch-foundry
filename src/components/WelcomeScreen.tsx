// Round H-4 — first-launch welcome. Big-text, no sidebar, no stepper.
// Three buttons: Start, See example, Watch tour. Sets hasStarted=true.

import { usePreferences } from "../lib/preferences";

export default function WelcomeScreen({
  onStart,
  onLoadExample,
}: {
  onStart: () => void;
  onLoadExample: () => void;
}) {
  const [, setPrefs] = usePreferences();

  return (
    <div className="welcome">
      <div className="welcome__inner">
        <div className="welcome__logo">
          <div className="logo" style={{ width: 64, height: 64, fontSize: 24 }}>LF</div>
        </div>

        <h1 className="welcome__title">
          Make video ads for your<br />business in 10 minutes.
        </h1>
        <p className="welcome__sub">
          No editing skills needed. You answer a few questions,
          LaunchFoundry makes the videos and tells you what to post and when.
        </p>

        <button
          className="welcome__cta"
          onClick={() => { setPrefs({ hasStarted: true }); onStart(); }}
        >
          🎬 Start a new ad
        </button>

        <div className="welcome__secondary">
          <button
            className="welcome__link"
            onClick={() => { setPrefs({ hasStarted: true }); onLoadExample(); }}
          >
            See an example
          </button>
          <span className="welcome__sep">·</span>
          <button
            className="welcome__link"
            onClick={() => {
              setPrefs({ hasStarted: true });
              onStart();
            }}
          >
            Skip — I know what I'm doing
          </button>
        </div>

        <div className="welcome__reassure">
          <strong>Everything stays on your computer.</strong>
          {" "}No account, no signup, no API keys. We use ChatGPT or Claude
          for the writing — you copy and paste between tabs (we'll show you how).
        </div>
      </div>
    </div>
  );
}
