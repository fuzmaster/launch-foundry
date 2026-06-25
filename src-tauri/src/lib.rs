//! LaunchFoundry Lite — Tauri shell (Round D-1).
//!
//! Exposes one main command to the React UI: `render_reel`, which writes the
//! generated composition files into <project>/.lf-reels/src/, links the engine
//! node_modules, then invokes `npx remotion render` per picked output and
//! streams each stdout line back to the UI via a Tauri event.
//!
//! The render pipeline mirrors what the PowerShell script does today:
//!   1. Verify engine + project paths exist
//!   2. Install missing @remotion/* companion packages pinned to engine version
//!   3. Create .lf-reels/node_modules junction → engine's node_modules
//!   4. Write index.ts + Root.tsx + Reel.tsx + data.ts into .lf-reels/src/
//!   5. Copy referenced project assets into engine's public/photos/
//!   6. Decode base64 dropped images into engine's public/photos/
//!   7. For each picked output, spawn `npx remotion render` with --scale + --crf
//!
//! Cancellation: a JOB_KILLER atomic + the child handle are shared with the
//! render-loop, so a UI cancel call SIGKILLs the in-flight Remotion process.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

use base64::Engine;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

// ─── Render-job state ────────────────────────────────────────────────────────

/// Set by cancel_render() to ask the current loop to abort. The render loop
/// checks this between compositions and the in-flight spawn polls it too.
static CANCEL_REQUESTED: Lazy<AtomicBool> = Lazy::new(|| AtomicBool::new(false));

/// PID of the currently-running Remotion child, or 0 if none. We store the
/// PID rather than the Child handle so cancel_render can kill it by ID
/// without contending for the Child owned by the render thread.
static CURRENT_CHILD_PID: AtomicU32 = AtomicU32::new(0);

fn kill_pid(pid: u32) {
    if pid == 0 { return; }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F", "/T"])
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill").arg("-9").arg(pid.to_string()).status();
    }
}

// ─── Wire types — match the TS RenderRequest shape ──────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderRequest {
    pub project_home: String,
    pub reels_engine: String,
    pub slug: String,
    /// Files to write under <project>/.lf-reels/src/. Keys are the basename
    /// ("index.ts", "Root.tsx", "Reel.tsx", "data.ts"); values are full contents.
    pub source_files: HashMap<String, String>,
    /// Project-relative paths of media files to copy into engine/public/photos/.
    pub asset_sources: Vec<String>,
    /// Generated images that were dropped into the browser — base64-encoded.
    pub dropped_images: Vec<DroppedImage>,
    /// Optional soundtrack — same base64 shape as a dropped image. Decoded into
    /// engine/public/photos/&lt;filename&gt; alongside the images; the generated
    /// Reel.tsx references it via staticFile("photos/&lt;filename&gt;").
    #[serde(default)]
    pub audio: Option<DroppedImage>,
    /// Output formats to render. Each becomes one `npx remotion render` call.
    pub outputs: Vec<OutputSpec>,
    /// --scale flag value (0.5 for draft, 1.0 for standard/final).
    pub scale: f64,
    /// --crf flag value.
    pub crf: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DroppedImage {
    pub filename: String,
    pub base64: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OutputSpec {
    /// Composition ID in Root.tsx, e.g. "Reel-9x16".
    pub composition_id: String,
    /// Human label for log messages, e.g. "Reel 9:16".
    pub label: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LogEvent {
    pub level: String, // "info" | "warn" | "error" | "step"
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderResult {
    pub produced: Vec<String>,
    pub failed: Vec<String>,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn emit_log(app: &AppHandle, level: &str, message: impl Into<String>) {
    let _ = app.emit(
        "render-log",
        LogEvent { level: level.into(), message: message.into() },
    );
}

fn npm_cmd() -> &'static str {
    if cfg!(windows) { "npm.cmd" } else { "npm" }
}
fn npx_cmd() -> &'static str {
    if cfg!(windows) { "npx.cmd" } else { "npx" }
}

/// Resolve the engine's installed Remotion version by reading
/// `<engine>/node_modules/remotion/package.json`. We pin all @remotion/*
/// companion packages to the exact same version to avoid the well-known
/// "version mismatch" error.
fn read_engine_remotion_version(engine: &Path) -> Result<String, String> {
    let pkg = engine.join("node_modules").join("remotion").join("package.json");
    let bytes = std::fs::read(&pkg)
        .map_err(|e| format!("Engine remotion/package.json not found at {}: {e}. Run `npm install` in the engine first.", pkg.display()))?;
    let v: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    v.get("version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "No `version` field in engine remotion/package.json".to_string())
}

fn read_pkg_version(pkg_dir: &Path) -> Option<String> {
    let bytes = std::fs::read(pkg_dir.join("package.json")).ok()?;
    let v: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    v.get("version").and_then(|v| v.as_str()).map(|s| s.to_string())
}

/// Resolve the engine path to use for this render. D-2 lookup order:
///   1. `<resource_dir>/engine` — the bundled engine in a packaged build.
///      Recognized by the presence of `node_modules/remotion/package.json`.
///   2. `req.reels_engine` — the configured shared engine path (dev fallback).
fn resolve_engine_path(app: &AppHandle, configured: &str) -> PathBuf {
    if let Ok(res_dir) = app.path().resource_dir() {
        let bundled = res_dir.join("engine");
        if bundled.join("node_modules").join("remotion").join("package.json").exists() {
            return bundled;
        }
    }
    PathBuf::from(configured)
}

/// Resolve the bundled Chrome Headless Shell path (D-2). Mirrors Remotion's
/// own layout: `<engine>/browser/<platform>/chrome[.exe]`. Returns None if
/// not present — render falls back to Remotion's auto-download, same as before.
fn resolve_bundled_browser(engine: &Path) -> Option<PathBuf> {
    let platform = if cfg!(windows) { "win64" }
        else if cfg!(target_os = "macos") {
            if cfg!(target_arch = "aarch64") { "mac-arm64" } else { "mac-x64" }
        } else { "linux" };
    let exe = if cfg!(windows) { "chrome.exe" } else { "chrome" };
    let candidates = [
        engine.join("browser").join(platform).join(exe),
        // Remotion 4.0.300+ sometimes nests under a chrome-headless-shell subdir.
        engine.join("browser").join("chrome-headless-shell").join(platform).join(exe),
    ];
    candidates.into_iter().find(|p| p.exists())
}

/// Run `npm install --save-exact <pkg>@<version> ...` in the engine cwd.
fn npm_install_pinned(engine: &Path, pkgs_versioned: &[String], app: &AppHandle) -> Result<(), String> {
    if pkgs_versioned.is_empty() { return Ok(()); }
    emit_log(app, "step", format!("[setup] Pinning {} package(s)…", pkgs_versioned.len()));
    let mut cmd = Command::new(npm_cmd());
    cmd.arg("install").arg("--save-exact").args(pkgs_versioned).current_dir(engine);
    let status = cmd.status().map_err(|e| format!("npm install failed to launch: {e}"))?;
    if !status.success() {
        return Err(format!("npm install --save-exact exited with status {status}"));
    }
    Ok(())
}

/// Create a Windows directory junction at `link` pointing to `target`.
/// `mklink /J` is the no-admin-needed equivalent. On non-Windows we use a
/// regular symlink — but this command runs on Windows in practice.
fn ensure_node_modules_junction(link: &Path, target: &Path, app: &AppHandle) -> Result<(), String> {
    if link.exists() {
        // Existing path may be a real directory left over from a bad earlier
        // run, or already the junction we want. If it's a real directory, blow
        // it away; if it's a link, trust it.
        let md = std::fs::symlink_metadata(link).map_err(|e| e.to_string())?;
        if md.file_type().is_symlink() {
            return Ok(()); // already linked
        }
        emit_log(app, "warn", "[setup] Removing stale .lf-reels/node_modules (was a real directory)…");
        std::fs::remove_dir_all(link).map_err(|e| e.to_string())?;
    }

    #[cfg(windows)]
    {
        let status = Command::new("cmd")
            .args(["/c", "mklink", "/J"])
            .arg(link)
            .arg(target)
            .status()
            .map_err(|e| format!("mklink failed to launch: {e}"))?;
        if !status.success() {
            return Err(format!("mklink /J exited with status {status}"));
        }
    }
    #[cfg(not(windows))]
    {
        std::os::unix::fs::symlink(target, link).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn write_text(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, contents).map_err(|e| e.to_string())
}

/// Spawn `npx remotion render ...` with stdout streamed line-by-line back to
/// the UI. Honors CANCEL_REQUESTED by killing the child outright.
fn spawn_remotion_render(
    engine: &Path,
    entry: &Path,
    composition_id: &str,
    out_path: &Path,
    scale: f64,
    crf: u32,
    bundled_browser: Option<&Path>,
    app: &AppHandle,
) -> Result<(), String> {
    let mut cmd = Command::new(npx_cmd());
    cmd.arg("remotion").arg("render")
        .arg(entry)
        .arg(composition_id)
        .arg(out_path)
        .arg("--codec=h264")
        .arg(format!("--crf={crf}"))
        .arg(format!("--scale={scale}"));
    if let Some(b) = bundled_browser {
        cmd.arg(format!("--browser-executable={}", b.display()));
    }
    cmd.current_dir(engine)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // No console flash on Windows release builds (matches Genera's behavior).
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().map_err(|e| format!("Failed to launch npx remotion: {e}"))?;
    CURRENT_CHILD_PID.store(child.id(), Ordering::SeqCst);
    let stdout = child.stdout.take().ok_or_else(|| "Lost child stdout handle".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "Lost child stderr handle".to_string())?;

    // Stream stdout + stderr on worker threads. Tauri commands run on their
    // own worker thread already, so blocking the main render loop here is fine.
    let stdout_app = app.clone();
    let stdout_thread = std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().flatten() {
            emit_log(&stdout_app, "info", line);
        }
    });
    let stderr_app = app.clone();
    let stderr_thread = std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().flatten() {
            emit_log(&stderr_app, "warn", line);
        }
    });

    // Poll for cancellation alongside the child. cancel_render() sets
    // CANCEL_REQUESTED and kills the PID; try_wait will then surface a
    // non-zero status, and we report the cancellation.
    loop {
        if CANCEL_REQUESTED.load(Ordering::SeqCst) {
            kill_pid(child.id());
        }
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => {
                let _ = stdout_thread.join();
                let _ = stderr_thread.join();
                CURRENT_CHILD_PID.store(0, Ordering::SeqCst);
                if CANCEL_REQUESTED.load(Ordering::SeqCst) {
                    CANCEL_REQUESTED.store(false, Ordering::SeqCst);
                    return Err("Render cancelled by user".to_string());
                }
                if !status.success() {
                    return Err(format!("Remotion exited with status {status}"));
                }
                return Ok(());
            }
            None => std::thread::sleep(std::time::Duration::from_millis(120)),
        }
    }
}

// ─── Main command ────────────────────────────────────────────────────────────

#[tauri::command]
async fn render_reel(app: AppHandle, req: RenderRequest) -> Result<RenderResult, String> {
    // Reset cancellation flag at the start of every job.
    CANCEL_REQUESTED.store(false, Ordering::SeqCst);

    let engine = resolve_engine_path(&app, &req.reels_engine);
    if engine.as_os_str() != req.reels_engine.as_str() {
        emit_log(&app, "step", format!("[setup] Using bundled engine at {}", engine.display()));
    }
    let bundled_browser = resolve_bundled_browser(&engine);
    if let Some(b) = &bundled_browser {
        emit_log(&app, "step", format!("[setup] Using bundled Chrome at {}", b.display()));
    }
    let project_home = PathBuf::from(&req.project_home);
    let reel_dir = project_home.join(".lf-reels").join("src");
    let photos = engine.join("public").join("photos");
    let out_dir = project_home.join("out");

    if !engine.exists() {
        return Err(format!("Reels engine not found at {}", engine.display()));
    }
    if !project_home.exists() {
        return Err(format!("Project home not found at {}", project_home.display()));
    }

    // 1. Verify Remotion is installed in engine.
    let engine_node_modules = engine.join("node_modules");
    if !engine_node_modules.exists() {
        emit_log(&app, "step", "[setup] Installing engine deps (one-time)…");
        let status = Command::new(npm_cmd()).arg("install").current_dir(&engine).status()
            .map_err(|e| format!("npm install failed to launch: {e}"))?;
        if !status.success() {
            return Err("Engine `npm install` failed".to_string());
        }
    }

    // 2. Pin @remotion/* extras to engine's Remotion version.
    let remotion_version = read_engine_remotion_version(&engine)?;
    let extras = [
        "@remotion/transitions",
        "@remotion/animation-utils",
        "@remotion/google-fonts",
        "@remotion/preload",
        "@remotion/shapes",
    ];
    let needs: Vec<String> = extras.iter().filter_map(|p| {
        let dir = engine_node_modules.join(p);
        let installed = read_pkg_version(&dir);
        if installed.as_deref() != Some(remotion_version.as_str()) {
            Some(format!("{p}@{remotion_version}"))
        } else {
            None
        }
    }).collect();
    if !needs.is_empty() {
        npm_install_pinned(&engine, &needs, &app)?;
    }

    // 3. Junction .lf-reels/node_modules → engine/node_modules.
    let nm_link = project_home.join(".lf-reels").join("node_modules");
    std::fs::create_dir_all(nm_link.parent().unwrap()).map_err(|e| e.to_string())?;
    ensure_node_modules_junction(&nm_link, &engine_node_modules, &app)?;

    // 4. Write composition source files.
    emit_log(&app, "step", "[1/4] Writing .lf-reels/src/* …");
    std::fs::create_dir_all(&reel_dir).map_err(|e| e.to_string())?;
    for (name, body) in &req.source_files {
        let path = reel_dir.join(name);
        write_text(&path, body)?;
    }

    // 5. Copy project-folder assets.
    std::fs::create_dir_all(&photos).map_err(|e| e.to_string())?;
    if !req.asset_sources.is_empty() {
        emit_log(&app, "step", format!("[2/4] Copying {} asset(s) into engine…", req.asset_sources.len()));
        for rel in &req.asset_sources {
            let win_rel = rel.replace('/', std::path::MAIN_SEPARATOR_STR);
            let src = project_home.join(&win_rel);
            let basename = src.file_name().ok_or_else(|| format!("Bad asset path {rel}"))?;
            let dest = photos.join(basename);
            std::fs::copy(&src, &dest).map_err(|e| format!("Copy {} → {}: {e}", src.display(), dest.display()))?;
        }
    }

    // 6. Decode base64 dropped images.
    if !req.dropped_images.is_empty() {
        emit_log(&app, "step", format!("[2b/4] Decoding {} dropped image(s)…", req.dropped_images.len()));
        for img in &req.dropped_images {
            let bytes = base64::engine::general_purpose::STANDARD.decode(img.base64.as_bytes())
                .map_err(|e| format!("Bad base64 for {}: {e}", img.filename))?;
            let dest = photos.join(&img.filename);
            let mut f = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
            f.write_all(&bytes).map_err(|e| e.to_string())?;
        }
    }

    // 6b. Decode soundtrack (same scheme as images, written alongside them).
    if let Some(audio) = &req.audio {
        emit_log(&app, "step", format!("[2c/4] Decoding soundtrack {}…", audio.filename));
        let bytes = base64::engine::general_purpose::STANDARD.decode(audio.base64.as_bytes())
            .map_err(|e| format!("Bad base64 for {}: {e}", audio.filename))?;
        let dest = photos.join(&audio.filename);
        let mut f = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
        f.write_all(&bytes).map_err(|e| e.to_string())?;
    }

    // 7. Render each picked output.
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let entry = reel_dir.join("index.ts");
    let mut produced = Vec::new();
    let mut failed = Vec::new();

    emit_log(&app, "step", format!("[3/4] Rendering {} output(s)…", req.outputs.len()));
    for o in &req.outputs {
        let out_path = out_dir.join(format!("{}-{}.mp4", &req.slug, o.composition_id.trim_start_matches("Reel-")));
        emit_log(&app, "step", format!("  ▶ {}  →  {}", o.label, out_path.display()));
        match spawn_remotion_render(&engine, &entry, &o.composition_id, &out_path, req.scale, req.crf, bundled_browser.as_deref(), &app) {
            Ok(()) if out_path.exists() => {
                produced.push(out_path.display().to_string());
                emit_log(&app, "info", format!("  ✓ {} done", o.label));
            }
            Ok(()) => {
                failed.push(o.label.clone());
                emit_log(&app, "error", format!("  ✗ {} — Remotion reported success but no MP4 produced", o.label));
            }
            Err(e) => {
                failed.push(o.label.clone());
                emit_log(&app, "error", format!("  ✗ {} — {e}", o.label));
                // If user cancelled, abort the whole batch.
                if e.contains("cancelled") { break; }
            }
        }
    }

    emit_log(&app, "step", format!("[4/4] Done. {} produced, {} failed.", produced.len(), failed.len()));
    Ok(RenderResult { produced, failed })
}

#[tauri::command]
fn cancel_render() {
    CANCEL_REQUESTED.store(true, Ordering::SeqCst);
    kill_pid(CURRENT_CHILD_PID.load(Ordering::SeqCst));
}

#[tauri::command]
fn open_path_in_explorer(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        Command::new("explorer").arg(&path).spawn().map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(&path).spawn().map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open").arg(&path).spawn().map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![render_reel, cancel_render, open_path_in_explorer])
        .setup(|app| {
            // Surface a startup log so the UI can confirm it's running in Tauri.
            let _ = app.handle().emit("render-log", LogEvent {
                level: "info".into(),
                message: "[boot] LaunchFoundry Lite desktop shell ready.".into(),
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
