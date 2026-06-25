#requires -Version 5
<#
.SYNOPSIS
  Populate the engine/ directory for a bundled Tauri build.

.DESCRIPTION
  Copies the shared Remotion engine into <repo>/engine/, runs a production-only
  npm install to keep the install small, fetches the Chrome Headless Shell, and
  rearranges it into the platform-specific path the Rust side expects
  (<engine>/browser/win64/chrome.exe on Windows).

  After this script finishes, edit src-tauri/tauri.conf.json bundle.resources:
    "../engine": "engine"
  ...then run `npm run tauri:build`.

.PARAMETER SourceEngine
  Where to copy the engine FROM. Defaults to C:\Sites\brittenwoodworking-reels.

.PARAMETER Force
  If set, deletes any existing engine/ before copying.
#>
param(
    [string]$SourceEngine = 'C:\Sites\brittenwoodworking-reels',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $repoRoot 'engine'

if (-not (Test-Path $SourceEngine)) {
    Write-Host "Source engine not found at $SourceEngine" -ForegroundColor Red
    exit 1
}

if ((Test-Path $dest) -and -not $Force) {
    $real = Get-Item $dest
    if ($real.GetFiles().Count -gt 1 -or $real.GetDirectories().Count -gt 0) {
        Write-Host "engine/ already populated. Pass -Force to wipe and recopy." -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "[1/4] Cleaning $dest..." -ForegroundColor Cyan
Remove-Item -LiteralPath $dest -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $dest | Out-Null

Write-Host "[2/4] Copying engine from $SourceEngine..." -ForegroundColor Cyan
# robocopy is much faster than Copy-Item for large trees
robocopy $SourceEngine $dest /E /NFL /NDL /NJH /NJS /NP /XD node_modules .git out target | Out-Null

Write-Host "[3/4] Running production-only npm install in engine..." -ForegroundColor Cyan
Push-Location $dest
try {
    npm install --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

    Write-Host "[4/4] Fetching Chrome Headless Shell via Remotion..." -ForegroundColor Cyan
    & npx remotion browser ensure
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Note: 'remotion browser ensure' failed. You may need to run it manually." -ForegroundColor Yellow
    }

    # Look for the Chrome shell wherever Remotion put it and copy into browser/win64/
    $browserDir = Join-Path $dest 'browser\win64'
    New-Item -ItemType Directory -Path $browserDir -Force | Out-Null
    $candidates = @(
        # Modern (4.0.300+): chrome-headless-shell subdir
        Get-ChildItem -Path $dest -Recurse -Filter 'chrome-headless-shell.exe' -ErrorAction SilentlyContinue
        Get-ChildItem -Path $dest -Recurse -Filter 'chrome.exe' -ErrorAction SilentlyContinue
        # Cache fallback: %LOCALAPPDATA%\node-gyp\Cache or %USERPROFILE%\.cache\remotion
        Get-ChildItem -Path "$env:USERPROFILE\.cache\remotion" -Recurse -Filter 'chrome*.exe' -ErrorAction SilentlyContinue
    ) | Where-Object { $_ } | Select-Object -First 1

    if ($candidates) {
        $shellExe = $candidates.FullName
        $shellDir = Split-Path -Parent $shellExe
        Write-Host "  Found Chrome at $shellExe" -ForegroundColor Green
        Copy-Item -Path "$shellDir\*" -Destination $browserDir -Recurse -Force
        Write-Host "  Copied to $browserDir" -ForegroundColor Green
    } else {
        Write-Host "  Couldn't locate the Chrome Headless Shell automatically." -ForegroundColor Yellow
        Write-Host "  Run 'npx remotion browser ensure' manually inside $dest, then copy chrome.exe + DLLs into $browserDir." -ForegroundColor Yellow
    }
}
finally {
    Pop-Location
}

$engineSize = (Get-ChildItem -Path $dest -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ""
Write-Host "Engine populated. Total size: $([math]::Round($engineSize, 1)) MB" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Edit src-tauri/tauri.conf.json -> bundle.resources, change:" -ForegroundColor Gray
Write-Host '       "../engine/.lf-engine-placeholder": "engine/.lf-engine-placeholder"' -ForegroundColor Gray
Write-Host "     to:" -ForegroundColor Gray
Write-Host '       "../engine": "engine"' -ForegroundColor Gray
Write-Host "  2. Run: npm run tauri:build" -ForegroundColor Gray
Write-Host "  3. Find the installers under src-tauri\target\release\bundle\" -ForegroundColor Gray
