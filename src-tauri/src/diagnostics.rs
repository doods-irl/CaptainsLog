use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const LOG_FILE_NAME: &str = "captains-log-debug.log";

pub fn log_app(app: &AppHandle, message: impl AsRef<str>) {
    let path = log_path(app);
    append_line(path, message.as_ref());
}

pub fn log_path_string(app: &AppHandle) -> String {
    log_path(app).to_string_lossy().to_string()
}

pub fn log_panic(message: impl AsRef<str>) {
    let path = fallback_log_path();
    append_line(path, message.as_ref());
}

fn log_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_log_dir()
        .or_else(|_| app.path().app_data_dir())
        .unwrap_or_else(|_| fallback_log_dir())
        .join(LOG_FILE_NAME)
}

fn fallback_log_path() -> PathBuf {
    fallback_log_dir().join(LOG_FILE_NAME)
}

fn fallback_log_dir() -> PathBuf {
    std::env::temp_dir().join("CaptainsLog")
}

fn append_line(path: PathBuf, message: &str) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "[{}] {}", timestamp_ms(), message);
    }
}

fn timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}
