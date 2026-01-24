//! Transfer Resume Module
//!
//! Implements resumable file transfers for interrupted uploads.
//! Tracks transfer state and uses FTP REST/APPE commands or SFTP seek.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom, Write as IoWrite};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Transfer state for a single file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTransferState {
    pub path: String,
    pub local_path: String,
    pub remote_path: String,
    pub total_size: u64,
    pub transferred_bytes: u64,
    pub checksum: Option<String>,
    pub started_at: String,
    pub updated_at: String,
    pub status: TransferStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TransferStatus {
    Pending,
    InProgress,
    Paused,
    Completed,
    Failed,
}

/// Transfer session for a project sync
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferSession {
    pub id: String,
    pub project_id: String,
    pub started_at: String,
    pub files: HashMap<String, FileTransferState>,
    pub completed: bool,
}

impl TransferSession {
    pub fn new(project_id: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            project_id: project_id.to_string(),
            started_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            files: HashMap::new(),
            completed: false,
        }
    }

    pub fn add_file(&mut self, path: &str, local_path: &str, remote_path: &str, total_size: u64) {
        let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
        self.files.insert(
            path.to_string(),
            FileTransferState {
                path: path.to_string(),
                local_path: local_path.to_string(),
                remote_path: remote_path.to_string(),
                total_size,
                transferred_bytes: 0,
                checksum: None,
                started_at: now.clone(),
                updated_at: now,
                status: TransferStatus::Pending,
            },
        );
    }

    pub fn update_progress(&mut self, path: &str, transferred: u64) {
        if let Some(state) = self.files.get_mut(path) {
            state.transferred_bytes = transferred;
            state.updated_at = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
            state.status = TransferStatus::InProgress;
        }
    }

    pub fn mark_completed(&mut self, path: &str) {
        if let Some(state) = self.files.get_mut(path) {
            state.transferred_bytes = state.total_size;
            state.status = TransferStatus::Completed;
            state.updated_at = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
        }
    }

    pub fn mark_failed(&mut self, path: &str) {
        if let Some(state) = self.files.get_mut(path) {
            state.status = TransferStatus::Failed;
            state.updated_at = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
        }
    }

    pub fn get_resumable_files(&self) -> Vec<&FileTransferState> {
        self.files
            .values()
            .filter(|f| {
                f.status == TransferStatus::InProgress
                    || f.status == TransferStatus::Paused
                    || f.status == TransferStatus::Failed
            })
            .filter(|f| f.transferred_bytes > 0 && f.transferred_bytes < f.total_size)
            .collect()
    }

    pub fn get_pending_files(&self) -> Vec<&FileTransferState> {
        self.files
            .values()
            .filter(|f| f.status == TransferStatus::Pending || f.status == TransferStatus::Failed)
            .collect()
    }

    pub fn is_complete(&self) -> bool {
        self.files.values().all(|f| f.status == TransferStatus::Completed)
    }
}

/// Session storage for persistence
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TransferSessionStore {
    pub sessions: HashMap<String, TransferSession>,
}

impl TransferSessionStore {
    pub fn get_session(&self, project_id: &str) -> Option<&TransferSession> {
        self.sessions
            .values()
            .filter(|s| s.project_id == project_id && !s.completed)
            .max_by_key(|s| &s.started_at)
    }

    pub fn get_session_mut(&mut self, project_id: &str) -> Option<&mut TransferSession> {
        let session_id = self
            .sessions
            .values()
            .filter(|s| s.project_id == project_id && !s.completed)
            .max_by_key(|s| &s.started_at)
            .map(|s| s.id.clone());

        session_id.and_then(|id| self.sessions.get_mut(&id))
    }

    pub fn create_session(&mut self, project_id: &str) -> String {
        let session = TransferSession::new(project_id);
        let id = session.id.clone();
        self.sessions.insert(id.clone(), session);
        id
    }

    pub fn complete_session(&mut self, session_id: &str) {
        if let Some(session) = self.sessions.get_mut(session_id) {
            session.completed = true;
        }
    }

    pub fn cleanup_old_sessions(&mut self, max_age_hours: i64) {
        let cutoff = chrono::Utc::now() - chrono::Duration::hours(max_age_hours);
        self.sessions.retain(|_, s| {
            if let Ok(started) = chrono::DateTime::parse_from_rfc3339(&s.started_at) {
                started.with_timezone(&chrono::Utc) > cutoff || !s.completed
            } else {
                true
            }
        });
    }
}

/// Get transfer session storage path
pub fn get_sessions_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("transfer_sessions.json")
}

/// Load transfer sessions from disk
pub fn load_sessions(app_data_dir: &Path) -> Result<TransferSessionStore, String> {
    let path = get_sessions_path(app_data_dir);

    if !path.exists() {
        return Ok(TransferSessionStore::default());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read sessions file: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse sessions: {}", e))
}

/// Save transfer sessions to disk
pub fn save_sessions(app_data_dir: &Path, store: &TransferSessionStore) -> Result<(), String> {
    let path = get_sessions_path(app_data_dir);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create sessions directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize sessions: {}", e))?;

    fs::write(&path, content)
        .map_err(|e| format!("Failed to write sessions file: {}", e))
}

/// Resume SFTP upload from offset
pub fn resume_sftp_upload(
    sess: &ssh2::Session,
    local_path: &str,
    remote_path: &str,
    offset: u64,
) -> Result<u64, String> {
    let sftp = sess.sftp().map_err(|e| format!("SFTP error: {}", e))?;

    // Open local file and seek to offset
    let mut local_file = File::open(local_path)
        .map_err(|e| format!("Failed to open local file: {}", e))?;
    let file_size = local_file
        .metadata()
        .map_err(|e| format!("Failed to get file metadata: {}", e))?
        .len();

    local_file
        .seek(SeekFrom::Start(offset))
        .map_err(|e| format!("Failed to seek in local file: {}", e))?;

    // Open remote file for appending (or create if it doesn't exist)
    let mut remote_file = if offset > 0 {
        // Try to open existing file and seek
        match sftp.open(Path::new(remote_path)) {
            Ok(mut f) => {
                // Verify remote file size matches expected offset
                if let Ok(stat) = f.stat() {
                    if let Some(size) = stat.size {
                        if size != offset {
                            // Remote file size doesn't match, start over
                            drop(f);
                            sftp.create(Path::new(remote_path))
                                .map_err(|e| format!("Failed to recreate remote file: {}", e))?
                        } else {
                            // Seek to end for appending
                            let _ = f.seek(std::io::SeekFrom::End(0));
                            f
                        }
                    } else {
                        f
                    }
                } else {
                    f
                }
            }
            Err(_) => {
                // File doesn't exist, create it
                sftp.create(Path::new(remote_path))
                    .map_err(|e| format!("Failed to create remote file: {}", e))?
            }
        }
    } else {
        // Fresh upload, create file
        sftp.create(Path::new(remote_path))
            .map_err(|e| format!("Failed to create remote file: {}", e))?
    };

    // Transfer remaining data
    let chunk_size = 65536; // 64KB chunks
    let mut buffer = vec![0u8; chunk_size];
    let mut transferred = offset;

    loop {
        let bytes_read = local_file
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read local file: {}", e))?;

        if bytes_read == 0 {
            break;
        }

        remote_file
            .write_all(&buffer[..bytes_read])
            .map_err(|e| format!("Failed to write to remote file: {}", e))?;

        transferred += bytes_read as u64;
    }

    Ok(transferred)
}

/// Get remote file size for resume calculation
pub fn get_remote_sftp_size(sess: &ssh2::Session, remote_path: &str) -> Result<u64, String> {
    let sftp = sess.sftp().map_err(|e| format!("SFTP error: {}", e))?;

    match sftp.stat(Path::new(remote_path)) {
        Ok(stat) => Ok(stat.size.unwrap_or(0)),
        Err(_) => Ok(0), // File doesn't exist
    }
}

/// Resume FTP upload using REST command
pub fn resume_ftp_upload(
    ftp: &mut suppaftp::FtpStream,
    local_path: &str,
    remote_path: &str,
    offset: u64,
) -> Result<u64, String> {
    // Open local file and seek to offset
    let mut local_file = File::open(local_path)
        .map_err(|e| format!("Failed to open local file: {}", e))?;

    local_file
        .seek(SeekFrom::Start(offset))
        .map_err(|e| format!("Failed to seek in local file: {}", e))?;

    // Read remaining content
    let mut buffer = Vec::new();
    local_file
        .read_to_end(&mut buffer)
        .map_err(|e| format!("Failed to read local file: {}", e))?;

    if offset > 0 {
        // Use APPE (append) command for resuming
        let cursor = std::io::Cursor::new(buffer);
        ftp.append_file(remote_path, &mut cursor.clone())
            .map_err(|e| format!("Failed to append to remote file: {}", e))?;
    } else {
        // Fresh upload
        let cursor = std::io::Cursor::new(buffer);
        ftp.put_file(remote_path, &mut cursor.clone())
            .map_err(|e| format!("Failed to upload remote file: {}", e))?;
    }

    // Get final file size
    let file_size = local_file
        .metadata()
        .map_err(|e| format!("Failed to get file metadata: {}", e))?
        .len();

    Ok(file_size)
}

/// Get remote file size for FTP resume calculation
pub fn get_remote_ftp_size(ftp: &mut suppaftp::FtpStream, remote_path: &str) -> Result<u64, String> {
    match ftp.size(remote_path) {
        Ok(size) => Ok(size as u64),
        Err(_) => Ok(0), // File doesn't exist or command not supported
    }
}
