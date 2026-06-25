import Card from "../components/Card";
import type { BrandProfile } from "../types";

export default function BrandProfilePage({ brand, setBrand }: { brand: BrandProfile; setBrand: (brand: BrandProfile) => void }) {
  const updateArray = (key: keyof BrandProfile, value: string) =>
    setBrand({ ...brand, [key]: value.split("\n").map(x => x.trim()).filter(Boolean) });

  return (
    <div className="page">
      <h1>Brand Profile</h1>
      <p className="lede">The extracted brand profile. Edit this before making claims or generating renders.</p>
      <Card title="Core positioning" eyebrow="Brand">
        <div className="grid two">
          <label>Business name<input value={brand.businessName ?? ""} onChange={e => setBrand({ ...brand, businessName: e.target.value })} /></label>
          <label>Category<input value={brand.category} onChange={e => setBrand({ ...brand, category: e.target.value })} /></label>
        </div>
        <label>One-liner<input value={brand.oneLiner} onChange={e => setBrand({ ...brand, oneLiner: e.target.value })} /></label>
        <label>Offer summary<textarea value={brand.offerSummary} onChange={e => setBrand({ ...brand, offerSummary: e.target.value })} rows={4} /></label>
        <label>Target customer<textarea value={brand.targetCustomer} onChange={e => setBrand({ ...brand, targetCustomer: e.target.value })} rows={3} /></label>
        <label>Tone<input value={brand.tone} onChange={e => setBrand({ ...brand, tone: e.target.value })} /></label>
        <label>CTA<input value={brand.cta} onChange={e => setBrand({ ...brand, cta: e.target.value })} /></label>
      </Card>
      <div className="grid two">
        <Card title="Proof points">
          <textarea value={brand.proofPoints.join("\n")} onChange={e => updateArray("proofPoints", e.target.value)} rows={7} />
        </Card>
        <Card title="Claims to avoid">
          <textarea value={brand.avoidClaims.join("\n")} onChange={e => updateArray("avoidClaims", e.target.value)} rows={7} />
        </Card>
      </div>
    </div>
  );
}
