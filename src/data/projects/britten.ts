import type { Project } from "./types";
import { woodworkingBrandProfile } from "../mockBrand";
import { mockAssets } from "../mockAssets";
import { mockCampaignConcepts } from "../mockCampaigns";

export const brittenProject: Project = {
  id: "britten",
  label: "Britten Woodworking",
  blurb: "18th-century methods. Installed today. Facebook Reels for CT homeowners.",
  brand: woodworkingBrandProfile,
  assets: mockAssets,
  concepts: mockCampaignConcepts,
  defaultConceptId: "concept-curved-stairway",
  defaultPrompt: {
    id: "prompt-woodworking-facebook",
    projectName: "18th Century Woodworking Services",
    platform: "facebook_reel",
    goal:
      "Create a 7-day Facebook Reels campaign for Britten Woodworking. Reach CT and Greater Hartford homeowners restoring older homes who care about period-accurate work over builder-grade replacements. Use the existing reels pipeline. Produce 3 concepts and pick one to render.",
    audienceHint: "Older CT homeowners, historic-home restorers, designers working on period millwork.",
    toneHint: "Confident craftsperson. Trustworthy, practical, traditional. Not salesy, not meme-driven.",
    offerHint: "Custom cabinetry, millwork, paneling, shutters, storm doors, weatherstrip — site-built and period-accurate.",
    constraints: [
      "No pricing or 'starts at' figures",
      "No 'best in CT' superlatives",
      "No turnaround promises",
      "No licensing claims unless verified per post",
    ],
    createdAt: "2026-06-17T00:00:00.000Z",
  },
};
