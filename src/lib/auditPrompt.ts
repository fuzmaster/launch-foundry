import type { ProjectAsset } from "../types";

const DEFAULT_PROJECT_ROOT = "C:\\Sites\\my-project";
const DEFAULT_OUTPUT = "C:\\Users\\$env:USERNAME\\Downloads\\my-project-ai-review-pack.xml";

export function buildProjectExportPowerShell(projectRoot = DEFAULT_PROJECT_ROOT, output = DEFAULT_OUTPUT): string {
  return `# AI REVIEW PACK EXPORT XML

$projectRoot = "${projectRoot}"
$output = "${output}"

$include = @(
  "*.ts","*.tsx","*.js","*.jsx","*.mjs","*.cjs",
  "*.json","*.css","*.md","*.yml","*.yaml","*.html"
)

$excludeDirs = @(
  "node_modules", ".next", "dist", "build", "out",
  ".git", ".turbo", ".vercel", ".cache", "coverage"
)

Remove-Item -LiteralPath $output -ErrorAction SilentlyContinue

$projectRoot = (Get-Item $projectRoot).FullName

$files = Get-ChildItem -Path $projectRoot -Recurse -File -Include $include |
  Where-Object {
    $fullPath = $_.FullName
    $isExcluded = $false

    foreach ($dir in $excludeDirs) {
      if ($fullPath -match "[\\/\\\\]$dir[\\/\\\\]") {
        $isExcluded = $true
        break
      }
    }
    return (-not $isExcluded)
  } | Sort-Object FullName

Add-Content -LiteralPath $output -Value "<project_files>\`n"

foreach ($f in $files) {
  $relativePath = $f.FullName.Substring($projectRoot.Length + 1).Replace('\\', '/')

  Add-Content -LiteralPath $output -Value "  <file path=\`"$relativePath\`">"
  Add-Content -LiteralPath $output -Value "<![CDATA["

  $content = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction SilentlyContinue
  if ($null -ne $content) {
    Add-Content -LiteralPath $output -Value $content
  }

  Add-Content -LiteralPath $output -Value "]]></file>\`n"
}

Add-Content -LiteralPath $output -Value "</project_files>"

Write-Host "AI Review Pack created: $output"
Write-Host "Total files included: $($files.Count)"`;
}

export function buildWebsiteAuditPrompt(projectName: string, sourceExcerpts: Record<string, string>, assets: ProjectAsset[]): string {
  return `You are a senior product designer, conversion copywriter, frontend engineer, and QA reviewer.

Audit this website/application from the uploaded project context. Treat the code as the source of truth.

Project: ${projectName || "Uploaded website/app"}

What I need:
1. Product summary: what this site does, who it appears to serve, and the primary user journey.
2. Design audit: layout, visual hierarchy, typography, color, spacing, interaction polish, responsive/mobile risks.
3. Content audit: clarity, trust, calls to action, missing explanations, confusing labels, accessibility of the copy.
4. Technical audit: likely framework, routing/pages, important components, build risks, broken links or missing states you can infer from code.
5. LaunchFoundry readiness: what brand facts, audience facts, proof points, assets, offers, and CTAs can be extracted.
6. Concrete fixes: prioritized list of changes with file paths when possible.
7. Product/design brief: a structured JSON object LaunchFoundry can paste back in.

Return format:
- Start with a short plain-English diagnosis.
- Then give a prioritized checklist.
- Then include this JSON object:

\`\`\`json
{
  "projectName": "",
  "businessName": "",
  "category": "",
  "oneLiner": "",
  "offerSummary": "",
  "targetCustomer": "",
  "tone": "",
  "proofPoints": [],
  "differentiators": [],
  "avoidClaims": [],
  "cta": "",
  "designBrief": {
    "visualStyle": "",
    "layoutNotes": [],
    "mobileNotes": [],
    "accessibilityNotes": [],
    "conversionOpportunities": []
  },
  "campaignAngles": [],
  "missingAssets": [],
  "recommendedNextSteps": []
}
\`\`\`

Context inventory:
- ${assets.length} files/assets detected.
- Source excerpts available: ${Object.keys(sourceExcerpts).join(", ") || "none"}.

Be specific. If something is a guess, label it as a guess.`;
}

export function buildProductDesignBriefPrompt(projectName: string, sourceExcerpts: Record<string, string>, assets: ProjectAsset[]): string {
  return `You are helping LaunchFoundry understand an uploaded website/app so it can generate better marketing campaigns.

Read the attached project/code context and create a detailed product/design brief. Focus on facts that can be inferred from the code, README, package.json, visible UI text, metadata, and assets.

Project: ${projectName || "Uploaded website/app"}

Return only valid JSON:

{
  "projectName": "",
  "businessName": "",
  "websiteOrAppType": "",
  "category": "",
  "oneLiner": "",
  "primaryAudience": "",
  "secondaryAudiences": [],
  "coreProblemSolved": "",
  "primaryOffer": "",
  "mainUserJourney": [],
  "keyScreensOrPages": [],
  "visibleFeatures": [],
  "visualIdentity": {
    "colors": [],
    "fonts": [],
    "styleKeywords": [],
    "layoutPatterns": []
  },
  "voiceAndTone": "",
  "trustSignals": [],
  "callsToAction": [],
  "proofPoints": [],
  "differentiators": [],
  "risksOrMissingContext": [],
  "recommendedCampaignAngles": [],
  "recommendedAssetsToCollect": [],
  "notesForLaunchFoundry": ""
}

Context inventory:
- ${assets.length} files/assets detected.
- Source excerpts available: ${Object.keys(sourceExcerpts).join(", ") || "none"}.

Do not invent facts. Use empty strings or empty arrays where the code does not provide enough evidence.`;
}
