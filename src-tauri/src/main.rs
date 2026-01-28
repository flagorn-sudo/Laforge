#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod watcher;
mod scraper;
mod tray;
mod parallel_sync;
mod version_history;
mod scheduler;
mod transfer_resume;
mod delta_sync;
mod full_site_scraper;
mod scrape_cache;
mod ide_monitor;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{
    CustomMenuItem, Manager, Menu, MenuItem, State, Submenu, WindowMenuEvent,
};
use walkdir::WalkDir;

// ============================================
// Cancellation Flags for Sync Operations
// ============================================

static CANCEL_FLAGS: Lazy<Mutex<HashMap<String, bool>>> = Lazy::new(|| Mutex::new(HashMap::new()));

// ============================================
// Cancellation Flags for Full Site Scraping
// ============================================

static SCRAPE_CANCEL_FLAGS: Lazy<Mutex<HashMap<String, std::sync::Arc<std::sync::atomic::AtomicBool>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn get_or_create_scrape_cancel_flag(project_id: &str) -> std::sync::Arc<std::sync::atomic::AtomicBool> {
    let mut flags = SCRAPE_CANCEL_FLAGS.lock().unwrap();
    if let Some(flag) = flags.get(project_id) {
        flag.clone()
    } else {
        let flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        flags.insert(project_id.to_string(), flag.clone());
        flag
    }
}

fn set_scrape_cancelled(project_id: &str, value: bool) {
    if let Ok(flags) = SCRAPE_CANCEL_FLAGS.lock() {
        if let Some(flag) = flags.get(project_id) {
            flag.store(value, std::sync::atomic::Ordering::Relaxed);
        }
    }
}

fn is_cancelled(project_id: &str) -> bool {
    CANCEL_FLAGS
        .lock()
        .map(|flags| *flags.get(project_id).unwrap_or(&false))
        .unwrap_or(false)
}

fn set_cancelled(project_id: &str, value: bool) {
    if let Ok(mut flags) = CANCEL_FLAGS.lock() {
        if value {
            flags.insert(project_id.to_string(), true);
        } else {
            flags.remove(project_id);
        }
    }
}

// ============================================
// Sync Progress Event Structure
// ============================================

#[derive(Clone, Serialize)]
struct SyncProgressEvent {
    project_id: String,
    event: String, // "connecting", "file_start", "file_progress", "file_complete", "file_error", "complete", "error", "cancelled"
    file: Option<String>,
    progress: u32,           // 0-100 overall progress
    file_progress: Option<u32>, // 0-100 for current file
    bytes_sent: Option<u64>,
    bytes_total: Option<u64>,
    message: Option<String>,
    timestamp: u64,
}

use watcher::FileWatcherManager;

// ============================================
// Directory Node structure for FileTree
// ============================================

#[derive(Debug, Clone, Serialize)]
struct DirectoryNode {
    name: String,
    path: String,
    #[serde(rename = "isDirectory")]
    is_directory: bool,
    children: Option<Vec<DirectoryNode>>,
    size: Option<u64>,
    modified: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct SFTPConfig {
    host: String,
    port: u16,
    username: String,
    password: String,
    #[serde(rename = "remotePath")]
    remote_path: String,
    passive: Option<bool>,
    protocol: Option<String>,
    #[serde(rename = "acceptInvalidCerts")]
    accept_invalid_certs: Option<bool>,
}

/// Sync options for configuring upload behavior
#[derive(Debug, Clone, Deserialize, Default)]
struct SyncOptions {
    /// Enable parallel uploads (default: true)
    #[serde(default = "default_parallel_enabled")]
    parallel_enabled: bool,
    /// Number of parallel connections (default: 4, max: 8)
    #[serde(default = "default_parallel_connections")]
    parallel_connections: usize,
    /// Create version snapshot before sync (default: false)
    #[serde(default)]
    create_snapshot: bool,
    /// Snapshot message/description
    snapshot_message: Option<String>,
}

fn default_parallel_enabled() -> bool { true }
fn default_parallel_connections() -> usize { 4 }

#[derive(Debug, Serialize)]
struct FileEntry {
    name: String,
    is_dir: bool,
    size: u64,
}

#[derive(Debug, Clone, Serialize)]
struct FileDiff {
    path: String,
    status: String, // "added", "modified", "deleted", "unchanged"
    #[serde(rename = "localSize")]
    local_size: Option<u64>,
    #[serde(rename = "remoteSize")]
    remote_size: Option<u64>,
}

struct RemoteFile {
    size: u64,
}

fn resolve_addr(host: &str, port: u16) -> Result<SocketAddr, String> {
    let addr_str = format!("{}:{}", host, port);
    addr_str
        .to_socket_addrs()
        .map_err(|e| format!("DNS resolution failed: {}", e))?
        .next()
        .ok_or_else(|| "No address found".to_string())
}

#[tauri::command]
fn open_in_finder(path: String) -> Result<(), String> {
    Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_in_editor(path: String, editor: String) -> Result<(), String> {
    match editor.as_str() {
        "pycharm" => {
            // Try PyCharm CLI first (requires 'Create Command-line Launcher' in PyCharm)
            let result = Command::new("pycharm")
                .arg(&path)
                .spawn();

            if result.is_ok() {
                return Ok(());
            }

            // Fallback: try using 'open' with PyCharm app bundle
            Command::new("open")
                .arg("-a")
                .arg("PyCharm")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open PyCharm: {}", e))?;
        }
        "vscode" | "code" => {
            Command::new("code")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open VS Code: {}", e))?;
        }
        "cursor" => {
            Command::new("cursor")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open Cursor: {}", e))?;
        }
        _ => {
            // Default: open with system default
            Command::new("open")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn sftp_test_connection(config: SFTPConfig) -> Result<bool, String> {
    println!("[Rust] sftp_test_connection called with host: {}, port: {}, protocol: {:?}",
        config.host, config.port, config.protocol);

    let protocol = config.protocol.as_deref().unwrap_or("ftp");

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        match protocol {
            "sftp" => test_sftp_connection(&config),
            "ftp" | "ftps" => test_ftp_connection(&config),
            _ => Err(format!("Unknown protocol: {}", protocol)),
        }
    }));

    match result {
        Ok(inner_result) => {
            println!("[Rust] sftp_test_connection result: {:?}", inner_result);
            inner_result
        }
        Err(e) => {
            let msg = format!("Connection test panicked: {:?}", e);
            println!("[Rust] {}", msg);
            Err(msg)
        }
    }
}

fn test_sftp_connection(config: &SFTPConfig) -> Result<bool, String> {
    println!("[Rust] test_sftp_connection: resolving address...");
    let addr = resolve_addr(&config.host, config.port)?;
    println!("[Rust] test_sftp_connection: connecting to {:?}...", addr);

    let tcp = TcpStream::connect_timeout(&addr, Duration::from_secs(10))
        .map_err(|e| format!("Connection failed: {}", e))?;
    println!("[Rust] test_sftp_connection: TCP connected");

    tcp.set_read_timeout(Some(Duration::from_secs(60)))
        .map_err(|e| format!("Failed to set read timeout: {}", e))?;
    tcp.set_write_timeout(Some(Duration::from_secs(120)))
        .map_err(|e| format!("Failed to set write timeout: {}", e))?;

    println!("[Rust] test_sftp_connection: creating SSH session...");
    let mut sess = ssh2::Session::new().map_err(|e| format!("Failed to create session: {}", e))?;
    sess.set_tcp_stream(tcp);

    println!("[Rust] test_sftp_connection: SSH handshake...");
    sess.handshake()
        .map_err(|e| format!("SSH handshake failed: {}", e))?;

    println!("[Rust] test_sftp_connection: authenticating...");
    sess.userauth_password(&config.username, &config.password)
        .map_err(|e| format!("Authentication failed: {}", e))?;

    if sess.authenticated() {
        println!("[Rust] test_sftp_connection: SUCCESS");
        Ok(true)
    } else {
        println!("[Rust] test_sftp_connection: auth failed");
        Err("Authentication failed".to_string())
    }
}

fn test_ftp_connection(config: &SFTPConfig) -> Result<bool, String> {
    println!("[Rust] test_ftp_connection: resolving address...");
    let addr = resolve_addr(&config.host, config.port)?;
    let passive = config.passive.unwrap_or(true);
    println!("[Rust] test_ftp_connection: connecting to {:?} (passive={})", addr, passive);

    let mut ftp = suppaftp::FtpStream::connect_timeout(addr, Duration::from_secs(10))
        .map_err(|e| format!("FTP connection failed: {}", e))?;

    // Set timeouts on FTP connection
    ftp.get_ref()
        .set_read_timeout(Some(Duration::from_secs(60)))
        .map_err(|e| format!("Failed to set read timeout: {}", e))?;
    ftp.get_ref()
        .set_write_timeout(Some(Duration::from_secs(120)))
        .map_err(|e| format!("Failed to set write timeout: {}", e))?;

    println!("[Rust] test_ftp_connection: connected, logging in...");

    ftp.login(&config.username, &config.password)
        .map_err(|e| format!("FTP login failed: {}", e))?;
    println!("[Rust] test_ftp_connection: logged in");

    if passive {
        ftp.set_mode(suppaftp::Mode::Passive);
    } else {
        ftp.set_mode(suppaftp::Mode::Active);
    }

    let _ = ftp.quit();
    println!("[Rust] test_ftp_connection: SUCCESS");
    Ok(true)
}

#[tauri::command]
fn sftp_list_files(config: SFTPConfig, path: String) -> Result<Vec<String>, String> {
    let protocol = config.protocol.as_deref().unwrap_or("ftp");

    match protocol {
        "sftp" => list_sftp_files(&config, &path),
        "ftp" | "ftps" => list_ftp_files(&config, &path),
        _ => Err(format!("Unknown protocol: {}", protocol)),
    }
}

fn list_sftp_files(config: &SFTPConfig, path: &str) -> Result<Vec<String>, String> {
    let addr = resolve_addr(&config.host, config.port)?;

    let tcp = TcpStream::connect_timeout(&addr, Duration::from_secs(10))
        .map_err(|e| format!("Connection failed: {}", e))?;

    let mut sess = ssh2::Session::new().map_err(|e| format!("Failed to create session: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake()
        .map_err(|e| format!("SSH handshake failed: {}", e))?;
    sess.userauth_password(&config.username, &config.password)
        .map_err(|e| format!("Authentication failed: {}", e))?;

    let sftp = sess
        .sftp()
        .map_err(|e| format!("Failed to open SFTP channel: {}", e))?;

    let mut entries = Vec::new();
    for entry in sftp
        .readdir(std::path::Path::new(path))
        .map_err(|e| format!("Failed to read directory: {}", e))?
    {
        let (path_buf, stat) = entry;
        if let Some(name) = path_buf.file_name() {
            let name_str = name.to_string_lossy().to_string();
            if stat.is_dir() && !name_str.starts_with('.') {
                entries.push(name_str);
            }
        }
    }

    entries.sort();
    Ok(entries)
}

fn list_ftp_files(config: &SFTPConfig, path: &str) -> Result<Vec<String>, String> {
    let addr = resolve_addr(&config.host, config.port)?;
    let passive = config.passive.unwrap_or(true);

    let mut ftp = suppaftp::FtpStream::connect_timeout(addr, Duration::from_secs(10))
        .map_err(|e| format!("FTP connection failed: {}", e))?;

    ftp.login(&config.username, &config.password)
        .map_err(|e| format!("FTP login failed: {}", e))?;

    if passive {
        ftp.set_mode(suppaftp::Mode::Passive);
    } else {
        ftp.set_mode(suppaftp::Mode::Active);
    }

    let entries = ftp
        .nlst(Some(path))
        .map_err(|e| format!("Failed to list directory: {}", e))?;

    let _ = ftp.quit();

    filter_directory_entries(entries)
}

fn filter_directory_entries(entries: Vec<String>) -> Result<Vec<String>, String> {
    let mut dirs: Vec<String> = entries
        .into_iter()
        .filter_map(|entry| {
            let name = entry.split('/').last().unwrap_or(&entry).to_string();
            // Consider entries without extensions as potential directories
            if !name.starts_with('.') && !name.contains('.') {
                Some(name)
            } else {
                None
            }
        })
        .collect();

    dirs.sort();
    dirs.dedup();
    Ok(dirs)
}

// Scan local directory and get all files with their sizes
fn scan_local_files(local_path: &str) -> Result<HashMap<String, u64>, String> {
    let mut files = HashMap::new();
    let base_path = Path::new(local_path);

    if !base_path.exists() {
        return Err(format!("Local path does not exist: {}", local_path));
    }

    for entry in WalkDir::new(local_path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() {
            // Skip hidden files
            if let Some(name) = path.file_name() {
                if name.to_string_lossy().starts_with('.') {
                    continue;
                }
            }

            // Get relative path from base
            if let Ok(relative) = path.strip_prefix(base_path) {
                let relative_str = relative.to_string_lossy().to_string();
                // Skip files in hidden directories
                if relative_str.split('/').any(|part| part.starts_with('.')) {
                    continue;
                }

                if let Ok(metadata) = fs::metadata(path) {
                    files.insert(relative_str, metadata.len());
                }
            }
        }
    }

    Ok(files)
}

// Scan remote directory via SFTP
fn scan_sftp_remote_files(
    config: &SFTPConfig,
    remote_base: &str,
) -> Result<HashMap<String, RemoteFile>, String> {
    let addr = resolve_addr(&config.host, config.port)?;
    let tcp = TcpStream::connect_timeout(&addr, Duration::from_secs(10))
        .map_err(|e| format!("Connection failed: {}", e))?;

    let mut sess = ssh2::Session::new().map_err(|e| format!("Session error: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("Handshake failed: {}", e))?;
    sess.userauth_password(&config.username, &config.password)
        .map_err(|e| format!("Auth failed: {}", e))?;

    let sftp = sess.sftp().map_err(|e| format!("SFTP error: {}", e))?;

    let mut files = HashMap::new();
    scan_sftp_directory(&sftp, remote_base, remote_base, &mut files)?;

    Ok(files)
}

fn scan_sftp_directory(
    sftp: &ssh2::Sftp,
    base_path: &str,
    current_path: &str,
    files: &mut HashMap<String, RemoteFile>,
) -> Result<(), String> {
    let entries = sftp
        .readdir(Path::new(current_path))
        .map_err(|e| format!("Failed to read dir {}: {}", current_path, e))?;

    for (path_buf, stat) in entries {
        if let Some(name) = path_buf.file_name() {
            let name_str = name.to_string_lossy().to_string();
            if name_str.starts_with('.') {
                continue;
            }

            let full_path = path_buf.to_string_lossy().to_string();

            if stat.is_dir() {
                scan_sftp_directory(sftp, base_path, &full_path, files)?;
            } else if stat.is_file() {
                // Get relative path
                let relative = full_path
                    .strip_prefix(base_path)
                    .unwrap_or(&full_path)
                    .trim_start_matches('/');

                files.insert(
                    relative.to_string(),
                    RemoteFile {
                        size: stat.size.unwrap_or(0),
                    },
                );
            }
        }
    }

    Ok(())
}

// Scan remote directory via FTP
fn scan_ftp_remote_files(
    config: &SFTPConfig,
    remote_base: &str,
) -> Result<HashMap<String, RemoteFile>, String> {
    let addr = resolve_addr(&config.host, config.port)?;
    let passive = config.passive.unwrap_or(true);

    let mut ftp = suppaftp::FtpStream::connect_timeout(addr, Duration::from_secs(10))
        .map_err(|e| format!("FTP connection failed: {}", e))?;

    ftp.login(&config.username, &config.password)
        .map_err(|e| format!("FTP login failed: {}", e))?;

    if passive {
        ftp.set_mode(suppaftp::Mode::Passive);
    }

    let mut files = HashMap::new();
    scan_ftp_directory(&mut ftp, remote_base, "", &mut files)?;

    let _ = ftp.quit();
    Ok(files)
}

fn scan_ftp_directory(
    ftp: &mut suppaftp::FtpStream,
    base_path: &str,
    relative_path: &str,
    files: &mut HashMap<String, RemoteFile>,
) -> Result<(), String> {
    let current = if relative_path.is_empty() {
        base_path.to_string()
    } else {
        format!("{}/{}", base_path, relative_path)
    };

    // List files with details
    let list = ftp.list(Some(&current)).unwrap_or_default();

    for line in list {
        // Parse FTP LIST format (simplified)
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 9 {
            continue;
        }

        let name = parts[8..].join(" ");
        if name.starts_with('.') || name == "." || name == ".." {
            continue;
        }

        let is_dir = line.starts_with('d');
        let size: u64 = parts.get(4).and_then(|s| s.parse().ok()).unwrap_or(0);

        let file_relative = if relative_path.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", relative_path, name)
        };

        if is_dir {
            scan_ftp_directory(ftp, base_path, &file_relative, files)?;
        } else {
            files.insert(file_relative, RemoteFile { size });
        }
    }

    Ok(())
}

#[tauri::command]
fn sftp_get_diff(local_path: String, config: SFTPConfig) -> Result<Vec<FileDiff>, String> {
    let local_files = scan_local_files(&local_path)?;

    let protocol = config.protocol.as_deref().unwrap_or("ftp");
    let remote_path = &config.remote_path;

    let remote_files = match protocol {
        "sftp" => scan_sftp_remote_files(&config, remote_path)?,
        "ftp" | "ftps" => scan_ftp_remote_files(&config, remote_path)?,
        _ => return Err(format!("Unknown protocol: {}", protocol)),
    };

    let mut diffs = Vec::new();

    // Check local files
    for (path, local_size) in &local_files {
        let status = if let Some(remote) = remote_files.get(path) {
            if *local_size != remote.size {
                "modified"
            } else {
                "unchanged"
            }
        } else {
            "added"
        };

        diffs.push(FileDiff {
            path: path.clone(),
            status: status.to_string(),
            local_size: Some(*local_size),
            remote_size: remote_files.get(path).map(|r| r.size),
        });
    }

    // Check for deleted files (on remote but not local)
    for (path, remote) in &remote_files {
        if !local_files.contains_key(path) {
            diffs.push(FileDiff {
                path: path.clone(),
                status: "deleted".to_string(),
                local_size: None,
                remote_size: Some(remote.size),
            });
        }
    }

    diffs.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(diffs)
}

#[tauri::command]
fn sftp_sync(
    local_path: String,
    config: SFTPConfig,
    dry_run: bool,
    project_id: String,
    app_handle: tauri::AppHandle,
    options: Option<SyncOptions>,
) -> Result<Vec<FileDiff>, String> {
    // Clear any previous cancel flag
    set_cancelled(&project_id, false);

    let sync_options = options.unwrap_or_default();

    // Helper to emit progress events
    let emit_progress = |event: &str, file: Option<&str>, progress: u32, message: Option<&str>| {
        let _ = app_handle.emit_all(
            "sync-progress",
            SyncProgressEvent {
                project_id: project_id.clone(),
                event: event.to_string(),
                file: file.map(|s| s.to_string()),
                progress,
                file_progress: None,
                bytes_sent: None,
                bytes_total: None,
                message: message.map(|s| s.to_string()),
                timestamp: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
            },
        );
    };

    emit_progress("connecting", None, 5, Some("Connexion au serveur..."));

    // Create version snapshot if requested
    if sync_options.create_snapshot && !dry_run {
        if let Ok(app_dir) = app_handle.path_resolver().app_data_dir().ok_or("No app dir") {
            let backup_dir = version_history::get_backup_dir(&app_dir, &project_id);
            let backup_dir_str = backup_dir.to_string_lossy().to_string();

            match version_history::create_snapshot(
                &project_id,
                &local_path,
                Some(&backup_dir_str),
                sync_options.snapshot_message.as_deref(),
            ) {
                Ok(snapshot) => {
                    // Load existing history, add snapshot, save
                    if let Ok(mut history) = version_history::load_history(&app_dir, &project_id) {
                        history.add_snapshot(snapshot);
                        let _ = version_history::save_history(&app_dir, &history);
                    }
                    emit_progress("snapshot", None, 8, Some("Snapshot créé"));
                }
                Err(e) => {
                    println!("[Sync] Warning: Failed to create snapshot: {}", e);
                }
            }
        }
    }

    // Get diff first
    emit_progress("analyzing", None, 10, Some("Analyse des fichiers..."));
    let diffs = sftp_get_diff(local_path.clone(), config.clone())?;

    if dry_run {
        emit_progress("complete", None, 100, Some("Analyse terminée"));
        return Ok(diffs);
    }

    // Check cancellation
    if is_cancelled(&project_id) {
        emit_progress("cancelled", None, 0, Some("Synchronisation annulée"));
        return Err("Synchronisation annulée".to_string());
    }

    // Perform actual sync - use parallel or sequential based on options
    let protocol = config.protocol.as_deref().unwrap_or("ftp");
    let use_parallel = sync_options.parallel_enabled;
    let max_connections = sync_options.parallel_connections.min(parallel_sync::MAX_PARALLEL_CONNECTIONS);

    let result = if use_parallel {
        // Use parallel sync
        match protocol {
            "sftp" => parallel_sync::parallel_sftp_sync(
                &local_path, &config, &diffs, &project_id, &app_handle, max_connections
            ),
            "ftp" | "ftps" => parallel_sync::parallel_ftp_sync(
                &local_path, &config, &diffs, &project_id, &app_handle, max_connections
            ),
            _ => Err(format!("Unknown protocol: {}", protocol)),
        }
    } else {
        // Use sequential sync (original behavior)
        match protocol {
            "sftp" => sync_sftp_with_progress(&local_path, &config, &diffs, &project_id, &app_handle),
            "ftp" | "ftps" => sync_ftp_with_progress(&local_path, &config, &diffs, &project_id, &app_handle),
            _ => Err(format!("Unknown protocol: {}", protocol)),
        }
    };

    // Clear cancel flag
    set_cancelled(&project_id, false);

    match result {
        Ok(_) => {
            emit_progress("complete", None, 100, Some("Synchronisation terminée"));
            Ok(diffs)
        }
        Err(e) => {
            if e.contains("annulée") || e.contains("cancelled") {
                emit_progress("cancelled", None, 0, Some(&e));
            } else {
                emit_progress("error", None, 0, Some(&e));
            }
            Err(e)
        }
    }
}

#[tauri::command]
fn sftp_cancel_sync(project_id: String) -> Result<(), String> {
    println!("[Rust] sftp_cancel_sync called for project: {}", project_id);
    set_cancelled(&project_id, true);
    Ok(())
}

fn sync_sftp_with_progress(
    local_path: &str,
    config: &SFTPConfig,
    diffs: &[FileDiff],
    project_id: &str,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    let addr = resolve_addr(&config.host, config.port)?;
    let tcp = TcpStream::connect_timeout(&addr, Duration::from_secs(10))
        .map_err(|e| format!("Connection failed: {}", e))?;

    // Set timeouts
    tcp.set_read_timeout(Some(Duration::from_secs(60)))
        .map_err(|e| format!("Failed to set read timeout: {}", e))?;
    tcp.set_write_timeout(Some(Duration::from_secs(120)))
        .map_err(|e| format!("Failed to set write timeout: {}", e))?;

    let mut sess = ssh2::Session::new().map_err(|e| format!("Session error: {}", e))?;
    sess.set_tcp_stream(tcp);
    sess.handshake().map_err(|e| format!("Handshake failed: {}", e))?;
    sess.userauth_password(&config.username, &config.password)
        .map_err(|e| format!("Auth failed: {}", e))?;

    let sftp = sess.sftp().map_err(|e| format!("SFTP error: {}", e))?;
    let remote_base = &config.remote_path;

    // Filter to only files that need uploading
    let files_to_upload: Vec<_> = diffs
        .iter()
        .filter(|d| d.status == "added" || d.status == "modified")
        .collect();

    let total_files = files_to_upload.len();
    let mut completed = 0;
    let mut errors: Vec<String> = Vec::new();

    for diff in &files_to_upload {
        // Check cancellation
        if is_cancelled(project_id) {
            return Err("Synchronisation annulée".to_string());
        }

        let local_file = format!("{}/{}", local_path, diff.path);
        let remote_file = format!("{}/{}", remote_base, diff.path);
        let file_size = diff.local_size.unwrap_or(0);

        // Emit file start event
        let progress = 20 + ((completed as u32 * 70) / total_files.max(1) as u32);
        let _ = app_handle.emit_all(
            "sync-progress",
            SyncProgressEvent {
                project_id: project_id.to_string(),
                event: "file_start".to_string(),
                file: Some(diff.path.clone()),
                progress,
                file_progress: Some(0),
                bytes_sent: Some(0),
                bytes_total: Some(file_size),
                message: None,
                timestamp: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
            },
        );

        // Create parent directories if needed
        if let Some(parent) = Path::new(&remote_file).parent() {
            let _ = create_sftp_dirs(&sftp, parent);
        }

        // Read and upload file
        let result: Result<(), String> = (|| {
            let mut file = File::open(&local_file)
                .map_err(|e| format!("Failed to open {}: {}", local_file, e))?;
            let mut contents = Vec::new();
            file.read_to_end(&mut contents)
                .map_err(|e| format!("Failed to read {}: {}", local_file, e))?;

            let mut remote = sftp
                .create(Path::new(&remote_file))
                .map_err(|e| format!("Failed to create {}: {}", remote_file, e))?;
            remote
                .write_all(&contents)
                .map_err(|e| format!("Failed to write {}: {}", remote_file, e))?;

            Ok(())
        })();

        match result {
            Ok(_) => {
                completed += 1;
                let progress = 20 + ((completed as u32 * 70) / total_files.max(1) as u32);

                // Emit file complete event
                let _ = app_handle.emit_all(
                    "sync-progress",
                    SyncProgressEvent {
                        project_id: project_id.to_string(),
                        event: "file_complete".to_string(),
                        file: Some(diff.path.clone()),
                        progress,
                        file_progress: Some(100),
                        bytes_sent: Some(file_size),
                        bytes_total: Some(file_size),
                        message: None,
                        timestamp: std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64,
                    },
                );
            }
            Err(e) => {
                errors.push(format!("{}: {}", diff.path, e));

                // Emit file error event
                let _ = app_handle.emit_all(
                    "sync-progress",
                    SyncProgressEvent {
                        project_id: project_id.to_string(),
                        event: "file_error".to_string(),
                        file: Some(diff.path.clone()),
                        progress: 20 + ((completed as u32 * 70) / total_files.max(1) as u32),
                        file_progress: Some(0),
                        bytes_sent: None,
                        bytes_total: Some(file_size),
                        message: Some(e),
                        timestamp: std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64,
                    },
                );

                // After 3 consecutive errors, stop
                if errors.len() >= 3 {
                    return Err(format!(
                        "Arrêt après 3 erreurs. Dernière erreur: {}",
                        errors.last().unwrap_or(&String::new())
                    ));
                }
            }
        }
    }

    if !errors.is_empty() {
        return Err(format!(
            "{} fichier(s) en erreur: {}",
            errors.len(),
            errors.join(", ")
        ));
    }

    Ok(())
}

fn create_sftp_dirs(sftp: &ssh2::Sftp, path: &Path) -> Result<(), String> {
    let mut current = std::path::PathBuf::new();
    for component in path.components() {
        current.push(component);
        // Try to create, ignore if exists
        let _ = sftp.mkdir(&current, 0o755);
    }
    Ok(())
}

fn sync_ftp_with_progress(
    local_path: &str,
    config: &SFTPConfig,
    diffs: &[FileDiff],
    project_id: &str,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    let addr = resolve_addr(&config.host, config.port)?;
    let passive = config.passive.unwrap_or(true);

    let mut ftp = suppaftp::FtpStream::connect_timeout(addr, Duration::from_secs(10))
        .map_err(|e| format!("FTP connection failed: {}", e))?;

    // Set timeouts
    ftp.get_ref()
        .set_read_timeout(Some(Duration::from_secs(60)))
        .map_err(|e| format!("Failed to set read timeout: {}", e))?;
    ftp.get_ref()
        .set_write_timeout(Some(Duration::from_secs(120)))
        .map_err(|e| format!("Failed to set write timeout: {}", e))?;

    ftp.login(&config.username, &config.password)
        .map_err(|e| format!("FTP login failed: {}", e))?;

    if passive {
        ftp.set_mode(suppaftp::Mode::Passive);
    }

    ftp.transfer_type(suppaftp::types::FileType::Binary)
        .map_err(|e| format!("Failed to set binary mode: {}", e))?;

    let remote_base = &config.remote_path;

    // Filter to only files that need uploading
    let files_to_upload: Vec<_> = diffs
        .iter()
        .filter(|d| d.status == "added" || d.status == "modified")
        .collect();

    let total_files = files_to_upload.len();
    let mut completed = 0;
    let mut errors: Vec<String> = Vec::new();

    for diff in &files_to_upload {
        // Check cancellation
        if is_cancelled(project_id) {
            let _ = ftp.quit();
            return Err("Synchronisation annulée".to_string());
        }

        let local_file = format!("{}/{}", local_path, diff.path);
        let remote_file = format!("{}/{}", remote_base, diff.path);
        let file_size = diff.local_size.unwrap_or(0);

        // Emit file start event
        let progress = 20 + ((completed as u32 * 70) / total_files.max(1) as u32);
        let _ = app_handle.emit_all(
            "sync-progress",
            SyncProgressEvent {
                project_id: project_id.to_string(),
                event: "file_start".to_string(),
                file: Some(diff.path.clone()),
                progress,
                file_progress: Some(0),
                bytes_sent: Some(0),
                bytes_total: Some(file_size),
                message: None,
                timestamp: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
            },
        );

        // Create parent directories if needed
        if let Some(parent) = Path::new(&diff.path).parent() {
            let _ = create_ftp_dirs(&mut ftp, remote_base, parent);
        }

        // Read and upload file
        let result: Result<(), String> = (|| {
            let mut file = File::open(&local_file)
                .map_err(|e| format!("Failed to open {}: {}", local_file, e))?;
            let mut contents = Vec::new();
            file.read_to_end(&mut contents)
                .map_err(|e| format!("Failed to read {}: {}", local_file, e))?;

            let mut cursor = std::io::Cursor::new(contents);
            ftp.put_file(&remote_file, &mut cursor)
                .map_err(|e| format!("Failed to upload {}: {}", remote_file, e))?;

            Ok(())
        })();

        match result {
            Ok(_) => {
                completed += 1;
                let progress = 20 + ((completed as u32 * 70) / total_files.max(1) as u32);

                // Emit file complete event
                let _ = app_handle.emit_all(
                    "sync-progress",
                    SyncProgressEvent {
                        project_id: project_id.to_string(),
                        event: "file_complete".to_string(),
                        file: Some(diff.path.clone()),
                        progress,
                        file_progress: Some(100),
                        bytes_sent: Some(file_size),
                        bytes_total: Some(file_size),
                        message: None,
                        timestamp: std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64,
                    },
                );
            }
            Err(e) => {
                errors.push(format!("{}: {}", diff.path, e));

                // Emit file error event
                let _ = app_handle.emit_all(
                    "sync-progress",
                    SyncProgressEvent {
                        project_id: project_id.to_string(),
                        event: "file_error".to_string(),
                        file: Some(diff.path.clone()),
                        progress: 20 + ((completed as u32 * 70) / total_files.max(1) as u32),
                        file_progress: Some(0),
                        bytes_sent: None,
                        bytes_total: Some(file_size),
                        message: Some(e),
                        timestamp: std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64,
                    },
                );

                // After 3 consecutive errors, stop
                if errors.len() >= 3 {
                    let _ = ftp.quit();
                    return Err(format!(
                        "Arrêt après 3 erreurs. Dernière erreur: {}",
                        errors.last().unwrap_or(&String::new())
                    ));
                }
            }
        }
    }

    let _ = ftp.quit();

    if !errors.is_empty() {
        return Err(format!(
            "{} fichier(s) en erreur: {}",
            errors.len(),
            errors.join(", ")
        ));
    }

    Ok(())
}

fn create_ftp_dirs(ftp: &mut suppaftp::FtpStream, base: &str, path: &Path) -> Result<(), String> {
    let mut current = base.to_string();
    for component in path.components() {
        if let std::path::Component::Normal(name) = component {
            current = format!("{}/{}", current, name.to_string_lossy());
            // Try to create, ignore if exists
            let _ = ftp.mkdir(&current);
        }
    }
    Ok(())
}

// Keyring service name - consistent across all operations
const KEYRING_SERVICE: &str = "com.forge.app";

#[tauri::command]
fn save_password(key: String, password: String) -> Result<(), String> {
    println!("[Rust keyring] save_password called with key: {}", key);

    // Create entry
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key)
        .map_err(|e| {
            println!("[Rust keyring] Entry creation failed: {}", e);
            format!("Keyring entry creation error: {}", e)
        })?;

    println!("[Rust keyring] Entry created successfully");

    // Save password
    entry.set_password(&password).map_err(|e| {
        println!("[Rust keyring] set_password failed: {}", e);
        format!("Failed to save password: {}", e)
    })?;

    println!("[Rust keyring] set_password returned Ok");

    // IMPORTANT: Verify the password was actually saved
    let verify_entry = keyring::Entry::new(KEYRING_SERVICE, &key)
        .map_err(|e| format!("Verification entry error: {}", e))?;

    match verify_entry.get_password() {
        Ok(retrieved) => {
            if retrieved == password {
                println!("[Rust keyring] Verification SUCCESS - password matches");
                Ok(())
            } else {
                println!("[Rust keyring] Verification FAILED - password mismatch!");
                Err("Password verification failed: stored password doesn't match".to_string())
            }
        }
        Err(e) => {
            println!("[Rust keyring] Verification FAILED - could not retrieve: {}", e);
            Err(format!("Password was not saved correctly: {}", e))
        }
    }
}

#[tauri::command]
fn get_password(key: String) -> Result<String, String> {
    println!("[Rust keyring] get_password called with key: {}", key);

    let entry = keyring::Entry::new(KEYRING_SERVICE, &key)
        .map_err(|e| {
            println!("[Rust keyring] Entry creation failed: {}", e);
            format!("Keyring error: {}", e)
        })?;

    let result = entry.get_password();
    match &result {
        Ok(_) => println!("[Rust keyring] get_password SUCCESS"),
        Err(e) => println!("[Rust keyring] get_password FAILED: {}", e),
    }

    result.map_err(|e| format!("Failed to get password: {}", e))
}

#[tauri::command]
fn delete_password(key: String) -> Result<(), String> {
    println!("[Rust keyring] delete_password called with key: {}", key);

    let entry = keyring::Entry::new(KEYRING_SERVICE, &key)
        .map_err(|e| format!("Keyring error: {}", e))?;

    entry.delete_credential()
        .map_err(|e| format!("Failed to delete password: {}", e))?;

    println!("[Rust keyring] delete_password SUCCESS");
    Ok(())
}

#[derive(Debug, Serialize)]
struct WebpageContent {
    html: String,
    css: Option<String>,
}

#[tauri::command]
fn fetch_webpage(url: String) -> Result<WebpageContent, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(&url)
        .send()
        .map_err(|e| format!("Failed to fetch webpage: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let html = response
        .text()
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Try to extract CSS links and fetch them
    let mut css_content = String::new();

    // Simple regex-free extraction of CSS links
    for line in html.lines() {
        if line.contains("<link") && line.contains("stylesheet") {
            if let Some(start) = line.find("href=\"") {
                let rest = &line[start + 6..];
                if let Some(end) = rest.find('"') {
                    let css_url = &rest[..end];
                    let full_url = if css_url.starts_with("http") {
                        css_url.to_string()
                    } else if css_url.starts_with("//") {
                        format!("https:{}", css_url)
                    } else if css_url.starts_with('/') {
                        // Get base URL
                        if let Ok(parsed) = url::Url::parse(&url) {
                            format!("{}://{}{}", parsed.scheme(), parsed.host_str().unwrap_or(""), css_url)
                        } else {
                            continue;
                        }
                    } else {
                        continue;
                    };

                    if let Ok(css_response) = client.get(&full_url).send() {
                        if let Ok(css) = css_response.text() {
                            css_content.push_str(&css);
                            css_content.push('\n');
                        }
                    }
                }
            }
        }
    }

    Ok(WebpageContent {
        html,
        css: if css_content.is_empty() { None } else { Some(css_content) },
    })
}

// File watcher commands
#[tauri::command]
fn start_file_watcher(
    project_id: String,
    inbox_path: String,
    state: State<'_, Mutex<FileWatcherManager>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    manager.start_watching(project_id, inbox_path, app_handle)
}

#[tauri::command]
fn stop_file_watcher(
    project_id: String,
    state: State<'_, Mutex<FileWatcherManager>>,
) -> Result<(), String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    manager.stop_watching(&project_id)
}

#[tauri::command]
fn move_file(source: String, destination: String) -> Result<(), String> {
    let source_path = Path::new(&source);
    let dest_path = Path::new(&destination);

    // Create destination directory if it doesn't exist
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Move the file
    fs::rename(source_path, dest_path).map_err(|e| format!("Failed to move file: {}", e))?;

    Ok(())
}

#[tauri::command]
fn create_inbox_folder(project_path: String) -> Result<String, String> {
    let inbox_path = Path::new(&project_path).join("_Inbox");

    if !inbox_path.exists() {
        fs::create_dir_all(&inbox_path).map_err(|e| format!("Failed to create inbox: {}", e))?;
    }

    Ok(inbox_path.to_string_lossy().to_string())
}

// ============================================
// Filesystem Commands for Project FileTree
// ============================================

/// Read directory tree recursively with depth limit
#[tauri::command]
fn read_directory_tree(path: String, max_depth: u32) -> Result<DirectoryNode, String> {
    let root_path = PathBuf::from(&path);

    if !root_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if !root_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    build_directory_node(&root_path, max_depth, 0)
}

fn build_directory_node(path: &PathBuf, max_depth: u32, current_depth: u32) -> Result<DirectoryNode, String> {
    let metadata = fs::metadata(path)
        .map_err(|e| format!("Failed to read metadata for {}: {}", path.display(), e))?;

    let name = path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());

    let modified = metadata.modified()
        .ok()
        .map(|t| {
            let datetime: chrono::DateTime<chrono::Utc> = t.into();
            datetime.format("%Y-%m-%dT%H:%M:%SZ").to_string()
        });

    if metadata.is_file() {
        return Ok(DirectoryNode {
            name,
            path: path.to_string_lossy().to_string(),
            is_directory: false,
            children: None,
            size: Some(metadata.len()),
            modified,
        });
    }

    // It's a directory
    let mut children = Vec::new();

    if current_depth < max_depth {
        let entries = fs::read_dir(path)
            .map_err(|e| format!("Failed to read directory {}: {}", path.display(), e))?;

        let mut sorted_entries: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                // Skip hidden files/directories
                !e.file_name().to_string_lossy().starts_with('.')
            })
            .collect();

        // Sort: directories first, then by name
        sorted_entries.sort_by(|a, b| {
            let a_is_dir = a.path().is_dir();
            let b_is_dir = b.path().is_dir();

            if a_is_dir != b_is_dir {
                return b_is_dir.cmp(&a_is_dir); // Directories first
            }

            a.file_name().cmp(&b.file_name())
        });

        for entry in sorted_entries {
            let entry_path = entry.path();
            match build_directory_node(&entry_path, max_depth, current_depth + 1) {
                Ok(node) => children.push(node),
                Err(e) => eprintln!("Warning: {}", e), // Skip problematic entries
            }
        }
    }

    Ok(DirectoryNode {
        name,
        path: path.to_string_lossy().to_string(),
        is_directory: true,
        children: Some(children),
        size: None,
        modified,
    })
}

/// Create a folder at the specified path
#[tauri::command]
fn create_folder(path: String) -> Result<(), String> {
    let folder_path = Path::new(&path);

    // Safety: Don't allow creating folders outside reasonable paths
    if path.contains("..") {
        return Err("Invalid path: parent directory traversal not allowed".to_string());
    }

    fs::create_dir_all(folder_path)
        .map_err(|e| format!("Failed to create folder: {}", e))
}

/// Delete a folder (optionally recursive)
#[tauri::command]
fn delete_folder(path: String, recursive: bool) -> Result<(), String> {
    let folder_path = Path::new(&path);

    // Safety: Don't allow deleting system paths
    if path.contains("..") || path == "/" || path.starts_with("/System") || path.starts_with("/usr") {
        return Err("Invalid path: deletion not allowed".to_string());
    }

    if !folder_path.exists() {
        return Err("Folder does not exist".to_string());
    }

    if recursive {
        fs::remove_dir_all(folder_path)
            .map_err(|e| format!("Failed to delete folder recursively: {}", e))
    } else {
        fs::remove_dir(folder_path)
            .map_err(|e| format!("Failed to delete folder (not empty?): {}", e))
    }
}

/// Delete a file
#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let file_path = Path::new(&path);

    // Safety checks
    if path.contains("..") {
        return Err("Invalid path: parent directory traversal not allowed".to_string());
    }

    if !file_path.exists() {
        return Err("File does not exist".to_string());
    }

    if file_path.is_dir() {
        return Err("Path is a directory, not a file".to_string());
    }

    fs::remove_file(file_path)
        .map_err(|e| format!("Failed to delete file: {}", e))
}

/// Rename a file or folder
#[tauri::command]
fn rename_item(old_path: String, new_path: String) -> Result<(), String> {
    // Safety checks
    if old_path.contains("..") || new_path.contains("..") {
        return Err("Invalid path: parent directory traversal not allowed".to_string());
    }

    let old = Path::new(&old_path);
    let new = Path::new(&new_path);

    if !old.exists() {
        return Err("Source does not exist".to_string());
    }

    if new.exists() {
        return Err("Destination already exists".to_string());
    }

    fs::rename(old, new)
        .map_err(|e| format!("Failed to rename: {}", e))
}

/// Move a file or folder to a new location
#[tauri::command]
fn move_item(source: String, destination: String) -> Result<(), String> {
    // Safety checks
    if source.contains("..") || destination.contains("..") {
        return Err("Invalid path: parent directory traversal not allowed".to_string());
    }

    let source_path = Path::new(&source);
    let dest_path = Path::new(&destination);

    if !source_path.exists() {
        return Err("Source does not exist".to_string());
    }

    // Create destination parent if needed
    if let Some(parent) = dest_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create destination directory: {}", e))?;
        }
    }

    // First try a simple rename (works if same filesystem)
    if fs::rename(&source_path, &dest_path).is_ok() {
        return Ok(());
    }

    // If rename fails (different filesystem), copy and delete
    if source_path.is_dir() {
        copy_dir_recursive(&source_path, &dest_path)?;
        fs::remove_dir_all(&source_path)
            .map_err(|e| format!("Failed to remove source directory after copy: {}", e))?;
    } else {
        fs::copy(&source_path, &dest_path)
            .map_err(|e| format!("Failed to copy file: {}", e))?;
        fs::remove_file(&source_path)
            .map_err(|e| format!("Failed to remove source file after copy: {}", e))?;
    }

    Ok(())
}

/// Helper function to copy directory recursively
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create directory {}: {}", dst.display(), e))?;

    for entry in fs::read_dir(src)
        .map_err(|e| format!("Failed to read directory {}: {}", src.display(), e))?
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Failed to copy file: {}", e))?;
        }
    }

    Ok(())
}

/// Create the initial folder structure for a project
#[tauri::command]
fn create_project_structure(project_path: String, folders: Vec<String>) -> Result<(), String> {
    let base_path = Path::new(&project_path);

    if !base_path.exists() {
        fs::create_dir_all(base_path)
            .map_err(|e| format!("Failed to create project directory: {}", e))?;
    }

    for folder in folders {
        let folder_path = base_path.join(&folder);
        if !folder_path.exists() {
            fs::create_dir_all(&folder_path)
                .map_err(|e| format!("Failed to create folder {}: {}", folder, e))?;
        }
    }

    Ok(())
}

// ============================================
// Scraping Commands
// ============================================

#[derive(Debug, Clone, Deserialize)]
struct ScrapeConfigInput {
    url: String,
    #[serde(rename = "outputPath")]
    output_path: String,
    #[serde(rename = "maxPages")]
    max_pages: Option<u32>,
    #[serde(rename = "downloadImages")]
    download_images: bool,
    #[serde(rename = "downloadCss")]
    download_css: bool,
    #[serde(rename = "extractText")]
    extract_text: bool,
}

#[tauri::command]
fn scrape_website(config: ScrapeConfigInput) -> Result<scraper::ScrapeResult, String> {
    let scrape_config = scraper::ScrapeConfig {
        url: config.url,
        output_path: config.output_path,
        max_pages: config.max_pages,
        download_images: config.download_images,
        download_css: config.download_css,
        extract_text: config.extract_text,
    };

    scraper::scrape_website(scrape_config)
}

// Scraping event for real-time progress
#[derive(Debug, Clone, Serialize)]
struct ScrapeProgressEvent {
    project_id: String,
    event_type: String, // "page_start", "page_complete", "image_download", "css_download", "complete", "error"
    url: Option<String>,
    title: Option<String>,
    pages_scraped: usize,
    pages_total: usize,
    images_downloaded: usize,
    css_downloaded: usize,
    progress: f32,
    message: String,
}

#[tauri::command]
async fn scrape_website_with_events(
    config: ScrapeConfigInput,
    project_id: String,
    window: tauri::Window,
) -> Result<scraper::ScrapeResult, String> {
    use std::sync::mpsc;
    use std::thread;

    let scrape_config = scraper::ScrapeConfig {
        url: config.url.clone(),
        output_path: config.output_path.clone(),
        max_pages: config.max_pages,
        download_images: config.download_images,
        download_css: config.download_css,
        extract_text: config.extract_text,
    };

    let project_id_for_callback = project_id.clone();
    let window_for_receiver = window.clone();

    // Create a channel to send progress events from the scraping thread
    let (tx, rx) = mpsc::channel::<scraper::ScrapeProgress>();

    // Spawn the scraping task in a separate thread
    let scraping_handle = thread::spawn(move || {
        scraper::scrape_website_with_callback(scrape_config, |progress| {
            // Send progress through channel
            let _ = tx.send(progress);
        })
    });

    // Process events from the channel in the async context
    let event_processor = tokio::task::spawn_blocking(move || {
        while let Ok(progress) = rx.recv() {
            let _ = window_for_receiver.emit("scrape-progress", ScrapeProgressEvent {
                project_id: project_id_for_callback.clone(),
                event_type: progress.event_type,
                url: progress.url,
                title: progress.title,
                pages_scraped: progress.pages_scraped,
                pages_total: progress.pages_total,
                images_downloaded: progress.images_downloaded,
                css_downloaded: progress.css_downloaded,
                progress: progress.progress_percent,
                message: progress.message,
            });
        }
    });

    // Wait for scraping to complete
    let result = scraping_handle.join()
        .map_err(|_| "Scraping thread panicked".to_string())?;

    // Wait for event processor to finish
    let _ = event_processor.await;

    result
}

// ============================================
// Full Site Scraper Commands
// ============================================

#[derive(Debug, Clone, Deserialize)]
struct FullScrapeConfigInput {
    url: String,
    #[serde(rename = "outputPath")]
    output_path: String,
    #[serde(rename = "maxPages", default = "default_max_pages")]
    max_pages: u32,
    #[serde(rename = "downloadImages", default = "default_true")]
    download_images: bool,
    #[serde(rename = "downloadCss", default = "default_true")]
    download_css: bool,
    #[serde(rename = "downloadJs", default = "default_true")]
    download_js: bool,
    #[serde(rename = "downloadFonts", default = "default_true")]
    download_fonts: bool,
    #[serde(rename = "rewriteUrls", default = "default_true")]
    rewrite_urls: bool,
    #[serde(rename = "generateReport", default = "default_true")]
    generate_report: bool,
}

fn default_max_pages() -> u32 { 100 }
fn default_true() -> bool { true }

#[tauri::command]
fn scrape_full_site(config: FullScrapeConfigInput) -> Result<full_site_scraper::FullScrapeResult, String> {
    let scrape_config = full_site_scraper::FullScrapeConfig {
        url: config.url,
        output_path: config.output_path,
        max_pages: config.max_pages,
        download_images: config.download_images,
        download_css: config.download_css,
        download_js: config.download_js,
        download_fonts: config.download_fonts,
        rewrite_urls: config.rewrite_urls,
        generate_report: config.generate_report,
    };

    full_site_scraper::scrape_full_site(scrape_config)
}

#[tauri::command]
async fn scrape_full_site_with_events(
    config: FullScrapeConfigInput,
    project_id: String,
    window: tauri::Window,
) -> Result<full_site_scraper::FullScrapeResult, String> {
    use std::sync::mpsc;
    use std::thread;

    let scrape_config = full_site_scraper::FullScrapeConfig {
        url: config.url.clone(),
        output_path: config.output_path.clone(),
        max_pages: config.max_pages,
        download_images: config.download_images,
        download_css: config.download_css,
        download_js: config.download_js,
        download_fonts: config.download_fonts,
        rewrite_urls: config.rewrite_urls,
        generate_report: config.generate_report,
    };

    // Get or create cancel flag for this project
    let cancel_flag = get_or_create_scrape_cancel_flag(&project_id);
    // Reset the cancel flag before starting
    cancel_flag.store(false, std::sync::atomic::Ordering::Relaxed);

    let project_id_for_callback = project_id.clone();
    let window_for_receiver = window.clone();

    // Create a channel to send progress events from the scraping thread
    let (tx, rx) = mpsc::channel::<full_site_scraper::FullScrapeProgress>();

    // Spawn the scraping task in a separate thread
    let scraping_handle = thread::spawn(move || {
        full_site_scraper::scrape_full_site_with_callback(
            scrape_config,
            &project_id_for_callback,
            cancel_flag,
            |progress| {
                // Send progress through channel
                let _ = tx.send(progress);
            },
        )
    });

    // Process events from the channel in the async context
    let event_processor = tokio::task::spawn_blocking(move || {
        while let Ok(progress) = rx.recv() {
            let _ = window_for_receiver.emit("full-scrape-progress", &progress);
        }
    });

    // Wait for scraping to complete
    let result = scraping_handle.join()
        .map_err(|_| "Scraping thread panicked".to_string())?;

    // Wait for event processor to finish
    let _ = event_processor.await;

    result
}

#[tauri::command]
fn cancel_full_site_scrape(project_id: String) -> Result<(), String> {
    println!("[Rust] cancel_full_site_scrape called for project: {}", project_id);
    set_scrape_cancelled(&project_id, true);
    Ok(())
}

// ============================================
// Version History Commands
// ============================================

#[tauri::command]
fn create_version_snapshot(
    project_id: String,
    local_path: String,
    message: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<version_history::SyncSnapshot, String> {
    let app_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data directory")?;

    let backup_dir = version_history::get_backup_dir(&app_dir, &project_id);
    let backup_dir_str = backup_dir.to_string_lossy().to_string();

    let snapshot = version_history::create_snapshot(
        &project_id,
        &local_path,
        Some(&backup_dir_str),
        message.as_deref(),
    )?;

    // Save to history
    let mut history = version_history::load_history(&app_dir, &project_id)?;
    history.add_snapshot(snapshot.clone());
    version_history::save_history(&app_dir, &history)?;

    Ok(snapshot)
}

#[tauri::command]
fn get_version_history(
    project_id: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<version_history::SnapshotSummary>, String> {
    let app_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data directory")?;

    let history = version_history::load_history(&app_dir, &project_id)?;
    Ok(history.list_snapshots())
}

#[tauri::command]
fn get_snapshot_details(
    project_id: String,
    snapshot_id: String,
    app_handle: tauri::AppHandle,
) -> Result<Option<version_history::SyncSnapshot>, String> {
    let app_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data directory")?;

    let history = version_history::load_history(&app_dir, &project_id)?;
    Ok(history.get_snapshot(&snapshot_id).cloned())
}

#[tauri::command]
fn restore_version(
    project_id: String,
    snapshot_id: String,
    target_path: String,
    files: Option<Vec<String>>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    let app_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data directory")?;

    let history = version_history::load_history(&app_dir, &project_id)?;
    let snapshot = history
        .get_snapshot(&snapshot_id)
        .ok_or("Snapshot not found")?;

    version_history::restore_snapshot(snapshot, &target_path, files)
}

#[tauri::command]
fn compare_snapshots(
    project_id: String,
    old_snapshot_id: String,
    new_snapshot_id: String,
    app_handle: tauri::AppHandle,
) -> Result<version_history::SnapshotDiff, String> {
    let app_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data directory")?;

    let history = version_history::load_history(&app_dir, &project_id)?;

    let old_snapshot = history
        .get_snapshot(&old_snapshot_id)
        .ok_or("Old snapshot not found")?;
    let new_snapshot = history
        .get_snapshot(&new_snapshot_id)
        .ok_or("New snapshot not found")?;

    Ok(version_history::compare_snapshots(old_snapshot, new_snapshot))
}

// ============================================
// Scheduler Commands
// ============================================

#[tauri::command]
fn start_sync_scheduler(app_handle: tauri::AppHandle) -> Result<(), String> {
    scheduler::start_scheduler(app_handle);
    Ok(())
}

#[tauri::command]
fn stop_sync_scheduler() -> Result<(), String> {
    scheduler::stop_scheduler();
    Ok(())
}

#[tauri::command]
fn set_sync_schedule(schedule: scheduler::SyncSchedule) -> Result<scheduler::SyncSchedule, String> {
    scheduler::set_schedule(schedule)
}

#[tauri::command]
fn remove_sync_schedule(project_id: String) -> Result<(), String> {
    scheduler::remove_schedule(&project_id)
}

#[tauri::command]
fn get_sync_schedule(project_id: String) -> Result<Option<scheduler::SyncSchedule>, String> {
    Ok(scheduler::get_schedule(&project_id))
}

#[tauri::command]
fn get_all_sync_schedules() -> Result<Vec<scheduler::SyncSchedule>, String> {
    Ok(scheduler::get_all_schedules())
}

#[tauri::command]
fn set_schedule_enabled(project_id: String, enabled: bool) -> Result<(), String> {
    scheduler::set_schedule_enabled(&project_id, enabled)
}

#[tauri::command]
fn update_schedule_result(project_id: String, result: scheduler::ScheduleResult) -> Result<(), String> {
    scheduler::update_schedule_result(&project_id, result);
    Ok(())
}

// ============================================
// Transfer Resume Commands
// ============================================

#[tauri::command]
fn get_transfer_session(
    project_id: String,
    app_handle: tauri::AppHandle,
) -> Result<Option<transfer_resume::TransferSession>, String> {
    let app_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data directory")?;

    let store = transfer_resume::load_sessions(&app_dir)?;
    Ok(store.get_session(&project_id).cloned())
}

#[tauri::command]
fn create_transfer_session(
    project_id: String,
    files: Vec<(String, String, String, u64)>, // (path, local_path, remote_path, size)
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let app_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data directory")?;

    let mut store = transfer_resume::load_sessions(&app_dir)?;
    let session_id = store.create_session(&project_id);

    if let Some(session) = store.sessions.get_mut(&session_id) {
        for (path, local_path, remote_path, size) in files {
            session.add_file(&path, &local_path, &remote_path, size);
        }
    }

    transfer_resume::save_sessions(&app_dir, &store)?;
    Ok(session_id)
}

#[tauri::command]
fn update_transfer_progress(
    session_id: String,
    file_path: String,
    transferred: u64,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let app_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data directory")?;

    let mut store = transfer_resume::load_sessions(&app_dir)?;

    if let Some(session) = store.sessions.get_mut(&session_id) {
        session.update_progress(&file_path, transferred);
        transfer_resume::save_sessions(&app_dir, &store)?;
    }

    Ok(())
}

#[tauri::command]
fn complete_transfer_file(
    session_id: String,
    file_path: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let app_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data directory")?;

    let mut store = transfer_resume::load_sessions(&app_dir)?;

    if let Some(session) = store.sessions.get_mut(&session_id) {
        session.mark_completed(&file_path);
        transfer_resume::save_sessions(&app_dir, &store)?;
    }

    Ok(())
}

#[tauri::command]
fn complete_transfer_session(
    session_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let app_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data directory")?;

    let mut store = transfer_resume::load_sessions(&app_dir)?;
    store.complete_session(&session_id);
    store.cleanup_old_sessions(24); // Clean up sessions older than 24 hours
    transfer_resume::save_sessions(&app_dir, &store)?;

    Ok(())
}

#[tauri::command]
fn get_resumable_files(
    project_id: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<transfer_resume::FileTransferState>, String> {
    let app_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data directory")?;

    let store = transfer_resume::load_sessions(&app_dir)?;

    Ok(store
        .get_session(&project_id)
        .map(|s| s.get_resumable_files().into_iter().cloned().collect())
        .unwrap_or_default())
}

// ============================================
// Delta Sync Commands
// ============================================

#[tauri::command]
fn analyze_delta_sync(
    project_id: String,
    local_path: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<delta_sync::FileDelta>, String> {
    let app_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data directory")?;

    let cache = delta_sync::load_cache(&app_dir, &project_id)?;
    delta_sync::analyze_delta_sync(&local_path, &cache)
}

#[tauri::command]
fn get_delta_transfer_stats(
    deltas: Vec<delta_sync::FileDelta>,
) -> Result<delta_sync::DeltaTransferStats, String> {
    Ok(delta_sync::calculate_transfer_stats(&deltas))
}

#[tauri::command]
fn update_delta_cache_after_sync(
    project_id: String,
    local_path: String,
    synced_files: Vec<String>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let app_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data directory")?;

    delta_sync::update_cache_after_sync(&app_dir, &project_id, &local_path, &synced_files)?;
    Ok(())
}

#[tauri::command]
fn generate_file_signature(
    file_path: String,
    relative_path: String,
) -> Result<delta_sync::FileSignature, String> {
    let path = Path::new(&file_path);
    delta_sync::generate_file_signature(path, &relative_path)
}

#[tauri::command]
fn get_delta_cache_info(
    project_id: String,
    app_handle: tauri::AppHandle,
) -> Result<delta_sync::SignatureCache, String> {
    let app_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data directory")?;

    delta_sync::load_cache(&app_dir, &project_id)
}

#[tauri::command]
fn clear_delta_cache(
    project_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let app_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data directory")?;

    let cache = delta_sync::SignatureCache::new(&project_id);
    delta_sync::save_cache(&app_dir, &cache)
}

// ============================================
// Scrape Cache Commands
// ============================================

#[tauri::command]
fn get_scrape_cache(project_path: String) -> Result<Option<scrape_cache::ScrapeCache>, String> {
    Ok(scrape_cache::ScrapeCache::load(&project_path))
}

#[tauri::command]
fn get_scrape_cache_stats(project_path: String) -> Result<Option<scrape_cache::CacheStats>, String> {
    Ok(scrape_cache::ScrapeCache::load(&project_path).map(|c| c.stats()))
}

#[tauri::command]
fn clear_scrape_cache(project_path: String) -> Result<(), String> {
    if let Some(mut cache) = scrape_cache::ScrapeCache::load(&project_path) {
        cache.clear();
        cache.save(&project_path)?;
    }
    Ok(())
}

#[tauri::command]
fn is_url_cached(project_path: String, url: String) -> Result<bool, String> {
    Ok(scrape_cache::ScrapeCache::load(&project_path)
        .map(|c| c.is_cached(&url))
        .unwrap_or(false))
}

#[tauri::command]
fn set_scrape_cache_ttl(project_path: String, days: u64) -> Result<(), String> {
    if let Some(mut cache) = scrape_cache::ScrapeCache::load(&project_path) {
        cache.set_ttl_days(days);
        cache.save(&project_path)?;
    }
    Ok(())
}

// ============================================
// Sync Configuration Commands
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncConfig {
    parallel_enabled: bool,
    parallel_connections: usize,
    auto_snapshot: bool,
}

static SYNC_CONFIG: Lazy<Mutex<SyncConfig>> = Lazy::new(|| {
    Mutex::new(SyncConfig {
        parallel_enabled: true,
        parallel_connections: 4,
        auto_snapshot: false,
    })
});

#[tauri::command]
fn get_sync_config() -> Result<SyncConfig, String> {
    SYNC_CONFIG
        .lock()
        .map(|c| c.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_sync_config(config: SyncConfig) -> Result<(), String> {
    if let Ok(mut current) = SYNC_CONFIG.lock() {
        *current = config;
        Ok(())
    } else {
        Err("Failed to update sync config".to_string())
    }
}

// Autostart commands using macOS LaunchAgent
const LAUNCH_AGENT_LABEL: &str = "com.forge.autostart";

fn get_launch_agent_path() -> Option<std::path::PathBuf> {
    dirs::home_dir().map(|home| {
        home.join("Library")
            .join("LaunchAgents")
            .join(format!("{}.plist", LAUNCH_AGENT_LABEL))
    })
}

fn get_executable_path() -> Option<String> {
    std::env::current_exe()
        .ok()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_autostart_enabled() -> Result<bool, String> {
    let plist_path = get_launch_agent_path().ok_or("Could not determine home directory")?;
    Ok(plist_path.exists())
}

#[tauri::command]
fn set_autostart_enabled(enabled: bool) -> Result<(), String> {
    let plist_path = get_launch_agent_path().ok_or("Could not determine home directory")?;

    if enabled {
        let executable_path = get_executable_path().ok_or("Could not determine executable path")?;

        // Create LaunchAgents directory if it doesn't exist
        if let Some(parent) = plist_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        // Use direct executable path instead of "open -a" to show "La Forge" in startup items
        let plist_content = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
"#,
            LAUNCH_AGENT_LABEL, executable_path
        );

        fs::write(&plist_path, plist_content).map_err(|e| format!("Failed to write plist: {}", e))?;
    } else {
        if plist_path.exists() {
            fs::remove_file(&plist_path).map_err(|e| format!("Failed to remove plist: {}", e))?;
        }
    }

    Ok(())
}

// ============================================
// Menu Configuration (French labels)
// ============================================

fn create_menu() -> Menu {
    // Menu La Forge (Application)
    let app_menu = Submenu::new(
        "La Forge",
        Menu::new()
            .add_item(CustomMenuItem::new("about", "À propos de La Forge"))
            .add_native_item(MenuItem::Separator)
            .add_item(CustomMenuItem::new("check_updates", "Vérifier les mises à jour..."))
            .add_native_item(MenuItem::Separator)
            .add_item(
                CustomMenuItem::new("preferences", "Préférences...")
                    .accelerator("CmdOrCtrl+,"),
            )
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::Services)
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::Hide)
            .add_native_item(MenuItem::HideOthers)
            .add_native_item(MenuItem::ShowAll)
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::Quit),
    );

    // Menu Fichier
    let file_menu = Submenu::new(
        "Fichier",
        Menu::new()
            .add_item(
                CustomMenuItem::new("new_project", "Nouveau projet...")
                    .accelerator("CmdOrCtrl+N"),
            )
            .add_native_item(MenuItem::Separator)
            .add_item(
                CustomMenuItem::new("close_window", "Fermer la fenêtre")
                    .accelerator("CmdOrCtrl+W"),
            ),
    );

    // Menu Édition
    let edit_menu = Submenu::new(
        "Édition",
        Menu::new()
            .add_native_item(MenuItem::Undo)
            .add_native_item(MenuItem::Redo)
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::Cut)
            .add_native_item(MenuItem::Copy)
            .add_native_item(MenuItem::Paste)
            .add_native_item(MenuItem::SelectAll),
    );

    // Menu Affichage
    let view_menu = Submenu::new(
        "Affichage",
        Menu::new()
            .add_item(
                CustomMenuItem::new("refresh", "Actualiser")
                    .accelerator("CmdOrCtrl+R"),
            )
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::EnterFullScreen),
    );

    // Menu Projet
    let project_menu = Submenu::new(
        "Projet",
        Menu::new()
            .add_item(
                CustomMenuItem::new("open_in_finder", "Ouvrir dans le Finder")
                    .accelerator("CmdOrCtrl+Shift+O"),
            )
            .add_item(
                CustomMenuItem::new("open_in_browser", "Ouvrir le site")
                    .accelerator("CmdOrCtrl+Shift+B"),
            )
            .add_native_item(MenuItem::Separator)
            .add_item(
                CustomMenuItem::new("sync_project", "Synchroniser")
                    .accelerator("CmdOrCtrl+Shift+S"),
            )
            .add_native_item(MenuItem::Separator)
            .add_item(CustomMenuItem::new("scrape_site", "Scraper le site...")),
    );

    // Menu Fenêtre
    let window_menu = Submenu::new(
        "Fenêtre",
        Menu::new()
            .add_native_item(MenuItem::Minimize)
            .add_native_item(MenuItem::Zoom)
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::CloseWindow),
    );

    // Menu Aide
    let help_menu = Submenu::new(
        "Aide",
        Menu::new()
            .add_item(CustomMenuItem::new("documentation", "Documentation"))
            .add_item(CustomMenuItem::new("report_issue", "Signaler un problème...")),
    );

    Menu::new()
        .add_submenu(app_menu)
        .add_submenu(file_menu)
        .add_submenu(edit_menu)
        .add_submenu(view_menu)
        .add_submenu(project_menu)
        .add_submenu(window_menu)
        .add_submenu(help_menu)
}

fn handle_menu_event(event: WindowMenuEvent) {
    let window = event.window();

    match event.menu_item_id() {
        "about" => {
            // Emit event to frontend to show about dialog
            let _ = window.emit("menu-about", ());
        }
        "check_updates" => {
            // Emit event to frontend to check for updates
            let _ = window.emit("menu-check-updates", ());
        }
        "preferences" => {
            // Navigate to settings
            let _ = window.emit("menu-preferences", ());
        }
        "new_project" => {
            let _ = window.emit("menu-new-project", ());
        }
        "close_window" => {
            let _ = window.close();
        }
        "refresh" => {
            let _ = window.emit("menu-refresh", ());
        }
        "open_in_finder" => {
            let _ = window.emit("menu-open-finder", ());
        }
        "open_in_browser" => {
            let _ = window.emit("menu-open-browser", ());
        }
        "sync_project" => {
            let _ = window.emit("menu-sync", ());
        }
        "scrape_site" => {
            let _ = window.emit("menu-scrape", ());
        }
        "documentation" => {
            let _ = Command::new("open")
                .arg("https://github.com/anthropics/forge")
                .spawn();
        }
        "report_issue" => {
            let _ = Command::new("open")
                .arg("https://github.com/anthropics/forge/issues")
                .spawn();
        }
        _ => {}
    }
}

fn main() {
    tauri::Builder::default()
        .menu(create_menu())
        .on_menu_event(handle_menu_event)
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(Mutex::new(FileWatcherManager::new()))
        .system_tray(tray::create_system_tray())
        .on_system_tray_event(tray::handle_tray_event)
        .on_window_event(|event| {
            // Hide window instead of closing when red button is clicked
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                // Prevent the window from being destroyed
                api.prevent_close();
                // Hide the window instead
                let _ = event.window().hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_in_finder,
            open_in_editor,
            sftp_test_connection,
            sftp_list_files,
            sftp_get_diff,
            sftp_sync,
            sftp_cancel_sync,
            save_password,
            get_password,
            delete_password,
            fetch_webpage,
            start_file_watcher,
            stop_file_watcher,
            move_file,
            create_inbox_folder,
            get_autostart_enabled,
            set_autostart_enabled,
            // Filesystem commands for Project FileTree
            read_directory_tree,
            create_folder,
            delete_folder,
            delete_file,
            rename_item,
            move_item,
            create_project_structure,
            // Scraping commands
            scrape_website,
            scrape_website_with_events,
            scrape_full_site,
            scrape_full_site_with_events,
            cancel_full_site_scrape,
            // System tray commands
            tray::tray_update_recent_projects,
            tray::tray_is_available,
            tray::tray_set_sync_indicator,
            // Version history commands
            create_version_snapshot,
            get_version_history,
            get_snapshot_details,
            restore_version,
            compare_snapshots,
            // Scheduler commands
            start_sync_scheduler,
            stop_sync_scheduler,
            set_sync_schedule,
            remove_sync_schedule,
            get_sync_schedule,
            get_all_sync_schedules,
            set_schedule_enabled,
            update_schedule_result,
            // Sync configuration commands
            get_sync_config,
            set_sync_config,
            // Transfer resume commands
            get_transfer_session,
            create_transfer_session,
            update_transfer_progress,
            complete_transfer_file,
            complete_transfer_session,
            get_resumable_files,
            // Delta sync commands
            analyze_delta_sync,
            get_delta_transfer_stats,
            update_delta_cache_after_sync,
            generate_file_signature,
            get_delta_cache_info,
            clear_delta_cache,
            // Scrape cache commands
            get_scrape_cache,
            get_scrape_cache_stats,
            clear_scrape_cache,
            is_url_cached,
            set_scrape_cache_ttl,
            // IDE monitor commands
            ide_monitor::check_ide_for_project,
            ide_monitor::get_open_projects_for_ide
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
