import type { CampaignPrompt, ProjectAsset } from "../types";

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

function summarizeAsset(asset: ProjectAsset) {
  return {
    id: asset.id,
    filename: asset.filename,
    path: asset.path,
    type: asset.type,
    width: asset.width,
    height: asset.height,
    durationSeconds: asset.durationSeconds,
    tags: asset.tags,
    currentRole: asset.role ?? "unassigned",
    notes: asset.notes,
  };
}

export function buildAssetMetadataPowerShell(projectRoot: string, assets: ProjectAsset[]): string {
  const outputName = `${(projectRoot.split(/[\\/]/).filter(Boolean).pop() || "launchfoundry").replace(/[^a-z0-9_-]/gi, "-")}-asset-metadata.json`;
  const output = `C:\\Users\\$env:USERNAME\\Downloads\\${outputName}`;
  const assetList = assets.map(a => ({
    id: a.id,
    filename: a.filename,
    path: a.path,
    type: a.type,
    tags: a.tags,
    currentRole: a.role ?? "unassigned",
  }));

  return `# LAUNCHFOUNDRY ASSET METADATA EXPORT
# Run this after a folder scan when you want AI to choose the strongest visuals.

$projectRoot = "${projectRoot || "C:\\Sites\\my-project"}"
$output = "${output}"

$assetsJson = @'
${JSON.stringify(assetList, null, 2)}
'@

$assets = $assetsJson | ConvertFrom-Json
$projectRoot = (Get-Item -LiteralPath $projectRoot -ErrorAction SilentlyContinue).FullName
Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue

$results = foreach ($asset in $assets) {
  $assetPath = [string]$asset.path
  if ($projectRoot -and -not [System.IO.Path]::IsPathRooted($assetPath)) {
    $assetPath = Join-Path $projectRoot $assetPath
  }

  if (-not (Test-Path -LiteralPath $assetPath)) {
    [pscustomobject]@{
      id = $asset.id
      filename = $asset.filename
      path = $asset.path
      type = $asset.type
      exists = $false
      reason = "File not found at resolved path"
      tags = $asset.tags
      currentRole = $asset.currentRole
    }
    continue
  }

  $item = Get-Item -LiteralPath $assetPath
  $width = $null
  $height = $null
  if ($asset.type -in @("image", "logo", "screenshot")) {
    try {
      $img = [System.Drawing.Image]::FromFile($item.FullName)
      $width = $img.Width
      $height = $img.Height
      $img.Dispose()
    } catch {}
  }

  [pscustomobject]@{
    id = $asset.id
    filename = $asset.filename
    path = $item.FullName
    type = $asset.type
    exists = $true
    extension = $item.Extension
    sizeBytes = $item.Length
    lastWriteTime = $item.LastWriteTime.ToString("s")
    width = $width
    height = $height
    tags = $asset.tags
    currentRole = $asset.currentRole
  }
}

$results | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $output -Encoding UTF8
Write-Host "LaunchFoundry asset metadata created: $output"
Write-Host "Assets checked: $($assets.Count)"`;
}

export function buildAssetShortlistPrompt(
  projectName: string,
  assets: ProjectAsset[],
  sourceExcerpts: Record<string, string> = {},
  assetMetadata = ""
): string {
  return `You are helping LaunchFoundry choose the best assets from an uploaded website/app scan.

Goal:
Pick the assets most likely to make good campaign videos and social posts. Focus on visual clarity, proof, relevance to the product/service, and whether the asset can support a 9:16 short-form video.

Project: ${projectName || "Uploaded website/app"}

Asset roles:
- opener: the strongest first visual or first 1-3 seconds.
- proof: evidence, before/after, product result, UI result, testimonial screenshot, real work.
- broll: useful supporting visuals, process shots, secondary UI, detail shots.
- endcard: logo, brand mark, contact card, strong final frame.
- weak: duplicate, tiny, blurry, generic, irrelevant, or not useful for a campaign.

Return only valid JSON in this shape:

{
  "assetRoles": [
    {
      "assetId": "",
      "role": "opener|proof|broll|endcard|weak",
      "reason": "",
      "confidence": 0
    }
  ],
  "recommendedSceneAssets": [
    {
      "sceneId": "s1",
      "assetIds": [],
      "reason": ""
    }
  ],
  "missingAssets": [],
  "notes": []
}

Rules:
- Use only asset IDs from the inventory below.
- Mark at least one opener if there is any usable image, video, logo, or screenshot.
- Mark at least two proof assets if they exist.
- Mark logos or clean brand cards as endcard, not proof.
- Mark code files, tiny icons, broken files, duplicates, and unrelated assets as weak.
- If you cannot inspect pixels, use filename, path, type, tags, dimensions, and metadata to make the best conservative choice.
- If the user pasted PowerShell metadata below the inventory, use it to prefer larger, sharper assets.
- Do not invent asset IDs.

Context inventory:
- ${assets.length} assets detected.
- Source excerpts available: ${Object.keys(sourceExcerpts).join(", ") || "none"}.

Asset inventory:
\`\`\`json
${JSON.stringify(assets.map(summarizeAsset), null, 2)}
\`\`\`
${assetMetadata.trim() ? `
PowerShell asset metadata:
\`\`\`json
${assetMetadata.trim()}
\`\`\`
` : `
PowerShell asset metadata:
Not provided yet. If the user can provide it, prefer waiting for metadata before making final asset choices.
`}`;
}

export function buildCombinedBriefCampaignPrompt(
  projectName: string,
  sourceExcerpts: Record<string, string>,
  assets: ProjectAsset[],
  prompt: CampaignPrompt
): string {
  return `You are helping LaunchFoundry understand an uploaded website/app and immediately turn it into campaign ideas.

Read the attached project/code context. First infer the product/design brief. Then create three marketing campaign concepts using only supported facts from the code, README, visible UI text, metadata, and assets.

Project: ${projectName || "Uploaded website/app"}

Campaign goal:
${prompt.goal || "Create a practical launch campaign for this project."}

Target platform: ${prompt.platform}
Audience hint: ${prompt.audienceHint || "infer from the project"}
Tone hint: ${prompt.toneHint || "infer from the project"}
Offer hint: ${prompt.offerHint || "infer from the project"}

Return only valid JSON in this shape:

{
  "brand": {
    "projectName": "",
    "businessName": "",
    "websiteUrl": "",
    "category": "",
    "oneLiner": "",
    "offerSummary": "",
    "targetCustomer": "",
    "tone": "",
    "colors": [],
    "fonts": [],
    "proofPoints": [],
    "differentiators": [],
    "avoidClaims": [],
    "cta": ""
  },
  "concepts": [
    {
      "id": "concept-1",
      "title": "",
      "platform": "${prompt.platform}",
      "targetAudience": "",
      "angle": "",
      "hook": "",
      "promise": "",
      "format": "",
      "durationSeconds": 15,
      "scenes": [
        {
          "id": "s1",
          "startSecond": 0,
          "endSecond": 3,
          "visual": "",
          "assetIds": [],
          "textOverlay": "",
          "voiceover": "",
          "motionNotes": ""
        }
      ],
      "recommendedAssets": [],
      "missingAssets": [],
      "caption": "",
      "cta": "",
      "score": {
        "audienceFit": 0,
        "platformFit": 0,
        "assetFit": 0,
        "clarity": 0,
        "effort": 0,
        "total": 0,
        "reason": ""
      }
    }
  ],
  "recommendation": "",
  "productBriefNotes": {
    "mainUserJourney": [],
    "keyScreensOrPages": [],
    "visibleFeatures": [],
    "risksOrMissingContext": [],
    "recommendedAssetsToCollect": []
  }
}

Rules:
- Return exactly three concepts.
- Use asset IDs from the provided context when useful.
- Do not invent pricing, guarantees, certifications, testimonials, or proof.
- If a fact is unclear, put it in risksOrMissingContext instead of guessing.

Context inventory:
- ${assets.length} files/assets detected.
- Source excerpts available: ${Object.keys(sourceExcerpts).join(", ") || "none"}.`;
}
