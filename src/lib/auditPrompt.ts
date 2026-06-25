import type { CampaignPrompt, ProjectAsset } from "../types";

const DEFAULT_PROJECT_ROOT = "C:\\Sites\\my-project";
const DEFAULT_OUTPUT_BASENAME = "my-project";

function slugifyFilename(value: string): string {
  return (value || DEFAULT_OUTPUT_BASENAME)
    .trim()
    .replace(/[/\\]+$/g, "")
    .split(/[/\\]/)
    .filter(Boolean)
    .pop()
    ?.replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || DEFAULT_OUTPUT_BASENAME;
}

export function buildProjectExportPowerShell(projectRoot = DEFAULT_PROJECT_ROOT, output?: string, projectName?: string): string {
  const outputPath = output ?? `C:\\Users\\$env:USERNAME\\Downloads\\${slugifyFilename(projectName || projectRoot)}-ai-review-pack.xml`;
  return `# AI REVIEW PACK EXPORT XML

$projectRoot = "${projectRoot}"
$output = "${outputPath}"

$include = @(
  "*.ts","*.tsx","*.js","*.jsx","*.mjs","*.cjs",
  "*.json","*.css","*.md","*.yml","*.yaml","*.html"
)

$excludeDirs = @(
  "node_modules", ".next", "dist", "build", "out",
  ".git", ".turbo", ".vercel", ".cache", "coverage"
)

Remove-Item -LiteralPath $output -ErrorAction SilentlyContinue

$projectRoot = (Get-Item -LiteralPath $projectRoot).FullName

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
  const outputBase = `${(projectRoot.split(/[\\/]/).filter(Boolean).pop() || "launchfoundry").replace(/[^a-z0-9_-]/gi, "-")}-asset-review`;
  const output = `C:\\Users\\$env:USERNAME\\Downloads\\${outputBase}.json`;
  const htmlOutput = `C:\\Users\\$env:USERNAME\\Downloads\\${outputBase}.html`;
  const pdfOutput = `C:\\Users\\$env:USERNAME\\Downloads\\${outputBase}.pdf`;
  const assetList = assets.map(a => ({
    id: a.id,
    filename: a.filename,
    path: a.path,
    type: a.type,
    tags: a.tags,
    currentRole: a.role ?? "unassigned",
  }));

  return `# LAUNCHFOUNDRY ASSET REVIEW EXPORT
# Run this after a folder scan. It creates:
# 1) JSON metadata for all scanned assets
# 2) an HTML visual contact sheet
# 3) a PDF contact sheet if Microsoft Edge or Chrome is available

$projectRoot = "${projectRoot || "C:\\Sites\\my-project"}"
$output = "${output}"
$htmlOutput = "${htmlOutput}"
$pdfOutput = "${pdfOutput}"

$assetsJson = @'
${JSON.stringify(assetList, null, 2)}
'@

$assets = $assetsJson | ConvertFrom-Json
$projectRoot = (Get-Item -LiteralPath $projectRoot -ErrorAction SilentlyContinue).FullName
Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue
$visualTypes = @("image", "logo", "screenshot", "video")

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

  $lowerPath = $item.FullName.ToLowerInvariant()
  $suggestedUse = @()
  if ($lowerPath -match "logo|brand|mark") { $suggestedUse += "endcard" }
  if ($lowerPath -match "before|after|result|proof|case|testimonial|review") { $suggestedUse += "proof" }
  if ($lowerPath -match "hero|cover|banner|screenshot|screen") { $suggestedUse += "opener" }
  if ($lowerPath -match "process|work|shop|detail|clip|broll|b-roll") { $suggestedUse += "broll" }
  if ($item.Length -lt 12000) { $suggestedUse += "possibly-too-small" }

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
    visualReview = $asset.type -in $visualTypes
    suggestedUseFromPath = $suggestedUse
  }
}

$results | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $output -Encoding UTF8

$visualAssets = @($results | Where-Object { $_.exists -and $_.visualReview })
$cards = foreach ($asset in $visualAssets) {
  $safePath = [System.Net.WebUtility]::HtmlEncode($asset.path)
  $safeName = [System.Net.WebUtility]::HtmlEncode($asset.filename)
  $safeId = [System.Net.WebUtility]::HtmlEncode($asset.id)
  $safeType = [System.Net.WebUtility]::HtmlEncode($asset.type)
  $dim = if ($asset.width -and $asset.height) { "$($asset.width)x$($asset.height)" } else { "dimensions unknown" }
  $sizeKb = [math]::Round(($asset.sizeBytes / 1KB), 1)
  $fileUri = ([System.Uri]$asset.path).AbsoluteUri
  $media = if ($asset.type -eq "video") {
    "<div class='video-box'>VIDEO<br/><span>No thumbnail generated</span></div>"
  } else {
    "<img src='$fileUri' alt='$safeName' />"
  }
  "<section class='card'>$media<div class='meta'><strong>$safeId</strong><span>$safeName</span><small>$safeType | $dim | $sizeKb KB</small><code>$safePath</code></div></section>"
}

$html = @"
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>LaunchFoundry Asset Review</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #15110d; }
    h1 { font-size: 24px; margin: 0 0 6px; }
    p { margin: 0 0 18px; color: #5b534a; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .card { break-inside: avoid; border: 1px solid #cfc7ba; border-radius: 8px; padding: 10px; }
    img { width: 100%; height: 170px; object-fit: contain; background: #f5f1eb; border-radius: 4px; }
    .video-box { height: 170px; display: grid; place-items: center; text-align: center; background: #18130f; color: #fff; border-radius: 4px; }
    .video-box span { font-size: 11px; color: #c9c1b5; }
    .meta { display: grid; gap: 4px; margin-top: 8px; font-size: 12px; }
    .meta strong { font-family: Consolas, monospace; color: #9a5a18; }
    .meta small { color: #6b6258; }
    code { font-size: 10px; white-space: pre-wrap; word-break: break-all; color: #4f453b; }
    @page { size: letter; margin: 0.35in; }
  </style>
</head>
<body>
  <h1>LaunchFoundry Asset Review</h1>
  <p>Attach this PDF/HTML to ChatGPT or Claude with the asset picker prompt. Use the IDs printed on each card.</p>
  <div class="grid">
    $($cards -join [Environment]::NewLine)
  </div>
</body>
</html>
"@

$html | Set-Content -LiteralPath $htmlOutput -Encoding UTF8

$browser = @(
  "$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe",
  "\${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe",
  "$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe",
  "\${env:ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe"
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if ($browser) {
  $htmlUri = ([System.Uri]$htmlOutput).AbsoluteUri
  Start-Process -FilePath $browser -ArgumentList @("--headless", "--disable-gpu", "--print-to-pdf=$pdfOutput", $htmlUri) -Wait -WindowStyle Hidden
}

Write-Host "LaunchFoundry asset metadata created: $output"
Write-Host "LaunchFoundry visual contact sheet created: $htmlOutput"
if (Test-Path -LiteralPath $pdfOutput) {
  Write-Host "LaunchFoundry visual PDF created: $pdfOutput"
} else {
  Write-Host "PDF was not created automatically. Open the HTML file and print/save as PDF."
}
Write-Host "Assets checked: $($assets.Count)"
Write-Host "Visual assets on contact sheet: $($visualAssets.Count)"`;
}

export function buildAssetShortlistPrompt(
  projectName: string,
  assets: ProjectAsset[],
  sourceExcerpts: Record<string, string> = {},
  assetMetadata = ""
): string {
  return `You are helping LaunchFoundry choose the best assets from an uploaded website/app scan.

Goal:
Pick the assets, code facts, and content proof most likely to make good reels, clips, social posts, and image-generation prompts. Focus on visual clarity, proof, relevance to the product/service, and whether an asset can support a 9:16 short-form video.

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
  "reelPlan": {
    "openerAssetIds": [],
    "proofAssetIds": [],
    "brollAssetIds": [],
    "endcardAssetIds": [],
    "assetsToAvoid": []
  },
  "clipIdeas": [
    {
      "title": "",
      "assetIds": [],
      "whyTheseAssets": "",
      "missingFootage": []
    }
  ],
  "imageGenerationReferences": [
    {
      "assetIds": [],
      "prompt": "",
      "negativePrompt": "",
      "usage": "background|product-hero|before-after|thumbnail|end-card"
    }
  ],
  "codeOrContentFindings": [
    {
      "sourcePath": "",
      "finding": "",
      "howToUseInCampaign": ""
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
- If a PDF/HTML contact sheet is attached, inspect it and prefer visually clear, non-duplicate, high-resolution assets.
- If PowerShell metadata is provided, use dimensions/file sizes to prefer larger, sharper images and identify weak assets.
- Use code/content findings only when supported by source excerpts, README, package.json, visible UI text, or filenames.
- For imageGenerationReferences, write prompts that reference the attached images by asset ID and describe what to preserve.
- Do not invent asset IDs.

Context inventory:
- ${assets.length} assets detected.
- Source excerpts available: ${Object.keys(sourceExcerpts).join(", ") || "none"}.

Asset inventory:
\`\`\`json
${JSON.stringify(assets.map(summarizeAsset), null, 2)}
\`\`\`
${assetMetadata.trim() ? `
PowerShell asset review metadata:
\`\`\`json
${assetMetadata.trim()}
\`\`\`
` : `
PowerShell asset review metadata:
Not provided yet. If the user can provide it, prefer waiting for metadata and the PDF/HTML contact sheet before making final asset choices.
`}`;
}

export function buildCombinedBriefCampaignPrompt(
  projectName: string,
  sourceExcerpts: Record<string, string>,
  assets: ProjectAsset[],
  prompt: CampaignPrompt,
  assetMetadata = ""
): string {
  return `You are helping LaunchFoundry understand an uploaded website/app, choose the best assets, and turn everything into effective short-form video ideas.

Read the attached project/code context. First infer the product/design brief. Then choose the best assets for video. Then create three marketing campaign concepts using only supported facts from the code, README, visible UI text, metadata, and assets.

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
  },
  "assetRoles": [
    {
      "assetId": "",
      "role": "opener|proof|broll|endcard|weak",
      "reason": "",
      "confidence": 0
    }
  ],
  "reelPlan": {
    "openerAssetIds": [],
    "proofAssetIds": [],
    "brollAssetIds": [],
    "endcardAssetIds": [],
    "assetsToAvoid": []
  },
  "clipIdeas": [
    {
      "title": "",
      "assetIds": [],
      "whyTheseAssets": "",
      "missingFootage": []
    }
  ],
  "imageGenerationReferences": [
    {
      "assetIds": [],
      "prompt": "",
      "negativePrompt": "",
      "usage": "background|product-hero|before-after|thumbnail|end-card"
    }
  ],
  "codeOrContentFindings": [
    {
      "sourcePath": "",
      "finding": "",
      "howToUseInCampaign": ""
    }
  ]
}

Rules:
- Return exactly three concepts.
- Use asset IDs from the provided context when useful.
- Put asset IDs directly into concept.scenes[].assetIds wherever the visual should use a real scanned asset.
- Also fill assetRoles so LaunchFoundry can label the asset list automatically.
- If a PDF/HTML contact sheet is attached, inspect it and prefer clear, high-resolution, non-duplicate visuals.
- For imageGenerationReferences, write prompts that reference attached images by asset ID and describe what to preserve.
- Do not invent pricing, guarantees, certifications, testimonials, or proof.
- If a fact is unclear, put it in risksOrMissingContext instead of guessing.
- Do not invent asset IDs.

Context inventory:
- ${assets.length} files/assets detected.
- Source excerpts available: ${Object.keys(sourceExcerpts).join(", ") || "none"}.

Asset inventory:
\`\`\`json
${JSON.stringify(assets.map(summarizeAsset), null, 2)}
\`\`\`
${assetMetadata.trim() ? `
PowerShell asset review metadata:
\`\`\`json
${assetMetadata.trim()}
\`\`\`
` : `
PowerShell asset review metadata:
Not provided. If a contact sheet or metadata file is attached in the chat, use it when choosing assets.
`}`;
}
