//! Scheduler Module
//!
//! Implements automatic sync scheduling using cron expressions.
//! Supports daily, weekly, and custom schedules per project.

use cron::Schedule;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::Manager;

/// Schedule configuration for a project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncSchedule {
    pub project_id: String,
    pub enabled: bool,
    pub schedule_type: ScheduleType,
    pub cron_expression: Option<String>,
    pub next_run: Option<String>,
    pub last_run: Option<String>,
    pub last_result: Option<ScheduleResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ScheduleType {
    Hourly,
    Daily,
    Weekly,
    Monthly,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleResult {
    pub success: bool,
    pub timestamp: String,
    pub files_synced: usize,
    pub error: Option<String>,
}

/// Predefined cron expressions for common schedules
impl ScheduleType {
    pub fn to_cron(&self, hour: u32, minute: u32, day_of_week: Option<u32>) -> String {
        match self {
            ScheduleType::Hourly => format!("{} * * * *", minute),
            ScheduleType::Daily => format!("{} {} * * *", minute, hour),
            ScheduleType::Weekly => {
                let dow = day_of_week.unwrap_or(1); // Monday by default
                format!("{} {} * * {}", minute, hour, dow)
            }
            ScheduleType::Monthly => format!("{} {} 1 * *", minute, hour),
            ScheduleType::Custom => String::new(),
        }
    }
}

/// Global scheduler state
static SCHEDULER_STATE: Lazy<Mutex<SchedulerState>> = Lazy::new(|| {
    Mutex::new(SchedulerState {
        schedules: HashMap::new(),
        running: false,
    })
});

struct SchedulerState {
    schedules: HashMap<String, SyncSchedule>,
    running: bool,
}

/// Schedule event emitted when a scheduled sync should run
#[derive(Clone, Serialize)]
pub struct ScheduleEvent {
    pub project_id: String,
    pub schedule_type: String,
    pub timestamp: u64,
}

/// Start the scheduler background thread
pub fn start_scheduler(app_handle: tauri::AppHandle) {
    if let Ok(mut state) = SCHEDULER_STATE.lock() {
        if state.running {
            println!("[Scheduler] Already running");
            return;
        }
        state.running = true;
    }

    thread::spawn(move || {
        println!("[Scheduler] Background thread started");

        loop {
            // Check every minute
            thread::sleep(Duration::from_secs(60));

            let schedules_to_run = {
                let state = match SCHEDULER_STATE.lock() {
                    Ok(s) => s,
                    Err(_) => continue,
                };

                if !state.running {
                    println!("[Scheduler] Stopping background thread");
                    break;
                }

                let now = chrono::Utc::now();
                let mut to_run = Vec::new();

                for schedule in state.schedules.values() {
                    if !schedule.enabled {
                        continue;
                    }

                    // Get cron expression
                    let cron_expr = match &schedule.cron_expression {
                        Some(expr) => expr.clone(),
                        None => continue,
                    };

                    // Parse and check if should run now
                    if let Ok(parsed) = Schedule::from_str(&cron_expr) {
                        for next in parsed.upcoming(chrono::Utc).take(1) {
                            // Check if the next run time is within the last minute
                            let diff = (next - now).num_seconds().abs();
                            if diff < 60 {
                                to_run.push(schedule.project_id.clone());
                            }
                        }
                    }
                }

                to_run
            };

            // Emit events for schedules that should run
            for project_id in schedules_to_run {
                println!("[Scheduler] Triggering scheduled sync for project: {}", project_id);

                let _ = app_handle.emit_all(
                    "scheduled-sync",
                    ScheduleEvent {
                        project_id: project_id.clone(),
                        schedule_type: "scheduled".to_string(),
                        timestamp: chrono::Utc::now().timestamp_millis() as u64,
                    },
                );

                // Update last run timestamp
                if let Ok(mut state) = SCHEDULER_STATE.lock() {
                    if let Some(schedule) = state.schedules.get_mut(&project_id) {
                        schedule.last_run = Some(chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string());
                    }
                }
            }
        }
    });
}

/// Stop the scheduler
pub fn stop_scheduler() {
    if let Ok(mut state) = SCHEDULER_STATE.lock() {
        state.running = false;
    }
}

/// Add or update a schedule for a project
pub fn set_schedule(schedule: SyncSchedule) -> Result<SyncSchedule, String> {
    // Validate cron expression if provided
    if let Some(ref cron) = schedule.cron_expression {
        Schedule::from_str(cron)
            .map_err(|e| format!("Invalid cron expression: {}", e))?;
    }

    // Calculate next run time
    let mut updated_schedule = schedule.clone();
    if let Some(ref cron) = schedule.cron_expression {
        if let Ok(parsed) = Schedule::from_str(cron) {
            if let Some(next) = parsed.upcoming(chrono::Utc).next() {
                updated_schedule.next_run = Some(next.format("%Y-%m-%dT%H:%M:%SZ").to_string());
            }
        }
    }

    if let Ok(mut state) = SCHEDULER_STATE.lock() {
        state.schedules.insert(schedule.project_id.clone(), updated_schedule.clone());
    }

    Ok(updated_schedule)
}

/// Remove a schedule for a project
pub fn remove_schedule(project_id: &str) -> Result<(), String> {
    if let Ok(mut state) = SCHEDULER_STATE.lock() {
        state.schedules.remove(project_id);
        Ok(())
    } else {
        Err("Failed to access scheduler state".to_string())
    }
}

/// Get a schedule for a project
pub fn get_schedule(project_id: &str) -> Option<SyncSchedule> {
    SCHEDULER_STATE
        .lock()
        .ok()
        .and_then(|state| state.schedules.get(project_id).cloned())
}

/// Get all schedules
pub fn get_all_schedules() -> Vec<SyncSchedule> {
    SCHEDULER_STATE
        .lock()
        .map(|state| state.schedules.values().cloned().collect())
        .unwrap_or_default()
}

/// Update the last result of a scheduled sync
pub fn update_schedule_result(project_id: &str, result: ScheduleResult) {
    if let Ok(mut state) = SCHEDULER_STATE.lock() {
        if let Some(schedule) = state.schedules.get_mut(project_id) {
            schedule.last_result = Some(result);

            // Update next run time
            if let Some(ref cron) = schedule.cron_expression {
                if let Ok(parsed) = Schedule::from_str(cron) {
                    if let Some(next) = parsed.upcoming(chrono::Utc).next() {
                        schedule.next_run = Some(next.format("%Y-%m-%dT%H:%M:%SZ").to_string());
                    }
                }
            }
        }
    }
}

/// Enable or disable a schedule
pub fn set_schedule_enabled(project_id: &str, enabled: bool) -> Result<(), String> {
    if let Ok(mut state) = SCHEDULER_STATE.lock() {
        if let Some(schedule) = state.schedules.get_mut(project_id) {
            schedule.enabled = enabled;
            Ok(())
        } else {
            Err("Schedule not found".to_string())
        }
    } else {
        Err("Failed to access scheduler state".to_string())
    }
}

/// Load schedules from persistent storage
pub fn load_schedules(schedules: Vec<SyncSchedule>) {
    if let Ok(mut state) = SCHEDULER_STATE.lock() {
        for schedule in schedules {
            state.schedules.insert(schedule.project_id.clone(), schedule);
        }
    }
}

/// Export schedules for persistent storage
pub fn export_schedules() -> Vec<SyncSchedule> {
    get_all_schedules()
}
