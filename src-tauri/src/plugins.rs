use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub command: String,
    pub aliases: Vec<String>,
    pub version: String,
    pub description: String,
    pub capabilities: Vec<String>,
    pub default_size: String,
    pub has_settings: bool,
    pub src: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawPluginManifest {
    id: String,
    name: String,
    command: Option<String>,
    aliases: Option<Vec<String>>,
    version: Option<String>,
    description: Option<String>,
    capabilities: Option<Vec<String>>,
    default_size: Option<String>,
    has_settings: Option<bool>,
}

pub fn discover_plugins(app: &AppHandle) -> Result<Vec<PluginManifest>, String> {
    let plugins_dir = resolve_plugins_dir(app)?;
    let Ok(entries) = fs::read_dir(&plugins_dir) else {
        return Ok(Vec::new());
    };

    let mut plugins = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !is_plugin_file(&path) {
            continue;
        }

        let html = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        let Some(raw) = parse_manifest(&html) else {
            continue;
        };

        if raw.id == "notes" {
            continue;
        }

        plugins.push(PluginManifest {
            command: raw.command.clone().unwrap_or_else(|| raw.id.clone()),
            id: raw.id,
            name: raw.name,
            aliases: raw.aliases.unwrap_or_default(),
            version: raw.version.unwrap_or_else(|| "1.0.0".to_string()),
            description: raw.description.unwrap_or_default(),
            capabilities: raw.capabilities.unwrap_or_default(),
            default_size: raw.default_size.unwrap_or_else(|| "big".to_string()),
            has_settings: raw.has_settings.unwrap_or(false),
            src: path.to_string_lossy().to_string(),
        });
    }

    plugins.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(plugins)
}

pub fn resolve_font_path(app: &AppHandle) -> Option<PathBuf> {
    let resource = app.path().resource_dir().ok()?.join("figtree.ttf");
    if resource.exists() {
        return Some(resource);
    }
    let cache = app.path().app_cache_dir().ok()?.join("figtree.ttf");
    cache.exists().then_some(cache)
}

fn resolve_plugins_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let resource_plugins = app
        .path()
        .resource_dir()
        .map(|path| path.join("plugins"))
        .map_err(|error| error.to_string())?;

    if resource_plugins.exists() {
        return Ok(resource_plugins);
    }

    let dev_plugins = std::env::current_dir()
        .map_err(|error| error.to_string())?
        .join("plugins");
    let cache_plugins = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("plugins");

    copy_plugins_for_asset_protocol(&dev_plugins, &cache_plugins)?;
    copy_plugin_asset_for_asset_protocol("figtree.ttf", &cache_plugins)?;
    Ok(cache_plugins)
}

fn is_plugin_file(path: &Path) -> bool {
    path.is_file()
        && path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with(".plugin.html"))
}

fn parse_manifest(html: &str) -> Option<RawPluginManifest> {
    let marker = "id=\"captainslog-plugin\"";
    let script_start = html
        .find(marker)
        .or_else(|| html.find("id='captainslog-plugin'"))?;
    let script_after_marker = &html[script_start..];
    let content_start = script_after_marker.find('>')? + script_start + 1;
    let content_end = html[content_start..].find("</script>")? + content_start;
    serde_json::from_str(html[content_start..content_end].trim()).ok()
}

fn copy_plugins_for_asset_protocol(source_dir: &Path, target_dir: &Path) -> Result<(), String> {
    if !source_dir.exists() {
        return Ok(());
    }

    fs::create_dir_all(target_dir).map_err(|error| error.to_string())?;

    for entry in fs::read_dir(source_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let source_path = entry.path();
        if !is_plugin_file(&source_path) {
            continue;
        }

        let target_path = target_dir.join(entry.file_name());
        fs::copy(source_path, target_path).map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn copy_plugin_asset_for_asset_protocol(filename: &str, plugins_dir: &Path) -> Result<(), String> {
    let Some(cache_dir) = plugins_dir.parent() else {
        return Ok(());
    };
    let source = std::env::current_dir()
        .map_err(|error| error.to_string())?
        .join("public")
        .join("assets")
        .join(filename);
    if !source.exists() {
        return Ok(());
    }

    fs::copy(&source, cache_dir.join(filename)).map_err(|error| error.to_string())?;
    fs::copy(source, plugins_dir.join(filename)).map_err(|error| error.to_string())?;
    Ok(())
}
