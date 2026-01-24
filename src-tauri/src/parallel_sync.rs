//! Parallel File Upload Module
//!
//! Implements multi-connection parallel file uploads for FTP/SFTP
//! with configurable concurrency and progress tracking.

use crate::{is_cancelled, FileDiff, SFTPConfig, SyncProgressEvent};
use rayon::prelude::*;
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Write as IoWrite};
use std::net::{SocketAddr, TcpStream};
use std::path::Path;
use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Manager;

/// Default number of parallel connections
pub const DEFAULT_PARALLEL_CONNECTIONS: usize = 4;

/// Maximum parallel connections allowed
pub const MAX_PARALLEL_CONNECTIONS: usize = 8;

/// Thread-safe progress tracker for parallel uploads
#[derive(Clone)]
pub struct ParallelProgressTracker {
    project_id: String,
    total_files: usize,
    completed_files: Arc<AtomicUsize>,
    failed_files: Arc<AtomicUsize>,
    current_progress: Arc<AtomicU32>,
    errors: Arc<Mutex<Vec<String>>>,
    app_handle: tauri::AppHandle,
    base_progress: u32,  // Starting progress (e.g., 20 after analysis)
    progress_range: u32, // Available progress range (e.g., 70 for 20-90)
}

impl ParallelProgressTracker {
    pub fn new(
        project_id: String,
        total_files: usize,
        app_handle: tauri::AppHandle,
        base_progress: u32,
        progress_range: u32,
    ) -> Self {
        Self {
            project_id,
            total_files,
            completed_files: Arc::new(AtomicUsize::new(0)),
            failed_files: Arc::new(AtomicUsize::new(0)),
            current_progress: Arc::new(AtomicU32::new(base_progress)),
            errors: Arc::new(Mutex::new(Vec::new())),
            app_handle,
            base_progress,
            progress_range,
        }
    }

    pub fn emit_file_start(&self, file: &str, file_size: u64) {
        let progress = self.current_progress.load(Ordering::SeqCst);
        let _ = self.app_handle.emit_all(
            "sync-progress",
            SyncProgressEvent {
                project_id: self.project_id.clone(),
                event: "file_start".to_string(),
                file: Some(file.to_string()),
                progress,
                file_progress: Some(0),
                bytes_sent: Some(0),
                bytes_total: Some(file_size),
                message: None,
                timestamp: timestamp_now(),
            },
        );
    }

    pub fn emit_file_progress(&self, file: &str, bytes_sent: u64, bytes_total: u64) {
        let progress = self.current_progress.load(Ordering::SeqCst);
        let file_progress = if bytes_total > 0 {
            ((bytes_sent as f64 / bytes_total as f64) * 100.0) as u32
        } else {
            100
        };
        let _ = self.app_handle.emit_all(
            "sync-progress",
            SyncProgressEvent {
                project_id: self.project_id.clone(),
                event: "file_progress".to_string(),
                file: Some(file.to_string()),
                progress,
                file_progress: Some(file_progress),
                bytes_sent: Some(bytes_sent),
                bytes_total: Some(bytes_total),
                message: None,
                timestamp: timestamp_now(),
            },
        );
    }

    pub fn emit_file_complete(&self, file: &str, file_size: u64) {
        let completed = self.completed_files.fetch_add(1, Ordering::SeqCst) + 1;
        let progress = self.calculate_progress(completed);
        self.current_progress.store(progress, Ordering::SeqCst);

        let _ = self.app_handle.emit_all(
            "sync-progress",
            SyncProgressEvent {
                project_id: self.project_id.clone(),
                event: "file_complete".to_string(),
                file: Some(file.to_string()),
                progress,
                file_progress: Some(100),
                bytes_sent: Some(file_size),
                bytes_total: Some(file_size),
                message: None,
                timestamp: timestamp_now(),
            },
        );
    }

    pub fn emit_file_error(&self, file: &str, error: &str, file_size: u64) {
        self.failed_files.fetch_add(1, Ordering::SeqCst);

        if let Ok(mut errors) = self.errors.lock() {
            errors.push(format!("{}: {}", file, error));
        }

        let progress = self.current_progress.load(Ordering::SeqCst);
        let _ = self.app_handle.emit_all(
            "sync-progress",
            SyncProgressEvent {
                project_id: self.project_id.clone(),
                event: "file_error".to_string(),
                file: Some(file.to_string()),
                progress,
                file_progress: Some(0),
                bytes_sent: None,
                bytes_total: Some(file_size),
                message: Some(error.to_string()),
                timestamp: timestamp_now(),
            },
        );
    }

    fn calculate_progress(&self, completed: usize) -> u32 {
        if self.total_files == 0 {
            return self.base_progress + self.progress_range;
        }
        self.base_progress + ((completed as u32 * self.progress_range) / self.total_files as u32)
    }

    pub fn get_completed(&self) -> usize {
        self.completed_files.load(Ordering::SeqCst)
    }

    pub fn get_failed(&self) -> usize {
        self.failed_files.load(Ordering::SeqCst)
    }

    pub fn get_errors(&self) -> Vec<String> {
        self.errors.lock().map(|e| e.clone()).unwrap_or_default()
    }

    pub fn should_stop(&self) -> bool {
        // Stop if we have 3+ consecutive errors
        self.failed_files.load(Ordering::SeqCst) >= 3
    }
}

fn timestamp_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn resolve_addr(host: &str, port: u16) -> Result<SocketAddr, String> {
    use std::net::ToSocketAddrs;
    let addr_str = format!("{}:{}", host, port);
    addr_str
        .to_socket_addrs()
        .map_err(|e| format!("DNS resolution failed: {}", e))?
        .next()
        .ok_or_else(|| "No address found".to_string())
}

/// Parallel SFTP sync using multiple SSH sessions
pub fn parallel_sftp_sync(
    local_path: &str,
    config: &SFTPConfig,
    diffs: &[FileDiff],
    project_id: &str,
    app_handle: &tauri::AppHandle,
    max_connections: usize,
) -> Result<(), String> {
    let files_to_upload: Vec<_> = diffs
        .iter()
        .filter(|d| d.status == "added" || d.status == "modified")
        .collect();

    if files_to_upload.is_empty() {
        return Ok(());
    }

    let total_files = files_to_upload.len();
    let tracker = ParallelProgressTracker::new(
        project_id.to_string(),
        total_files,
        app_handle.clone(),
        20, // Base progress after analysis
        70, // Progress range (20-90)
    );

    // Limit connections to file count or max
    let actual_connections = max_connections.min(total_files).min(MAX_PARALLEL_CONNECTIONS);

    // Configure rayon thread pool for this operation
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(actual_connections)
        .build()
        .map_err(|e| format!("Failed to create thread pool: {}", e))?;

    let local_path = local_path.to_string();
    let remote_base = config.remote_path.clone();
    let config = config.clone();

    pool.install(|| {
        files_to_upload.par_iter().for_each(|diff| {
            // Check cancellation
            if is_cancelled(project_id) || tracker.should_stop() {
                return;
            }

            let local_file = format!("{}/{}", local_path, diff.path);
            let remote_file = format!("{}/{}", remote_base, diff.path);
            let file_size = diff.local_size.unwrap_or(0);

            tracker.emit_file_start(&diff.path, file_size);

            // Each thread creates its own SSH connection
            let result = upload_single_sftp_file(&config, &local_file, &remote_file, &diff.path, file_size, &tracker);

            match result {
                Ok(_) => tracker.emit_file_complete(&diff.path, file_size),
                Err(e) => tracker.emit_file_error(&diff.path, &e, file_size),
            }
        });
    });

    // Check results
    let errors = tracker.get_errors();
    if !errors.is_empty() {
        return Err(format!(
            "{} fichier(s) en erreur: {}",
            errors.len(),
            errors.join(", ")
        ));
    }

    if is_cancelled(project_id) {
        return Err("Synchronisation annulée".to_string());
    }

    Ok(())
}

fn upload_single_sftp_file(
    config: &SFTPConfig,
    local_file: &str,
    remote_file: &str,
    display_path: &str,
    file_size: u64,
    tracker: &ParallelProgressTracker,
) -> Result<(), String> {
    // Create new SSH connection for this thread
    let addr = resolve_addr(&config.host, config.port)?;
    let tcp = TcpStream::connect_timeout(&addr, Duration::from_secs(10))
        .map_err(|e| format!("Connection failed: {}", e))?;

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

    // Create parent directories if needed
    if let Some(parent) = Path::new(remote_file).parent() {
        create_sftp_dirs_for_path(&sftp, parent)?;
    }

    // Read local file
    let mut file = File::open(local_file)
        .map_err(|e| format!("Failed to open {}: {}", local_file, e))?;
    let mut contents = Vec::new();
    file.read_to_end(&mut contents)
        .map_err(|e| format!("Failed to read {}: {}", local_file, e))?;

    // Upload with chunked progress (64KB chunks)
    let chunk_size = 65536;
    let mut remote = sftp
        .create(Path::new(remote_file))
        .map_err(|e| format!("Failed to create {}: {}", remote_file, e))?;

    let mut bytes_sent = 0u64;
    for chunk in contents.chunks(chunk_size) {
        remote
            .write_all(chunk)
            .map_err(|e| format!("Failed to write {}: {}", remote_file, e))?;

        bytes_sent += chunk.len() as u64;

        // Emit progress every chunk
        if file_size > chunk_size as u64 {
            tracker.emit_file_progress(display_path, bytes_sent, file_size);
        }
    }

    Ok(())
}

fn create_sftp_dirs_for_path(sftp: &ssh2::Sftp, path: &Path) -> Result<(), String> {
    let mut current = std::path::PathBuf::new();
    for component in path.components() {
        current.push(component);
        // Try to create, ignore if exists
        let _ = sftp.mkdir(&current, 0o755);
    }
    Ok(())
}

/// Parallel FTP sync using multiple FTP connections
pub fn parallel_ftp_sync(
    local_path: &str,
    config: &SFTPConfig,
    diffs: &[FileDiff],
    project_id: &str,
    app_handle: &tauri::AppHandle,
    max_connections: usize,
) -> Result<(), String> {
    let files_to_upload: Vec<_> = diffs
        .iter()
        .filter(|d| d.status == "added" || d.status == "modified")
        .collect();

    if files_to_upload.is_empty() {
        return Ok(());
    }

    let total_files = files_to_upload.len();
    let tracker = ParallelProgressTracker::new(
        project_id.to_string(),
        total_files,
        app_handle.clone(),
        20,
        70,
    );

    let actual_connections = max_connections.min(total_files).min(MAX_PARALLEL_CONNECTIONS);

    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(actual_connections)
        .build()
        .map_err(|e| format!("Failed to create thread pool: {}", e))?;

    let local_path = local_path.to_string();
    let remote_base = config.remote_path.clone();
    let config = config.clone();

    // Track which directories have been created (thread-safe)
    let created_dirs: Arc<Mutex<std::collections::HashSet<String>>> =
        Arc::new(Mutex::new(std::collections::HashSet::new()));

    pool.install(|| {
        files_to_upload.par_iter().for_each(|diff| {
            if is_cancelled(project_id) || tracker.should_stop() {
                return;
            }

            let local_file = format!("{}/{}", local_path, diff.path);
            let remote_file = format!("{}/{}", remote_base, diff.path);
            let file_size = diff.local_size.unwrap_or(0);

            tracker.emit_file_start(&diff.path, file_size);

            let result = upload_single_ftp_file(
                &config,
                &local_file,
                &remote_file,
                &diff.path,
                &remote_base,
                file_size,
                &tracker,
                &created_dirs,
            );

            match result {
                Ok(_) => tracker.emit_file_complete(&diff.path, file_size),
                Err(e) => tracker.emit_file_error(&diff.path, &e, file_size),
            }
        });
    });

    let errors = tracker.get_errors();
    if !errors.is_empty() {
        return Err(format!(
            "{} fichier(s) en erreur: {}",
            errors.len(),
            errors.join(", ")
        ));
    }

    if is_cancelled(project_id) {
        return Err("Synchronisation annulée".to_string());
    }

    Ok(())
}

fn upload_single_ftp_file(
    config: &SFTPConfig,
    local_file: &str,
    remote_file: &str,
    display_path: &str,
    remote_base: &str,
    file_size: u64,
    tracker: &ParallelProgressTracker,
    created_dirs: &Arc<Mutex<std::collections::HashSet<String>>>,
) -> Result<(), String> {
    let addr = resolve_addr(&config.host, config.port)?;
    let passive = config.passive.unwrap_or(true);

    let mut ftp = suppaftp::FtpStream::connect_timeout(addr, Duration::from_secs(10))
        .map_err(|e| format!("FTP connection failed: {}", e))?;

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

    // Create parent directories if needed (with deduplication)
    if let Some(parent) = Path::new(display_path).parent() {
        create_ftp_dirs_with_cache(&mut ftp, remote_base, parent, created_dirs)?;
    }

    // Read local file
    let mut file = File::open(local_file)
        .map_err(|e| format!("Failed to open {}: {}", local_file, e))?;
    let mut contents = Vec::new();
    file.read_to_end(&mut contents)
        .map_err(|e| format!("Failed to read {}: {}", local_file, e))?;

    // Upload file
    let mut cursor = std::io::Cursor::new(contents);
    ftp.put_file(remote_file, &mut cursor)
        .map_err(|e| format!("Failed to upload {}: {}", remote_file, e))?;

    let _ = ftp.quit();

    Ok(())
}

fn create_ftp_dirs_with_cache(
    ftp: &mut suppaftp::FtpStream,
    base: &str,
    path: &Path,
    created_dirs: &Arc<Mutex<std::collections::HashSet<String>>>,
) -> Result<(), String> {
    let mut current = base.to_string();

    for component in path.components() {
        if let std::path::Component::Normal(name) = component {
            current = format!("{}/{}", current, name.to_string_lossy());

            // Check if already created
            let should_create = {
                let dirs = created_dirs.lock().map_err(|e| e.to_string())?;
                !dirs.contains(&current)
            };

            if should_create {
                // Try to create, ignore if exists
                let _ = ftp.mkdir(&current);

                // Mark as created
                if let Ok(mut dirs) = created_dirs.lock() {
                    dirs.insert(current.clone());
                }
            }
        }
    }

    Ok(())
}
