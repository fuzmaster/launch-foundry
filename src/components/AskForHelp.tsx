// Round H-11 — "Stuck? Email this to my kid." Opens the user's default mail
// client with a draft that explains where they are and what they were trying
// to do. The receiving relative/friend gets enough context to help in 60s.

import { useState } from "react";
import { usePreferences } from "../lib/preferences";

export default function AskForHelp({ stepLabel, problemHint }: { stepLabel: string; problemHint?: string }) {
  const [prefs, setPrefs] = usePreferences();
  const [open, setOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");

  function sendNow() {
    const to = prefs.helpEmail || "";
    const subject = `Need a hand with LaunchFoundry — stuck on "${stepLabel}"`;
    const body = [
      `Hi,`,
      ``,
      `I'm trying to use LaunchFoundry to make a video ad for my business and I'm stuck.`,
      ``,
      `Where I am: "${stepLabel}"${problemHint ? ` (${problemHint})` : ""}`,
      ``,
      emailDraft.trim() ? `What I tried: ${emailDraft.trim()}\n` : "",
      `Can you take a quick look? I have it open on my computer.`,
      ``,
      `Thanks!`,
    ].filter(Boolean).join("\n");
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setOpen(false);
  }

  return (
    <>
      <button className="ask-for-help" onClick={() => setOpen(true)} title="Email someone for help">
        🆘 Stuck? Email for help
      </button>
      {open && (
        <div className="send-to-ai__modal-backdrop" onClick={() => setOpen(false)}>
          <div className="send-to-ai__modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 14px", fontSize: 22 }}>Who can help?</h2>
            <label style={{ display: "block", marginBottom: 14 }}>
              <strong style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>EMAIL ADDRESS</strong>
              <input
                type="email"
                value={prefs.helpEmail}
                onChange={e => setPrefs({ helpEmail: e.target.value })}
                placeholder="my-helpful-relative@example.com"
                style={{ width: "100%" }}
              />
              <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--muted)" }}>
                We'll remember this for next time.
              </span>
            </label>
            <label style={{ display: "block", marginBottom: 16 }}>
              <strong style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>WHAT'S CONFUSING? (OPTIONAL)</strong>
              <textarea
                rows={3}
                value={emailDraft}
                onChange={e => setEmailDraft(e.target.value)}
                placeholder="e.g. I clicked Send to ChatGPT but it asked for an account…"
                style={{ width: "100%" }}
              />
            </label>
            <div className="send-to-ai__modal-actions">
              <button className="primary" onClick={sendNow} disabled={!prefs.helpEmail.includes("@")}>
                Open my email app
              </button>
              <button onClick={() => setOpen(false)}>Cancel</button>
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 11, color: "var(--muted)" }}>
              This opens your default mail program. We never send anything ourselves.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
