// Round H-2 — 3×4 grid of business categories. The card the user clicks
// becomes the source of truth for every "Pick for me" button downstream.

import { BUSINESS_TYPES } from "../lib/businessTypes";
import { usePreferences } from "../lib/preferences";

export default function BusinessTypePicker({ compact = false }: { compact?: boolean }) {
  const [prefs, setPrefs] = usePreferences();
  const current = prefs.businessType;

  return (
    <div className={"biz-picker" + (compact ? " biz-picker--compact" : "")}>
      {BUSINESS_TYPES.map(t => {
        const picked = current === t.id;
        return (
          <button
            key={t.id}
            type="button"
            className={"biz-picker__card" + (picked ? " biz-picker__card--picked" : "")}
            onClick={() => setPrefs({ businessType: picked ? null : t.id })}
            title={t.vibe}
          >
            <span className="biz-picker__emoji" aria-hidden>{t.emoji}</span>
            <strong className="biz-picker__label">{t.label}</strong>
            <span className="biz-picker__vibe">{t.vibe}</span>
            {picked && <span className="biz-picker__check" aria-label="Selected">✓</span>}
          </button>
        );
      })}
    </div>
  );
}
