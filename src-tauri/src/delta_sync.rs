//! Delta/Incremental Sync Module
//!
//! Implements smart delta synchronization that only transfers changed portions of files.
//! Uses hash-based change detection and chunked comparison for efficient transfers.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write as IoWrite};
use std::path::{Path, PathBuf};

/// Chunk size for delta comparison (64KB)
pub const CHUNK_SIZE: usize = 65536;

/// Minimum file size for chunked delta sync (files smaller than this are transferred entirely)
pub const MIN_DELTA_FILE_SIZE: u64 = 256 * 1024; // 256KB

/// File signature containing chunk hashes for delta comparison
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSignature {
    pub path: String,
    pub total_size: u64,
    pub full_hash: String,
    pub chunk_size: usize,
    pub chunk_hashes: Vec<ChunkHash>,
    pub modified_at: String,
    pub created_at: String,
}

/// Hash information for a single chunk
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkHash {
    pub index: usize,
    pub offset: u64,
    pub size: usize,
    pub hash: String,
}

/// Signature cache for a project
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SignatureCache {
    pub project_id: String,
    pub signatures: HashMap<String, FileSignature>,
    pub updated_at: String,
}

impl SignatureCache {
    pub fn new(project_id: &str) -> Self {
        Self {
            project_id: project_id.to_string(),
            signatures: HashMap::new(),
            updated_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        }
    }

    pub fn get_signature(&self, path: &str) -> Option<&FileSignature> {
        self.signatures.get(path)
    }

    pub fn update_signature(&mut self, signature: FileSignature) {
        self.signatures.insert(signature.path.clone(), signature);
        self.updated_at = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    }

    pub fn remove_signature(&mut self, path: &str) {
        self.signatures.remove(path);
    }
}

/// Delta analysis result for a file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDelta {
    pub path: String,
    pub status: DeltaStatus,
    pub total_size: u64,
    pub transfer_size: u64,
    pub changed_chunks: Vec<usize>,
    pub savings_percent: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DeltaStatus {
    /// File is new, transfer entirely
    New,
    /// File unchanged, skip transfer
    Unchanged,
    /// File modified, use delta transfer
    Modified,
    /// File too small for delta, transfer entirely
    SmallFile,
    /// File deleted on local
    Deleted,
}

/// Compute SHA-256 hash of data
fn compute_hash(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

/// Generate a file signature with chunk hashes
pub fn generate_file_signature(file_path: &Path, relative_path: &str) -> Result<FileSignature, String> {
    let mut file = File::open(file_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;

    let metadata = file.metadata()
        .map_err(|e| format!("Failed to get metadata: {}", e))?;

    let total_size = metadata.len();
    let modified_at = metadata
        .modified()
        .ok()
        .map(|t| {
            let datetime: chrono::DateTime<chrono::Utc> = t.into();
            datetime.format("%Y-%m-%dT%H:%M:%SZ").to_string()
        })
        .unwrap_or_default();

    // Read entire file for full hash and chunking
    let mut contents = Vec::new();
    file.read_to_end(&mut contents)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let full_hash = compute_hash(&contents);

    // Generate chunk hashes
    let mut chunk_hashes = Vec::new();
    let mut offset = 0u64;
    let mut index = 0;

    for chunk in contents.chunks(CHUNK_SIZE) {
        chunk_hashes.push(ChunkHash {
            index,
            offset,
            size: chunk.len(),
            hash: compute_hash(chunk),
        });
        offset += chunk.len() as u64;
        index += 1;
    }

    Ok(FileSignature {
        path: relative_path.to_string(),
        total_size,
        full_hash,
        chunk_size: CHUNK_SIZE,
        chunk_hashes,
        modified_at,
        created_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
    })
}

/// Compare a file against its cached signature to determine delta
pub fn compute_file_delta(
    file_path: &Path,
    relative_path: &str,
    cached_signature: Option<&FileSignature>,
) -> Result<FileDelta, String> {
    let metadata = fs::metadata(file_path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;

    let total_size = metadata.len();

    // No cached signature = new file
    let cached = match cached_signature {
        Some(sig) => sig,
        None => {
            return Ok(FileDelta {
                path: relative_path.to_string(),
                status: DeltaStatus::New,
                total_size,
                transfer_size: total_size,
                changed_chunks: vec![],
                savings_percent: 0.0,
            });
        }
    };

    // File too small for delta comparison
    if total_size < MIN_DELTA_FILE_SIZE {
        return Ok(FileDelta {
            path: relative_path.to_string(),
            status: DeltaStatus::SmallFile,
            total_size,
            transfer_size: total_size,
            changed_chunks: vec![],
            savings_percent: 0.0,
        });
    }

    // Read current file
    let mut file = File::open(file_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    let mut contents = Vec::new();
    file.read_to_end(&mut contents)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Check full hash first (quick unchanged check)
    let current_full_hash = compute_hash(&contents);
    if current_full_hash == cached.full_hash {
        return Ok(FileDelta {
            path: relative_path.to_string(),
            status: DeltaStatus::Unchanged,
            total_size,
            transfer_size: 0,
            changed_chunks: vec![],
            savings_percent: 100.0,
        });
    }

    // File changed - compare chunks to find which ones changed
    let mut changed_chunks = Vec::new();
    let mut transfer_size = 0u64;

    for (index, chunk) in contents.chunks(CHUNK_SIZE).enumerate() {
        let chunk_hash = compute_hash(chunk);

        // Check if this chunk exists in cached signature and matches
        let chunk_changed = cached
            .chunk_hashes
            .get(index)
            .map(|cached_chunk| cached_chunk.hash != chunk_hash)
            .unwrap_or(true); // New chunk if index doesn't exist

        if chunk_changed {
            changed_chunks.push(index);
            transfer_size += chunk.len() as u64;
        }
    }

    // Handle case where file got smaller (fewer chunks)
    // All missing chunks at the end are "changed" in the sense that remote has extra data

    let savings_percent = if total_size > 0 {
        ((total_size - transfer_size) as f32 / total_size as f32) * 100.0
    } else {
        0.0
    };

    Ok(FileDelta {
        path: relative_path.to_string(),
        status: DeltaStatus::Modified,
        total_size,
        transfer_size,
        changed_chunks,
        savings_percent,
    })
}

/// Analyze all files for delta sync
pub fn analyze_delta_sync(
    local_path: &str,
    cache: &SignatureCache,
) -> Result<Vec<FileDelta>, String> {
    let base_path = Path::new(local_path);
    if !base_path.exists() {
        return Err(format!("Local path does not exist: {}", local_path));
    }

    let mut deltas = Vec::new();

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

        // Compute delta for this file
        let cached_sig = cache.get_signature(&relative);
        match compute_file_delta(path, &relative, cached_sig) {
            Ok(delta) => deltas.push(delta),
            Err(e) => eprintln!("Warning: Failed to analyze {}: {}", relative, e),
        }
    }

    // Check for deleted files (in cache but not on disk)
    for cached_path in cache.signatures.keys() {
        let full_path = base_path.join(cached_path);
        if !full_path.exists() {
            deltas.push(FileDelta {
                path: cached_path.clone(),
                status: DeltaStatus::Deleted,
                total_size: 0,
                transfer_size: 0,
                changed_chunks: vec![],
                savings_percent: 100.0,
            });
        }
    }

    Ok(deltas)
}

/// Extract only the changed chunks from a file for transfer
pub fn extract_changed_chunks(
    file_path: &Path,
    changed_indices: &[usize],
) -> Result<Vec<(usize, Vec<u8>)>, String> {
    let mut file = File::open(file_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;

    let mut contents = Vec::new();
    file.read_to_end(&mut contents)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let mut chunks = Vec::new();

    for (index, chunk) in contents.chunks(CHUNK_SIZE).enumerate() {
        if changed_indices.contains(&index) {
            chunks.push((index, chunk.to_vec()));
        }
    }

    Ok(chunks)
}

/// Calculate total transfer savings from delta analysis
pub fn calculate_transfer_stats(deltas: &[FileDelta]) -> DeltaTransferStats {
    let mut total_size = 0u64;
    let mut transfer_size = 0u64;
    let mut new_files = 0;
    let mut modified_files = 0;
    let mut unchanged_files = 0;
    let mut deleted_files = 0;

    for delta in deltas {
        match delta.status {
            DeltaStatus::New | DeltaStatus::SmallFile => {
                new_files += 1;
                total_size += delta.total_size;
                transfer_size += delta.transfer_size;
            }
            DeltaStatus::Modified => {
                modified_files += 1;
                total_size += delta.total_size;
                transfer_size += delta.transfer_size;
            }
            DeltaStatus::Unchanged => {
                unchanged_files += 1;
                total_size += delta.total_size;
            }
            DeltaStatus::Deleted => {
                deleted_files += 1;
            }
        }
    }

    let savings_percent = if total_size > 0 {
        ((total_size - transfer_size) as f32 / total_size as f32) * 100.0
    } else {
        0.0
    };

    DeltaTransferStats {
        total_files: deltas.len(),
        new_files,
        modified_files,
        unchanged_files,
        deleted_files,
        total_size,
        transfer_size,
        savings_bytes: total_size - transfer_size,
        savings_percent,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeltaTransferStats {
    pub total_files: usize,
    pub new_files: usize,
    pub modified_files: usize,
    pub unchanged_files: usize,
    pub deleted_files: usize,
    pub total_size: u64,
    pub transfer_size: u64,
    pub savings_bytes: u64,
    pub savings_percent: f32,
}

/// Get signature cache storage path
pub fn get_cache_path(app_data_dir: &Path, project_id: &str) -> PathBuf {
    app_data_dir
        .join("delta_cache")
        .join(format!("{}.json", project_id))
}

/// Load signature cache from disk
pub fn load_cache(app_data_dir: &Path, project_id: &str) -> Result<SignatureCache, String> {
    let path = get_cache_path(app_data_dir, project_id);

    if !path.exists() {
        return Ok(SignatureCache::new(project_id));
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read cache file: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse cache: {}", e))
}

/// Save signature cache to disk
pub fn save_cache(app_data_dir: &Path, cache: &SignatureCache) -> Result<(), String> {
    let path = get_cache_path(app_data_dir, &cache.project_id);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create cache directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(cache)
        .map_err(|e| format!("Failed to serialize cache: {}", e))?;

    fs::write(&path, content)
        .map_err(|e| format!("Failed to write cache file: {}", e))
}

/// Update cache after successful sync
pub fn update_cache_after_sync(
    app_data_dir: &Path,
    project_id: &str,
    local_path: &str,
    synced_files: &[String],
) -> Result<SignatureCache, String> {
    let mut cache = load_cache(app_data_dir, project_id)?;
    let base_path = Path::new(local_path);

    for file_path in synced_files {
        let full_path = base_path.join(file_path);

        if full_path.exists() {
            match generate_file_signature(&full_path, file_path) {
                Ok(sig) => cache.update_signature(sig),
                Err(e) => eprintln!("Warning: Failed to update signature for {}: {}", file_path, e),
            }
        } else {
            // File was deleted
            cache.remove_signature(file_path);
        }
    }

    save_cache(app_data_dir, &cache)?;
    Ok(cache)
}
