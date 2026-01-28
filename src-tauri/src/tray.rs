use tauri::{
    AppHandle, CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu,
    SystemTrayMenuItem, SystemTraySubmenu,
};

/// Create the system tray with initial menu
pub fn create_system_tray() -> SystemTray {
    let menu = create_tray_menu(Vec::new());
    SystemTray::new().with_menu(menu)
}

/// Create the tray menu with recent projects
fn create_tray_menu(recent_projects: Vec<RecentProject>) -> SystemTrayMenu {
    let mut menu = SystemTrayMenu::new();

    // Header
    menu = menu.add_item(
        CustomMenuItem::new("header", "Projets récents")
            .disabled()
    );
    menu = menu.add_native_item(SystemTrayMenuItem::Separator);

    // Add recent projects (up to 7)
    if recent_projects.is_empty() {
        menu = menu.add_item(
            CustomMenuItem::new("no_projects", "Aucun projet")
                .disabled()
        );
    } else {
        for project in recent_projects.iter().take(7) {
            let label = if let Some(ref client) = project.client {
                format!("{} ({})", project.name, client)
            } else {
                project.name.clone()
            };

            // Create submenu for each project
            let mut submenu = SystemTrayMenu::new();

            // Timer controls - based on timer state
            if project.has_active_timer {
                if project.is_timer_paused {
                    // Timer is paused - show resume option
                    submenu = submenu.add_item(
                        CustomMenuItem::new(format!("timer-resume:{}", project.id), "▶️ Reprendre le timer")
                    );
                } else {
                    // Timer is running - show pause option
                    submenu = submenu.add_item(
                        CustomMenuItem::new(format!("timer-pause:{}", project.id), "⏸️ Mettre en pause")
                    );
                }
                // Stop option always available when timer is active
                submenu = submenu.add_item(
                    CustomMenuItem::new(format!("timer-stop:{}", project.id), "⏹️ Arrêter le timer")
                );
            } else {
                // No active timer - show start option
                submenu = submenu.add_item(
                    CustomMenuItem::new(format!("timer-start:{}", project.id), "▶️ Démarrer le timer")
                );
            }

            submenu = submenu.add_native_item(SystemTrayMenuItem::Separator);

            // Open in Finder - always available
            submenu = submenu.add_item(
                CustomMenuItem::new(format!("finder:{}", project.id), "📁 Ouvrir le dossier")
            );

            // Sync FTP - only enabled if FTP is configured
            let sync_item = CustomMenuItem::new(format!("sync:{}", project.id), "🔄 Synchroniser FTP");
            if project.has_ftp {
                submenu = submenu.add_item(sync_item);
            } else {
                submenu = submenu.add_item(sync_item.disabled());
            }

            menu = menu.add_submenu(SystemTraySubmenu::new(label, submenu));
        }
    }

    menu = menu.add_native_item(SystemTrayMenuItem::Separator);

    // Show main window option
    menu = menu.add_item(CustomMenuItem::new("show_window", "Afficher La Forge"));

    menu = menu.add_native_item(SystemTrayMenuItem::Separator);

    // Quit option
    menu = menu.add_item(CustomMenuItem::new("quit", "Quitter La Forge"));

    menu
}

/// Handle system tray events
pub fn handle_tray_event(app: &AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::LeftClick { .. } | SystemTrayEvent::DoubleClick { .. } => {
            // Do nothing on click - only show the menu
            // Window is shown only via "Afficher La Forge" menu item
        }
        SystemTrayEvent::MenuItemClick { id, .. } => {
            match id.as_str() {
                "show_window" => {
                    // Show and focus the main window
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    // Graceful shutdown - allows cleanup of threads and resources
                    app.exit(0);
                }
                id if id.starts_with("timer-start:") => {
                    // Extract project ID and emit timer start event
                    let project_id = id.strip_prefix("timer-start:").unwrap_or("");
                    let _ = app.emit_all("tray:timer-start", project_id);
                }
                id if id.starts_with("timer-pause:") => {
                    // Extract project ID and emit timer pause event
                    let project_id = id.strip_prefix("timer-pause:").unwrap_or("");
                    let _ = app.emit_all("tray:timer-pause", project_id);
                }
                id if id.starts_with("timer-resume:") => {
                    // Extract project ID and emit timer resume event
                    let project_id = id.strip_prefix("timer-resume:").unwrap_or("");
                    let _ = app.emit_all("tray:timer-resume", project_id);
                }
                id if id.starts_with("timer-stop:") => {
                    // Extract project ID and emit timer stop event
                    let project_id = id.strip_prefix("timer-stop:").unwrap_or("");
                    let _ = app.emit_all("tray:timer-stop", project_id);
                }
                id if id.starts_with("finder:") => {
                    // Extract project ID and emit open finder event
                    let project_id = id.strip_prefix("finder:").unwrap_or("");
                    let _ = app.emit_all("tray:open-finder", project_id);
                }
                id if id.starts_with("sync:") => {
                    // Extract project ID and emit sync event
                    let project_id = id.strip_prefix("sync:").unwrap_or("");
                    let _ = app.emit_all("tray:sync-project", project_id);

                    // Also show the window
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                _ => {}
            }
        }
        _ => {}
    }
}

/// Struct for recent project info
#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct RecentProject {
    pub id: String,
    pub name: String,
    pub client: Option<String>,
    pub path: String,
    #[serde(rename = "hasFtp")]
    pub has_ftp: bool,
    #[serde(rename = "hasActiveTimer")]
    pub has_active_timer: bool,
    #[serde(rename = "isTimerPaused")]
    pub is_timer_paused: bool,
}

/// Update the tray menu with recent projects
#[tauri::command]
pub fn tray_update_recent_projects(app: AppHandle, projects: Vec<RecentProject>) -> Result<(), String> {
    let menu = create_tray_menu(projects);
    app.tray_handle()
        .set_menu(menu)
        .map_err(|e| e.to_string())
}

/// Check if system tray is available
#[tauri::command]
pub fn tray_is_available() -> bool {
    true
}

/// Tray icon state enum
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrayIconState {
    Normal,
    Syncing,
    Success,
}

/// Helper to load icon from file path
fn load_icon_from_path(path: std::path::PathBuf) -> Option<tauri::Icon> {
    if !path.exists() {
        return None;
    }

    match std::fs::read(&path) {
        Ok(bytes) => Some(tauri::Icon::Raw(bytes)),
        Err(_) => None,
    }
}

/// Set tray icon state with different visual indicators
/// - normal: default icon
/// - syncing: icon with sync indicator (blue/animated effect via tooltip)
/// - success: icon with success indicator (green checkmark)
#[tauri::command]
pub fn tray_set_sync_indicator(app: AppHandle, state: String) -> Result<(), String> {
    let tray_handle = app.tray_handle();

    // Parse state string (for backwards compatibility, "true" = syncing, "false" = normal)
    let icon_state = match state.as_str() {
        "true" | "syncing" => TrayIconState::Syncing,
        "false" | "normal" => TrayIconState::Normal,
        "success" => TrayIconState::Success,
        _ => TrayIconState::Normal,
    };

    match icon_state {
        TrayIconState::Syncing => {
            // Try to set syncing icon
            if let Some(path) = app.path_resolver().resolve_resource("icons/tray-icon-syncing.png") {
                if let Some(icon) = load_icon_from_path(path) {
                    let _ = tray_handle.set_icon(icon);
                }
            }
            let _ = tray_handle.set_tooltip("La Forge - Synchronisation en cours...");
        }
        TrayIconState::Success => {
            // Try to set success icon
            if let Some(path) = app.path_resolver().resolve_resource("icons/tray-icon-success.png") {
                if let Some(icon) = load_icon_from_path(path) {
                    let _ = tray_handle.set_icon(icon);
                }
            }
            let _ = tray_handle.set_tooltip("La Forge - Synchronisation reussie!");
        }
        TrayIconState::Normal => {
            // Restore normal icon
            if let Some(path) = app.path_resolver().resolve_resource("icons/tray-icon.png") {
                if let Some(icon) = load_icon_from_path(path) {
                    let _ = tray_handle.set_icon(icon);
                }
            }
            let _ = tray_handle.set_tooltip("La Forge");
        }
    }

    Ok(())
}
