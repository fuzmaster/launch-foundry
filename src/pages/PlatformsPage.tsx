// Round G · Platforms step. Three sections:
//   1. Recommendation — generate prompt, paste JSON back to see top platforms
//   2. Per-platform composer — pick a concept, see post sized to each picked platform
//   3. Profile setup briefs — for platforms you don't have a profile on, generate
//      a setup checklist prompt

import { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import { loadState, saveState } from "../lib/storage";
import { DEFAULT_TOKENS, type BrandTokens } from "../lib/brandExtract";
import { PLATFORM_LABEL, BEST_TIMES, type Platform } from "../lib/scheduleExport";
import {
  PLATFORM_SPEC,
  buildRecommendationPrompt, parseRecommendation, composePostForPlatform,
  buildSetupBrief, parseSetupBrief,
  type PlatformRecommendationResult, type SetupBriefResult,
} from "../lib/platformPack";
import type { BrandProfile, CampaignConcept } from "../types";

const ALL_PLATFORMS: Platform[] = ["instagram", "tiktok", "youtube", "linkedin", "x", "facebook", "pinterest"];

function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text).catch(() => {});
}

function brandToTokens(brand: BrandProfile): BrandTokens {
  const colors = brand.colors.filter(Boolean);
  return {
    ...DEFAULT_TOKENS,
    background: colors[0] || DEFAULT_TOKENS.background,
    surface: colors[1] || DEFAULT_TOKENS.surface,
    accent: colors[2] || colors[0] || DEFAULT_TOKENS.accent,
    accentSoft: colors[2] || colors[0] || DEFAULT_TOKENS.accentSoft,
    fontDisplay: brand.fonts[0] || DEFAULT_TOKENS.fontDisplay,
    fontBody: brand.fonts[1] || brand.fonts[0] || DEFAULT_TOKENS.fontBody,
    motif: DEFAULT_TOKENS.motif,
  };
}

function defaultSummary(brand: BrandProfile): string {
  const proof = brand.proofPoints.length > 0 ? ` Proof: ${brand.proofPoints.slice(0, 2).join("; ")}.` : "";
  return `${brand.businessName || brand.projectName} — ${brand.oneLiner || brand.offerSummary}.${proof}`;
}

export default function PlatformsPage({ brand, concepts }: { brand: BrandProfile; concepts: CampaignConcept[] }) {
  const tokens: BrandTokens = useMemo(() => brandToTokens(brand), [brand]);
  const defaultBrandSummary = useMemo(() => defaultSummary(brand), [brand]);

  // ─ Section 1 state ────────────────────────────────────────────────────
  const [brandSummary, setBrandSummary] = useState<string>(() => loadState("launchfoundry.platforms.brand", defaultBrandSummary));
  const [audienceHint, setAudienceHint] = useState<string>(() => loadState("launchfoundry.platforms.audience", brand.targetCustomer || ""));
  const [productType, setProductType] = useState<string>(() => loadState("launchfoundry.platforms.product", brand.category || "Service business"));
  const [geo, setGeo] = useState<string>(() => loadState("launchfoundry.platforms.geo", ""));
  const [recPasteText, setRecPasteText] = useState("");
  const [recResult, setRecResult] = useState<PlatformRecommendationResult | null>(() => loadState<PlatformRecommendationResult | null>("launchfoundry.platforms.recResult", null));
  const [recImportError, setRecImportError] = useState<string | null>(null);

  useEffect(() => saveState("launchfoundry.platforms.brand", brandSummary), [brandSummary]);
  useEffect(() => saveState("launchfoundry.platforms.audience", audienceHint), [audienceHint]);
  useEffect(() => saveState("launchfoundry.platforms.product", productType), [productType]);
  useEffect(() => saveState("launchfoundry.platforms.geo", geo), [geo]);
  useEffect(() => saveState("launchfoundry.platforms.recResult", recResult), [recResult]);

  const recPrompt = useMemo(() => buildRecommendationPrompt({ brandSummary, audienceHint, productType, geo: geo || undefined }), [brandSummary, audienceHint, productType, geo]);
  useEffect(() => {
    setBrandSummary(defaultBrandSummary);
    setAudienceHint(brand.targetCustomer || "");
    setProductType(brand.category || "Service business");
    setRecResult(null);
  }, [brand.projectName, defaultBrandSummary, brand.targetCustomer, brand.category]);

  function onImportRec() {
    setRecImportError(null);
    const parsed = parseRecommendation(recPasteText);
    if (!parsed) {
      setRecImportError("Couldn't parse JSON. Paste Claude's full reply (the fenced JSON is fine).");
      return;
    }
    setRecResult(parsed);
    setRecPasteText("");
  }

  // ─ Section 2 — composer ──────────────────────────────────────────────
  type DemoConcept = { id: string; title: string; hook: string; cta: string; url?: string };
  const concept: DemoConcept = useMemo(() => {
    const selected = concepts[0];
    if (selected) {
      return {
        id: selected.id,
        title: selected.title || selected.angle || brand.projectName,
        hook: selected.hook || selected.promise || selected.caption || brand.oneLiner,
        cta: selected.cta || brand.cta,
        url: brand.websiteUrl || undefined,
      };
    }
    return {
      id: "brand",
      title: brand.projectName,
      hook: brand.oneLiner || brand.offerSummary,
      cta: brand.cta || "Learn more",
      url: brand.websiteUrl || undefined,
    };
  }, [concepts, brand]);

  const [composerPlatforms, setComposerPlatforms] = useState<Platform[]>(() => loadState<Platform[]>("launchfoundry.platforms.composerPlatforms", ["instagram", "tiktok", "linkedin"]));
  useEffect(() => saveState("launchfoundry.platforms.composerPlatforms", composerPlatforms), [composerPlatforms]);
  const toggleComposerPlatform = (p: Platform) => setComposerPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const composedPosts = useMemo(() => composerPlatforms.map(p => ({
    platform: p,
    ...composePostForPlatform({
      platform: p,
      conceptTitle: concept.title,
      conceptHook: concept.hook,
      cta: concept.cta,
      url: concept.url,
      brandTokens: tokens,
    }),
  })), [composerPlatforms, concept, tokens]);

  // ─ Section 3 — setup briefs ──────────────────────────────────────────
  const [missingPlatforms, setMissingPlatforms] = useState<Platform[]>(() => loadState<Platform[]>("launchfoundry.platforms.missing", []));
  useEffect(() => saveState("launchfoundry.platforms.missing", missingPlatforms), [missingPlatforms]);
  const toggleMissing = (p: Platform) => setMissingPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const [setupBriefPlatform, setSetupBriefPlatform] = useState<Platform | null>(null);
  const [setupPasteText, setSetupPasteText] = useState("");
  const [setupResults, setSetupResults] = useState<Record<string, SetupBriefResult>>(() => loadState<Record<string, SetupBriefResult>>("launchfoundry.platforms.setupResults", {}));
  const [setupImportError, setSetupImportError] = useState<string | null>(null);
  useEffect(() => saveState("launchfoundry.platforms.setupResults", setupResults), [setupResults]);

  const setupPrompt = useMemo(() => {
    if (!setupBriefPlatform) return "";
    return buildSetupBrief({
      platform: setupBriefPlatform,
      brandSummary, audienceHint, productType,
      homepageUrl: concept.url,
    });
  }, [setupBriefPlatform, brandSummary, audienceHint, productType, concept.url]);

  function onImportSetup() {
    if (!setupBriefPlatform) return;
    setSetupImportError(null);
    const parsed = parseSetupBrief(setupPasteText);
    if (!parsed) {
      setSetupImportError("Couldn't parse JSON. Paste Claude's full reply.");
      return;
    }
    setSetupResults(prev => ({ ...prev, [setupBriefPlatform]: parsed }));
    setSetupPasteText("");
  }

  return (
    <div className="page">
      <h1>Platforms</h1>
      <p className="lede">
        Three tools: rank the platforms that fit this brand, see your concept sized to each one,
        and (if you're starting fresh) generate a setup brief for any platform you don't have a profile on yet.
      </p>

      {/* ── Section 1 — Recommendation ────────────────────────────────── */}
      <Card title="1 · Recommend my top platforms" eyebrow="Brand → Claude / GPT → JSON back">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>
            <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Brand summary</span>
            <textarea value={brandSummary} onChange={e => setBrandSummary(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <label>
            <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Audience hint</span>
            <textarea value={audienceHint} onChange={e => setAudienceHint(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <label>
            <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Product type</span>
            <input value={productType} onChange={e => setProductType(e.target.value)} />
          </label>
          <label>
            <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Geo (optional)</span>
            <input value={geo} onChange={e => setGeo(e.target.value)} placeholder="US Pacific Northwest" />
          </label>
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <button className="primary" onClick={() => copyToClipboard(recPrompt)}>Copy recommendation prompt</button>
        </div>
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>Preview prompt ({recPrompt.length} chars)</summary>
          <pre style={{ marginTop: 8, padding: 10, background: "rgba(0,0,0,0.4)", border: "1px solid var(--line)", fontSize: 11, maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap" }}>{recPrompt}</pre>
        </details>
        <div style={{ marginTop: 14 }}>
          <strong style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>PASTE CLAUDE'S REPLY</strong>
          <textarea value={recPasteText} onChange={e => setRecPasteText(e.target.value)} rows={5} placeholder="Paste the JSON response here" style={{ width: "100%", fontFamily: "var(--mono)", fontSize: 12 }} />
          <div className="button-row" style={{ marginTop: 8 }}>
            <button onClick={onImportRec} disabled={recPasteText.trim().length === 0}>Import</button>
            {recResult && <button onClick={() => setRecResult(null)}>Clear results</button>}
          </div>
          {recImportError && <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--danger)" }}>{recImportError}</p>}
        </div>

        {recResult && (
          <div style={{ marginTop: 16 }}>
            <strong style={{ display: "block", fontSize: 12, color: "var(--accent)", marginBottom: 8, letterSpacing: 1 }}>RECOMMENDED FOR THIS BRAND</strong>
            <div style={{ display: "grid", gap: 8 }}>
              {recResult.recommended.map(r => (
                <div key={r.platform} style={{ padding: "10px 14px", border: "1px solid var(--line)", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center" }}>
                  <strong style={{ color: "var(--accent)", fontFamily: "var(--font-display)" }}>#{r.rank} {PLATFORM_LABEL[r.platform as Platform] ?? r.platform}</strong>
                  <span style={{ fontSize: 13, color: "var(--text-soft)" }}>{r.audienceMatch}</span>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>reach: {r.expectedReach} · effort: {r.effortToProduce}</span>
                </div>
              ))}
            </div>
            {recResult.skipReasons.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>Why NOT to use {recResult.skipReasons.length} other platform(s)</summary>
                <ul style={{ marginTop: 8, fontSize: 12, color: "var(--text-soft)" }}>
                  {recResult.skipReasons.map((s, i) => (
                    <li key={i}><strong style={{ color: "var(--accent)" }}>{s.platform}:</strong> {s.reason}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </Card>

      {/* ── Section 2 — Per-platform composer ────────────────────────── */}
      <Card title="2 · Per-platform post composer" eyebrow={`Concept: "${concept.title}"`}>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)" }}>
          Tick which platforms you want to post on, then see the caption + hashtags sized to each one's char limit.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 6 }}>
          {ALL_PLATFORMS.map(p => {
            const picked = composerPlatforms.includes(p);
            return (
              <label key={p} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                border: `1px solid ${picked ? "var(--accent)" : "var(--line)"}`,
                background: picked ? "var(--accent-glow)" : "transparent",
                cursor: "pointer", fontSize: 13,
              }}>
                <input type="checkbox" checked={picked} onChange={() => toggleComposerPlatform(p)} />
                <span>{PLATFORM_LABEL[p]}</span>
              </label>
            );
          })}
        </div>

        {composedPosts.length > 0 && (
          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            {composedPosts.map(post => (
              <div key={post.platform} style={{ padding: "12px 14px", border: "1px solid var(--line)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <strong style={{ color: "var(--accent)" }}>{PLATFORM_LABEL[post.platform]}</strong>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    {post.caption.length} / {PLATFORM_SPEC[post.platform].captionLimit} chars {post.truncated && <span style={{ color: "var(--danger)" }}>· truncated</span>}
                  </span>
                </div>
                <pre style={{ margin: 0, fontSize: 12, fontFamily: "var(--font)", color: "var(--text-soft)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {post.caption}
                </pre>
                <div className="button-row" style={{ marginTop: 10 }}>
                  <button onClick={() => copyToClipboard(post.caption)}>Copy caption</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Section 3 — Setup briefs ─────────────────────────────────── */}
      <Card title="3 · Profile setup briefs" eyebrow="For platforms you don't have yet">
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)" }}>
          Tick the platforms you DON'T have a profile on. Then pick one to generate a Claude/GPT brief
          that returns bio + avatar concept + link strategy + first 3 posts.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 6 }}>
          {ALL_PLATFORMS.map(p => {
            const missing = missingPlatforms.includes(p);
            const haveBrief = !!setupResults[p];
            return (
              <label key={p} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                border: `1px solid ${missing ? "var(--accent)" : "var(--line)"}`,
                background: missing ? "var(--accent-glow)" : "transparent",
                cursor: "pointer", fontSize: 13,
              }}>
                <input type="checkbox" checked={missing} onChange={() => toggleMissing(p)} />
                <span>{PLATFORM_LABEL[p]}{haveBrief && " ✓"}</span>
              </label>
            );
          })}
        </div>

        {missingPlatforms.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <strong style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>PICK ONE TO BRIEF</strong>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {missingPlatforms.map(p => (
                <button
                  key={p}
                  className={setupBriefPlatform === p ? "primary" : ""}
                  onClick={() => setSetupBriefPlatform(p)}
                >
                  {PLATFORM_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
        )}

        {setupBriefPlatform && (
          <div style={{ marginTop: 16 }}>
            <div className="button-row">
              <button className="primary" onClick={() => copyToClipboard(setupPrompt)}>Copy {PLATFORM_LABEL[setupBriefPlatform]} brief</button>
            </div>
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>Preview prompt ({setupPrompt.length} chars)</summary>
              <pre style={{ marginTop: 8, padding: 10, background: "rgba(0,0,0,0.4)", border: "1px solid var(--line)", fontSize: 11, maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap" }}>{setupPrompt}</pre>
            </details>
            <div style={{ marginTop: 14 }}>
              <strong style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>PASTE CLAUDE'S REPLY</strong>
              <textarea value={setupPasteText} onChange={e => setSetupPasteText(e.target.value)} rows={5} placeholder="Paste the JSON response here" style={{ width: "100%", fontFamily: "var(--mono)", fontSize: 12 }} />
              <div className="button-row" style={{ marginTop: 8 }}>
                <button onClick={onImportSetup} disabled={setupPasteText.trim().length === 0}>Import for {PLATFORM_LABEL[setupBriefPlatform]}</button>
              </div>
              {setupImportError && <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--danger)" }}>{setupImportError}</p>}
            </div>
          </div>
        )}

        {Object.keys(setupResults).length > 0 && (
          <div style={{ marginTop: 18 }}>
            <strong style={{ display: "block", fontSize: 12, color: "var(--accent)", letterSpacing: 1, marginBottom: 8 }}>SETUP CHECKLISTS</strong>
            <div style={{ display: "grid", gap: 14 }}>
              {(Object.entries(setupResults) as [Platform, SetupBriefResult][]).map(([platform, brief]) => (
                <div key={platform} style={{ padding: "14px 16px", border: "1px solid var(--accent)", background: "var(--accent-glow)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <strong style={{ color: "var(--accent)" }}>{PLATFORM_LABEL[platform]}</strong>
                    <button onClick={() => setSetupResults(prev => { const n = { ...prev }; delete n[platform]; return n; })} style={{ padding: "2px 8px", fontSize: 11 }}>Clear</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", fontSize: 13, lineHeight: 1.5 }}>
                    <strong style={{ color: "var(--muted)", fontSize: 11 }}>USERNAME</strong><span>@{brief.username}</span>
                    <strong style={{ color: "var(--muted)", fontSize: 11 }}>DISPLAY NAME</strong><span>{brief.displayName}</span>
                    <strong style={{ color: "var(--muted)", fontSize: 11 }}>BIO</strong><span style={{ color: "var(--text-soft)" }}>{brief.bio} <span style={{ color: "var(--muted)" }}>({brief.bio.length}/{PLATFORM_SPEC[platform].bioLimit})</span></span>
                    <strong style={{ color: "var(--muted)", fontSize: 11 }}>AVATAR</strong><span>{brief.profilePicConcept}</span>
                    {brief.headerOrCover && (<><strong style={{ color: "var(--muted)", fontSize: 11 }}>HEADER</strong><span>{brief.headerOrCover}</span></>)}
                    <strong style={{ color: "var(--muted)", fontSize: 11 }}>AUDIENCE TAGS</strong><span>{brief.primaryAudienceTags.join(" · ")}</span>
                    <strong style={{ color: "var(--muted)", fontSize: 11 }}>FOLLOW DAY-1</strong><span>{brief.firstFiveFollows.join(", ")}</span>
                    <strong style={{ color: "var(--muted)", fontSize: 11 }}>LINK</strong><span>{brief.linkInBioStrategy}</span>
                  </div>
                  {brief.firstThreePosts.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <strong style={{ color: "var(--muted)", fontSize: 11, display: "block", marginBottom: 6 }}>FIRST 3 POSTS</strong>
                      <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "var(--text-soft)" }}>
                        {brief.firstThreePosts.map((p, i) => (
                          <li key={i} style={{ marginBottom: 4 }}>
                            <strong>{p.format}</strong> ({p.purpose}) — {p.caption}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* H-10 — Print-friendly summary. Hidden on screen; window.print() shows only this. */}
      <Card title="4 · Print your plan" eyebrow="One-page summary for the fridge">
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)" }}>
          A 1-page summary of what you're posting, when, and where. Click Print, then Save as PDF (or send to a real printer).
        </p>
        <button className="primary" onClick={() => window.print()}>🖨 Print my plan</button>
      </Card>

      <section className="lf-print-section" aria-hidden>
        <h1>{concept.title}</h1>
        <div className="meta">Your LaunchFoundry plan</div>

        {recResult && (
          <>
            <h2>Top platforms for you</h2>
            <ol>
              {recResult.recommended.map(r => (
                <li key={r.platform}><strong>{PLATFORM_LABEL[r.platform as Platform] ?? r.platform}</strong> — {r.audienceMatch}</li>
              ))}
            </ol>
          </>
        )}

        <h2>Posts per platform</h2>
        <table>
          <thead><tr><th>Platform</th><th>Caption</th><th>Best time to post</th></tr></thead>
          <tbody>
            {composedPosts.map(p => (
              <tr key={p.platform}>
                <td><strong>{PLATFORM_LABEL[p.platform]}</strong></td>
                <td>{p.caption}</td>
                <td>{BEST_TIMES[p.platform].map(t => `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {Object.keys(setupResults).length > 0 && (
          <>
            <h2>Profile setup briefs</h2>
            {(Object.entries(setupResults) as [Platform, SetupBriefResult][]).map(([p, b]) => (
              <div key={p} style={{ marginTop: 12 }}>
                <strong>{PLATFORM_LABEL[p]}</strong>
                <div>Username: @{b.username} · Display name: {b.displayName}</div>
                <div>Bio: {b.bio}</div>
                <div>Link strategy: {b.linkInBioStrategy}</div>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
