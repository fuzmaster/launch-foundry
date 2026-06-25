// Round H-6 — guided "send to AI" flow. Replaces a bare Copy button with:
//   1. Copy the prompt to clipboard
//   2. Open chatgpt.com or claude.ai in a new tab
//   3. Show a friendly 3-step modal explaining what to do next
// Same paste-out / paste-back pattern as before; just hand-holding around it.

import { useState } from "react";

type Provider = "chatgpt" | "claude";

const PROVIDER_URLS: Record<Provider, string> = {
  chatgpt: "https://chatgpt.com/",
  claude: "https://claude.ai/new",
};

const PROVIDER_LABELS: Record<Provider, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
};

export default function SendToAI({
  promptText,
  buttonText = "Send to ChatGPT",
  className,
  size = "normal",
}: {
  promptText: string;
  buttonText?: string;
  className?: string;
  size?: "normal" | "compact";
}) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [provider, setProvider] = useState<Provider>("chatgpt");

  async function send(p: Provider) {
    setProvider(p);
    try { await navigator.clipboard.writeText(promptText); } catch {}
    window.open(PROVIDER_URLS[p], "_blank", "noopener");
    setStep(1);
  }

  return (
    <>
      <div className={"send-to-ai" + (size === "compact" ? " send-to-ai--compact" : "") + (className ? " " + className : "")}>
        <button className="primary" onClick={() => send("chatgpt")}>
          🚀 {buttonText}
        </button>
        <button onClick={() => send("claude")} title="Use Claude instead">
          or Claude
        </button>
      </div>

      {step > 0 && (
        <div className="send-to-ai__modal-backdrop" onClick={() => setStep(0)}>
          <div className="send-to-ai__modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>
              Opened {PROVIDER_LABELS[provider]} in a new tab.
            </h2>
            <p style={{ margin: "0 0 18px", color: "var(--muted)", fontSize: 13 }}>
              The prompt is on your clipboard. Three steps:
            </p>

            <ol className="send-to-ai__steps">
              <li className={step >= 1 ? "is-current" : ""}>
                <span className="send-to-ai__stepnum">1</span>
                <div>
                  <strong>Switch to the {PROVIDER_LABELS[provider]} tab.</strong>
                  <span>Look at your tab bar at the top — the new tab is probably the last one.</span>
                </div>
              </li>
              <li className={step >= 1 ? "is-current" : ""}>
                <span className="send-to-ai__stepnum">2</span>
                <div>
                  <strong>Paste (Ctrl + V on Windows, ⌘ + V on Mac) into the message box, then press Enter.</strong>
                  <span>Wait for the reply — it usually takes 30 seconds to 2 minutes.</span>
                </div>
              </li>
              <li className={step >= 1 ? "is-current" : ""}>
                <span className="send-to-ai__stepnum">3</span>
                <div>
                  <strong>Copy the whole reply, switch back here, and paste it in the box below.</strong>
                  <span>We'll do the rest.</span>
                </div>
              </li>
            </ol>

            <div className="send-to-ai__modal-actions">
              <button className="primary" onClick={() => setStep(0)}>
                Got it
              </button>
              <button
                onClick={async () => {
                  try { await navigator.clipboard.writeText(promptText); } catch {}
                }}
              >
                Copy prompt again
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
