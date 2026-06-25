# LaunchFoundry Lite — desktop shell (Tauri)

A native Tauri 2 window around the React UI, with a Rust `render_reel` command that drives Remotion directly — no PowerShell, no SmartScreen quarantine.

## Phases

| Phase | What | Status |
|---|---|---|
| **D-1** | Tauri shell + Rust render command + stdout streaming | ✅ shipped |
| **D-2** | Engine path resolution + `--browser-executable` for bundled Chrome | ✅ shipped |
| **D-3** | Production installer config: icon set, NSIS per-user install, prep script | ✅ shipped |

## One-time prerequisites

| Tool | Why | Install |
|---|---|---|
| Rust toolchain | Compiles the Tauri Rust shell | https://rustup.rs |
| MSVC C++ build tools | Required by Rust on Windows. Pick "Desktop development with C++" in the Visual Studio Installer | https://visualstudio.microsoft.com/downloads/ |
| WebView2 runtime | The native webview Tauri renders into | Preinstalled on Windows 11 |
| Node 18+ | Required by Remotion in the engine | https://nodejs.org/ |

After `rustup` is installed, restart your terminal so `cargo` is on PATH.

## Run in development

From the project root (`C:\Sites\launchfoundry-lite`):

```bash
npm install              # one-time, also installs @tauri-apps/cli
npm run tauri:dev
```

First run pulls + compiles the Tauri crates (5–10 min). Subsequent runs are ~3 seconds. The Vite dev server starts automatically (port 5173) and the native window opens pointed at it.

In dev mode the engine resolves to `C:\Sites\brittenwoodworking-reels` (the shared sibling), so you don't need to populate the bundled `engine/` directory unless you want to test the packaged path locally.

## Build a distributable installer (D-3 flow)

### 1. Populate the bundled engine

A helper script does this automatically:

```powershell
# From repo root
powershell -ExecutionPolicy Bypass -File scripts\prepare-engine-bundle.ps1
```

Override the source path if your engine lives elsewhere:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\prepare-engine-bundle.ps1 -SourceEngine C:\path\to\reels-engine
```

The script:
- Copies the engine into `<repo>/engine/` (skipping `node_modules`, `.git`, `out`, `target`)
- Runs `npm install --omit=dev` for a smaller bundle (~300 MB vs ~500 MB full install)
- Fetches the Chrome Headless Shell via `npx remotion browser ensure`
- Copies the shell into `engine/browser/win64/` where the Rust render code looks for it

> Add `-Force` if you want to wipe and recopy a previously-populated engine.

### 2. Flip the Tauri bundle.resources line

Edit [src-tauri/tauri.conf.json](tauri.conf.json) — `bundle.resources`:

```json
"resources": {
  "../engine/.lf-engine-placeholder": "engine/.lf-engine-placeholder"
}
```

Change to:

```json
"resources": {
  "../engine": "engine"
}
```

(Leave the placeholder version in place until you're actually building, so dev mode + `tauri dev` stay fast.)

### 3. Build

```bash
npm run tauri:build
```

First build: ~10-15 min including engine copy into the bundle. Outputs:

- **`.msi`** — `src-tauri/target/release/bundle/msi/LaunchFoundry Lite_0.1.0_x64_en-US.msi`
- **`.exe` (NSIS)** — `src-tauri/target/release/bundle/nsis/LaunchFoundry Lite_0.1.0_x64-setup.exe`

The NSIS installer is configured for **per-user install** (no admin needed) which sidesteps the most common Windows installer friction.

### 4. (Optional) Code signing

Without a code-signing certificate, the installer triggers SmartScreen on first download. To sign:

1. Acquire an EV or OV code-signing certificate (DigiCert, Sectigo, SSL.com — ~$200-500/year)
2. Add to `tauri.conf.json` → `bundle.windows.signCommand`:

```json
"windows": {
  "signCommand": "signtool sign /fd SHA256 /a /t http://timestamp.digicert.com %1",
  ...
}
```

3. Set `WIX_SIGN_TOOL_PATH` env var to point at your `signtool.exe`
4. Rebuild

Without signing, distribute via direct download and instruct users to click **More info → Run anyway** on the SmartScreen prompt.

## Engine resolution (D-2 reference)

At render time, Rust looks for the engine in this order:

1. **`<resource_dir>/engine`** — the bundled engine in a packaged build. Detected by the presence of `node_modules/remotion/package.json`.
2. **`req.reels_engine`** — the configured shared path. Dev fallback.

If a bundled Chrome Headless Shell is found at `<engine>/browser/<platform>/chrome[.exe]` (or the Remotion 4.0.300+ nested path `browser/chrome-headless-shell/<platform>/chrome[.exe]`), the render command adds `--browser-executable=<path>`. Supported platform subfolders: `win64`, `mac-arm64`, `mac-x64`, `linux`.

## Files

```
src-tauri/
  Cargo.toml              ← Rust deps (Tauri 2 + shell + dialog plugins)
  build.rs                ← Tauri build script
  tauri.conf.json         ← window + bundle + NSIS + WIX config
  capabilities/
    default.json          ← perms granted to the main window
  icons/
    32x32.png             ← Tauri 2 required sizes
    128x128.png
    128x128@2x.png
    icon.png              ← hi-res (512px)
    icon.ico              ← multi-resolution Windows
    icon.icns             ← macOS placeholder
  src/
    main.rs               ← entry point
    lib.rs                ← render_reel, cancel_render, resolve_engine_path,
                            resolve_bundled_browser

scripts/
  prepare-engine-bundle.ps1  ← D-3 helper: populate engine/ from sibling repo

engine/                   ← populated by prepare-engine-bundle.ps1 before tauri build
  .lf-engine-placeholder  ← keeps the dev tree happy when engine isn't populated
```

## Replacing the placeholder icon

The current icon is a generic brass-gradient "LF" chip generated by PowerShell — it works but isn't artistic. To replace:

1. Make a 512×512 PNG of your real logo
2. Use [Tauri's icon tool](https://tauri.app/v2/develop/icons) to generate the full set:

```bash
npx @tauri-apps/cli icon path/to/your/logo.png
```

This writes the full Tauri 2 icon set (including `icon.icns` for real Mac builds and `icon.ico` with all sizes) into `src-tauri/icons/`. Commit and rebuild.
