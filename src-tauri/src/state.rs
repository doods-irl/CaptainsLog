use crate::plugins::{discover_plugins, PluginManifest};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Theme {
    pub color: String,
    pub theme: String,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum EditorMode {
    #[default]
    Mini,
    Big,
}

impl EditorMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Mini => "mini",
            Self::Big => "big",
        }
    }
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigFile {
    file_path: Option<PathBuf>,
    color: Option<String>,
    theme: Option<String>,
}

#[derive(Default, Deserialize, Serialize)]
struct PluginStateFile {
    plugins: HashMap<String, Value>,
}

pub struct AppState {
    pub active_plugin_id: Option<String>,
    pub config_path: Option<PathBuf>,
    pub editor_mode: EditorMode,
    pub file_path: Option<PathBuf>,
    pub plugins: Vec<PluginManifest>,
    pub plugin_state_path: Option<PathBuf>,
    pub plugin_state: HashMap<String, Value>,
    pub theme: Theme,
    loaded: bool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            active_plugin_id: None,
            config_path: None,
            editor_mode: EditorMode::Mini,
            file_path: None,
            plugins: Vec::new(),
            plugin_state_path: None,
            plugin_state: HashMap::new(),
            theme: Theme {
                color: "tomato".to_string(),
                theme: "light".to_string(),
            },
            loaded: false,
        }
    }
}

impl AppState {
    pub fn load_if_needed(&mut self, app: &AppHandle) -> Result<(), String> {
        if self.loaded {
            return Ok(());
        }

        let app_data = app_data_dir(app)?;
        fs::create_dir_all(&app_data).map_err(|error| error.to_string())?;

        self.config_path = Some(app_data.join("config.json"));
        self.plugin_state_path = Some(app_data.join("plugin-state.json"));
        self.copy_legacy_state_if_needed()?;
        self.plugins = discover_plugins(app)?;
        self.load_config()?;
        self.load_plugin_state()?;
        self.loaded = true;

        Ok(())
    }

    pub fn file_path(&self) -> Result<&Path, String> {
        self.file_path
            .as_deref()
            .ok_or_else(|| "Log file path is not configured".to_string())
    }

    pub fn config_path_string(&self) -> String {
        self.config_path
            .as_ref()
            .map(path_to_string)
            .unwrap_or_default()
    }

    pub fn file_path_string(&self) -> String {
        self.file_path
            .as_ref()
            .map(path_to_string)
            .unwrap_or_default()
    }

    pub fn plugin_data(&self, plugin_id: &str) -> Option<&Value> {
        self.plugin_state.get(plugin_id)
    }

    pub fn plugin_enabled(&self, plugin_id: &str) -> bool {
        if plugin_id == "settings" {
            return true;
        }

        self.plugin_state
            .get(plugin_id)
            .and_then(|value| value.get("enabled"))
            .and_then(Value::as_bool)
            .unwrap_or(true)
    }

    pub fn set_plugin_enabled(&mut self, plugin_id: &str, enabled: bool) -> Result<(), String> {
        let mut data = self
            .plugin_state
            .get(plugin_id)
            .cloned()
            .unwrap_or_else(|| Value::Object(Default::default()));
        if !data.is_object() {
            data = Value::Object(Default::default());
        }
        data["enabled"] = Value::Bool(enabled);
        self.set_plugin_data(plugin_id, data)
    }

    pub fn set_plugin_data(&mut self, plugin_id: &str, value: Value) -> Result<(), String> {
        self.plugin_state.insert(plugin_id.to_string(), value);
        self.write_plugin_state()
    }

    pub fn write_config(&self) -> Result<(), String> {
        let path = self
            .config_path
            .as_ref()
            .ok_or_else(|| "Config path is not available".to_string())?;
        let config = ConfigFile {
            file_path: self.file_path.clone(),
            color: Some(self.theme.color.to_string()),
            theme: Some(self.theme.theme.to_string()),
        };
        write_json(path, &config)
    }

    fn load_config(&mut self) -> Result<(), String> {
        let Some(path) = &self.config_path else {
            return Ok(());
        };

        if !path.exists() {
            return Ok(());
        }

        let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
        let config: ConfigFile = serde_json::from_str(&raw).map_err(|error| error.to_string())?;

        self.file_path = config.file_path;
        self.theme = Theme {
            color: config.color.unwrap_or_else(|| "tomato".to_string()),
            theme: config.theme.unwrap_or_else(|| "light".to_string()),
        };

        Ok(())
    }

    fn load_plugin_state(&mut self) -> Result<(), String> {
        let Some(path) = &self.plugin_state_path else {
            return Ok(());
        };

        if !path.exists() {
            self.plugin_state = HashMap::new();
            self.write_plugin_state()?;
            return Ok(());
        }

        let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
        if raw.trim().is_empty() {
            self.plugin_state = HashMap::new();
            return Ok(());
        }

        let state: PluginStateFile = serde_json::from_str(&raw).unwrap_or_default();
        self.plugin_state = state.plugins;
        Ok(())
    }

    fn write_plugin_state(&self) -> Result<(), String> {
        let path = self
            .plugin_state_path
            .as_ref()
            .ok_or_else(|| "Plugin state path is not available".to_string())?;
        write_json(
            path,
            &PluginStateFile {
                plugins: self.plugin_state.clone(),
            },
        )
    }

    fn copy_legacy_state_if_needed(&self) -> Result<(), String> {
        copy_legacy_file_if_needed(self.config_path.as_deref(), "config.json")?;
        copy_legacy_file_if_needed(self.plugin_state_path.as_deref(), "plugin-state.json")
    }
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = app.path().app_data_dir() {
        return Ok(path);
    }

    dirs::data_dir()
        .map(|path| path.join("Captain's Log"))
        .ok_or_else(|| "Could not resolve app data directory".to_string())
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let content = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

fn path_to_string(path: &PathBuf) -> String {
    path.to_string_lossy().to_string()
}

fn copy_legacy_file_if_needed(target: Option<&Path>, filename: &str) -> Result<(), String> {
    let Some(target) = target else {
        return Ok(());
    };

    if target.exists() {
        return Ok(());
    }

    let Some(source) = legacy_app_dirs()
        .into_iter()
        .map(|directory| directory.join(filename))
        .find(|path| path.exists())
    else {
        return Ok(());
    };

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::copy(source, target).map_err(|error| error.to_string())?;
    Ok(())
}

fn legacy_app_dirs() -> Vec<PathBuf> {
    dirs::data_dir()
        .map(|data_dir| {
            vec![
                data_dir.join("Captain's Log"),
                data_dir.join("captainslog"),
                data_dir.join("CaptainsLog"),
            ]
        })
        .unwrap_or_default()
}
