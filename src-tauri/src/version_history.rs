//! Version History Module
//!
//! Tracks file versions before each sync, enabling rollback functionality.
//! Stores file metadata (hash, size, timestamp) and optionally file backups.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Version entry for a single file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileVersion {
    pub id: String,
    pub path: String,
    pub hash: String,
    pub size: u64,
    pub modified: String,
    pub sync_id: String,
    pub backup_path: Option<String>,
}

/// Sync snapshot containing all file versions at a point in time
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncSnapshot {
    pub id: String,
    pub project_id: String,
    pub timestamp: String,
    pub files: Vec<FileVersion>,
    pub total_size: u64,
    pub files_count: usize,
    pub message: Option<String>,
}

/// Version history store for a project
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectVersionHistory {
    pub project_id: String,
    pub snapshots: Vec<SyncSnapshot>,
    pub max_snapshots: usize,
}

impl ProjectVersionHistory {
    pub fn new(project_id: String) -> Self {
        Self {
            project_id,
            snapshots: Vec::new(),
            max_snapshots: 10, // Keep last 10 snapshots by default
        }
    }

    pub fn add_snapshot(&mut self, snapshot: SyncSnapshot) {
        self.snapshots.push(snapshot);

        // Prune old snapshots if exceeding limit
        while self.snapshots.len() > self.max_snapshots {
            let removed = self.snapshots.remove(0);
            // Clean up backup files for removed snapshot
            for file in &removed.files {
                if let Some(backup_path) = &file.backup_path {
                    let _ = fs::remove_file(backup_path);
                }
            }
        }
    }

    pub fn get_snapshot(&self, snapshot_id: &str) -> Option<&SyncSnapshot> {
        self.snapshots.iter().find(|s| s.id == snapshot_id)
    }

    pub fn get_latest_snapshot(&self) -> Option<&SyncSnapshot> {
        self.snapshots.last()
    }

    pub fn list_snapshots(&self) -> Vec<SnapshotSummary> {
        self.snapshots
            .iter()
            .map(|s| SnapshotSummary {
                id: s.id.clone(),
                timestamp: s.timestamp.clone(),
                files_count: s.files_count,
                total_size: s.total_size,
                message: s.message.clone(),
            })
            .collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotSummary {
    pub id: String,
    pub timestamp: String,
    pub files_count: usize,
    pub total_size: u64,
    pub message: Option<String>,
}

/// Compute SHA-256 hash of a file
pub fn compute_file_hash(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];

    loop {
        let bytes_read = file.read(&mut buffer).map_err(|e| format!("Failed to read file: {}", e))?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

/// Create a snapshot of the current local sync directory
pub fn create_snapshot(
    project_id: &str,
    local_path: &str,
    backup_dir: Option<&str>,
    message: Option<&str>,
) -> Result<SyncSnapshot, String> {
    let sync_id = Uuid::new_v4().to_string();
    let base_path = Path::new(local_path);

    if !base_path.exists() {
        return Err(format!("Local path does not exist: {}", local_path));
    }

    let mut files = Vec::new();
    let mut total_size = 0u64;

    // Walk directory and collect file info
    for entry in walkdir::WalkDir::new(local_path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        // Skip hidden files
        if let Some(name) = path.file_name() {
            if name.to_string_lossy().starts_with('.') {
                continue;
            }
        }

        // Get relative path
        let relative = match path.strip_prefix(base_path) {
            Ok(r) => r.to_string_lossy().to_string(),
            Err(_) => continue,
        };

        // Skip hidden directories
        if relative.split('/').any(|part| part.starts_with('.')) {
            continue;
        }

        let metadata = fs::metadata(path).map_err(|e| format!("Failed to read metadata: {}", e))?;
        let hash = compute_file_hash(path)?;
        let modified = metadata
            .modified()
            .ok()
            .map(|t| {
                let datetime: chrono::DateTime<chrono::Utc> = t.into();
                datetime.format("%Y-%m-%dT%H:%M:%SZ").to_string()
            })
            .unwrap_or_default();

        let size = metadata.len();
        total_size += size;

        // Optionally create backup
        let backup_path = if let Some(backup_base) = backup_dir {
            let backup_file_path = format!("{}/{}/{}", backup_base, sync_id, relative);
            if let Some(parent) = Path::new(&backup_file_path).parent() {
                let _ = fs::create_dir_all(parent);
            }
            if fs::copy(path, &backup_file_path).is_ok() {
                Some(backup_file_path)
            } else {
                None
            }
        } else {
            None
        };

        files.push(FileVersion {
            id: Uuid::new_v4().to_string(),
            path: relative,
            hash,
            size,
            modified,
            sync_id: sync_id.clone(),
            backup_path,
        });
    }

    let timestamp = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    Ok(SyncSnapshot {
        id: sync_id,
        project_id: project_id.to_string(),
        timestamp,
        files_count: files.len(),
        total_size,
        files,
        message: message.map(String::from),
    })
}

/// Compare two snapshots to find changed files
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotDiff {
    pub added: Vec<String>,
    pub modified: Vec<String>,
    pub deleted: Vec<String>,
    pub unchanged: Vec<String>,
}

pub fn compare_snapshots(old: &SyncSnapshot, new: &SyncSnapshot) -> SnapshotDiff {
    let old_files: HashMap<&str, &FileVersion> = old.files.iter().map(|f| (f.path.as_str(), f)).collect();
    let new_files: HashMap<&str, &FileVersion> = new.files.iter().map(|f| (f.path.as_str(), f)).collect();

    let mut added = Vec::new();
    let mut modified = Vec::new();
    let mut deleted = Vec::new();
    let mut unchanged = Vec::new();

    // Check new files
    for (path, new_file) in &new_files {
        match old_files.get(path) {
            Some(old_file) => {
                if old_file.hash != new_file.hash {
                    modified.push(path.to_string());
                } else {
                    unchanged.push(path.to_string());
                }
            }
            None => added.push(path.to_string()),
        }
    }

    // Check deleted files
    for path in old_files.keys() {
        if !new_files.contains_key(path) {
            deleted.push(path.to_string());
        }
    }

    SnapshotDiff {
        added,
        modified,
        deleted,
        unchanged,
    }
}

/// Restore files from a snapshot
pub fn restore_snapshot(
    snapshot: &SyncSnapshot,
    target_path: &str,
    files_to_restore: Option<Vec<String>>,
) -> Result<Vec<String>, String> {
    let target = Path::new(target_path);
    if !target.exists() {
        fs::create_dir_all(target).map_err(|e| format!("Failed to create target directory: {}", e))?;
    }

    let mut restored = Vec::new();

    for file_version in &snapshot.files {
        // Filter by specific files if provided
        if let Some(ref files) = files_to_restore {
            if !files.contains(&file_version.path) {
                continue;
            }
        }

        // Check if backup exists
        let backup_path = match &file_version.backup_path {
            Some(p) => p,
            None => continue, // Skip files without backup
        };

        let backup_file = Path::new(backup_path);
        if !backup_file.exists() {
            continue;
        }

        let target_file = target.join(&file_version.path);

        // Create parent directories
        if let Some(parent) = target_file.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        // Copy backup to target
        fs::copy(backup_file, &target_file)
            .map_err(|e| format!("Failed to restore {}: {}", file_version.path, e))?;

        restored.push(file_version.path.clone());
    }

    Ok(restored)
}

/// Get the version history storage path for a project
pub fn get_history_path(app_data_dir: &Path, project_id: &str) -> PathBuf {
    app_data_dir
        .join("version_history")
        .join(format!("{}.json", project_id))
}

/// Load version history for a project
pub fn load_history(app_data_dir: &Path, project_id: &str) -> Result<ProjectVersionHistory, String> {
    let path = get_history_path(app_data_dir, project_id);

    if !path.exists() {
        return Ok(ProjectVersionHistory::new(project_id.to_string()));
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read history file: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse history: {}", e))
}

/// Save version history for a project
pub fn save_history(app_data_dir: &Path, history: &ProjectVersionHistory) -> Result<(), String> {
    let path = get_history_path(app_data_dir, &history.project_id);

    // Ensure directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create history directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(history)
        .map_err(|e| format!("Failed to serialize history: {}", e))?;

    fs::write(&path, content)
        .map_err(|e| format!("Failed to write history file: {}", e))
}

/// Get backup directory path for a project
pub fn get_backup_dir(app_data_dir: &Path, project_id: &str) -> PathBuf {
    app_data_dir.join("backups").join(project_id)
}
