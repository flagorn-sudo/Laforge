use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
pub struct FileWatcherEvent {
    pub event_type: String,
    pub path: String,
    pub file_name: String,
    pub extension: Option<String>,
    pub project_id: String,
}

struct WatcherState {
    watcher: Option<RecommendedWatcher>,
    stop_sender: Option<Sender<()>>,
}

pub struct FileWatcherManager {
    watchers: Arc<Mutex<HashMap<String, WatcherState>>>,
}

impl FileWatcherManager {
    pub fn new() -> Self {
        FileWatcherManager {
            watchers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn start_watching(
        &self,
        project_id: String,
        inbox_path: String,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        let mut watchers = self.watchers.lock().map_err(|e| e.to_string())?;

        // Stop existing watcher for this project if any
        if let Some(state) = watchers.get_mut(&project_id) {
            if let Some(sender) = state.stop_sender.take() {
                let _ = sender.send(());
            }
            state.watcher = None;
        }

        // Create inbox directory if it doesn't exist
        let inbox = Path::new(&inbox_path);
        if !inbox.exists() {
            fs::create_dir_all(inbox).map_err(|e| format!("Failed to create inbox: {}", e))?;
        }

        let (stop_tx, stop_rx): (Sender<()>, Receiver<()>) = channel();
        let project_id_clone = project_id.clone();
        let inbox_path_clone = inbox_path.clone();

        // Create the watcher
        let (tx, rx) = channel();

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    let _ = tx.send(event);
                }
            },
            Config::default(),
        )
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

        watcher
            .watch(Path::new(&inbox_path), RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch path: {}", e))?;

        // Spawn thread to handle events
        let app_handle_clone = app_handle.clone();
        thread::spawn(move || {
            loop {
                // Check for stop signal
                if stop_rx.try_recv().is_ok() {
                    break;
                }

                // Check for file events
                if let Ok(event) = rx.recv_timeout(std::time::Duration::from_millis(100)) {
                    for path in event.paths {
                        // Skip if not a file or hidden/temp file
                        if !path.is_file() {
                            continue;
                        }

                        let file_name = match path.file_name() {
                            Some(name) => name.to_string_lossy().to_string(),
                            None => continue,
                        };

                        // Skip hidden files and temp files
                        if file_name.starts_with('.')
                            || file_name.ends_with(".tmp")
                            || file_name.ends_with(".crdownload")
                            || file_name.ends_with(".part")
                        {
                            continue;
                        }

                        // Only handle Create events
                        if !matches!(
                            event.kind,
                            notify::EventKind::Create(_) | notify::EventKind::Modify(_)
                        ) {
                            continue;
                        }

                        let extension = path
                            .extension()
                            .map(|e| e.to_string_lossy().to_lowercase());

                        let watcher_event = FileWatcherEvent {
                            event_type: "file_added".to_string(),
                            path: path.to_string_lossy().to_string(),
                            file_name,
                            extension,
                            project_id: project_id_clone.clone(),
                        };

                        // Emit event to frontend
                        let _ = app_handle_clone.emit_all("file-watcher-event", watcher_event);
                    }
                }
            }
        });

        watchers.insert(
            project_id,
            WatcherState {
                watcher: Some(watcher),
                stop_sender: Some(stop_tx),
            },
        );

        Ok(())
    }

    pub fn stop_watching(&self, project_id: &str) -> Result<(), String> {
        let mut watchers = self.watchers.lock().map_err(|e| e.to_string())?;

        if let Some(state) = watchers.get_mut(project_id) {
            if let Some(sender) = state.stop_sender.take() {
                let _ = sender.send(());
            }
            state.watcher = None;
        }

        watchers.remove(project_id);
        Ok(())
    }

    pub fn stop_all(&self) -> Result<(), String> {
        let mut watchers = self.watchers.lock().map_err(|e| e.to_string())?;

        for (_, state) in watchers.iter_mut() {
            if let Some(sender) = state.stop_sender.take() {
                let _ = sender.send(());
            }
        }

        watchers.clear();
        Ok(())
    }
}

impl Default for FileWatcherManager {
    fn default() -> Self {
        Self::new()
    }
}
