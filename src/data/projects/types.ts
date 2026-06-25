import type { BrandProfile, CampaignConcept, CampaignPrompt, ProjectAsset } from "../../types";

export type Project = {
  id: string;
  label: string;
  blurb: string;
  brand: BrandProfile;
  assets: ProjectAsset[];
  concepts: CampaignConcept[];
  defaultConceptId: string;
  defaultPrompt: CampaignPrompt;
  /** Optional inlined source-file excerpts (README, package.json, etc.) carried over from a scan. */
  sourceExcerpts?: Record<string, string>;
  /** ISO timestamp the project was created. */
  createdAt?: string;
  /** ISO timestamp the project was last edited or activated. Used to sort recents. */
  updatedAt?: string;
  /** Archived projects are hidden from the sidebar dropdown but kept in storage. */
  archived?: boolean;
};
