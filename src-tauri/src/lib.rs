mod diagnostics;
mod notes;
mod plugins;
mod state;
mod whisper;
mod windows;

use serde_json::{json, Value};
use state::{AppState, Theme};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;

fn default_theme() -> Theme {
    Theme {
        color: "tomato".to_string(),
        theme: "light".to_string(),
    }
}

#[tauri::command]
fn get_shell_state(app: AppHandle, state: State<'_, Mutex<AppState>>) -> Result<Value, String> {
    diagnostics::log_app(&app, "command get_shell_state");
    let mut state = state.lock().map_err(|error| error.to_string())?;
    state.load_if_needed(&app).map_err(|error| {
        diagnostics::log_app(&app, format!("get_shell_state load failed: {error}"));
        error
    })?;
    build_shell_state(&app, &mut state).map_err(|error| {
        diagnostics::log_app(&app, format!("get_shell_state build failed: {error}"));
        error
    })
}

#[tauri::command]
fn get_settings_data(app: AppHandle, state: State<'_, Mutex<AppState>>) -> Result<Value, String> {
    diagnostics::log_app(&app, "command get_settings_data");
    let mut state = state.lock().map_err(|error| error.to_string())?;
    state.load_if_needed(&app)?;

    Ok(json!({
        "configPath": state.config_path_string(),
        "filePath": state.file_path_string(),
        "accentColor": state.theme.color.clone(),
        "themeColor": state.theme.theme.clone(),
    }))
}

#[tauri::command]
fn invoke_host(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    method: String,
    params: Option<Value>,
) -> Result<Value, String> {
    diagnostics::log_app(&app, format!("command invoke_host {method}"));
    let params = params.unwrap_or(Value::Null);

    match method.as_str() {
        "whisper:status" => return whisper::status(&app),
        "whisper:download-model" => {
            let model = string_param(&params, "model")?;
            return whisper::download_model(&app, &model);
        }
        "whisper:download-engine" => return whisper::download_engine(&app),
        "whisper:list-ollama-models" => return Ok(whisper::list_ollama_models()),
        _ => {}
    }

    let mut state = state.lock().map_err(|error| error.to_string())?;
    state.load_if_needed(&app)?;

    let result = match method.as_str() {
        "shell:set-active-plugin" | "shell:activate-plugin" => {
            let plugin_id = string_param(&params, "pluginId")?;
            if !state.plugins.iter().any(|plugin| plugin.id == plugin_id) {
                return Err(format!("Unknown plugin: {plugin_id}"));
            }
            if !state.plugin_enabled(&plugin_id) {
                return Err(format!("Plugin is disabled: {plugin_id}"));
            }
            state.active_plugin_id = Some(plugin_id);
            json!({ "activePluginId": state.active_plugin_id.clone() })
        }
        "shell:list-plugins" => json!(plugins_payload(&state, false)),
        "shell:list-plugin-settings" => json!(plugins_payload(&state, true)),
        "shell:set-plugin-enabled" => {
            let plugin_id = string_param(&params, "pluginId")?;
            let enabled = params
                .get("enabled")
                .and_then(Value::as_bool)
                .ok_or_else(|| "Missing enabled".to_string())?;
            if plugin_id == "settings" {
                return Err("The settings plugin cannot be disabled".to_string());
            }
            if !state.plugins.iter().any(|plugin| plugin.id == plugin_id) {
                return Err(format!("Unknown plugin: {plugin_id}"));
            }
            state.set_plugin_enabled(&plugin_id, enabled)?;
            json!({ "ok": true })
        }
        "shell:open-plugin-settings" => {
            let plugin_id = string_param(&params, "pluginId")?;
            let Some(plugin) = state.plugins.iter().find(|plugin| plugin.id == plugin_id) else {
                return Err(format!("Unknown plugin: {plugin_id}"));
            };
            if !plugin.has_settings {
                return Err(format!("Plugin has no settings: {plugin_id}"));
            }
            emit_to_main(
                &app,
                "editor-command",
                json!({
                    "type": "open-plugin-settings",
                    "pluginId": plugin.id,
                    "command": plugin.command,
                }),
            )?;
            json!({ "ok": true })
        }
        "shell:activate-notes" => {
            state.active_plugin_id = Some("notes".to_string());
            json!({ "activePluginId": state.active_plugin_id.clone() })
        }
        "shell:get-state" => build_shell_state(&app, &mut state)?,
        "shell:reset-input" => {
            emit_to_main(&app, "editor-command", json!({ "type": "reset-input" }))?;
            json!({ "ok": true })
        }
        "shell:request-hide" => {
            windows::hide_main(&app)?;
            json!({ "ok": true })
        }
        "whisper:configure" => {
            let plugin_id = "whisper";
            let settings = params
                .get("settings")
                .cloned()
                .ok_or_else(|| "Missing settings".to_string())?;
            state.set_plugin_data(plugin_id, settings.clone())?;
            drop(state);
            let runtime = app.state::<Mutex<whisper::WhisperRuntime>>();
            return whisper::configure(&app, runtime, &settings);
        }
        "notes:add-entry" => {
            let form_data = string_param(&params, "formData")?;
            let notes = notes::add_entry(state.file_path()?, &form_data)?;
            emit_shell_state(&app, &mut state, Some(notes.clone()))?;
            notes
        }
        "notes:edit-logs" => {
            let notes =
                notes::edit_logs(state.file_path()?, value_param(&params, "logDataArray")?)?;
            emit_shell_state(&app, &mut state, Some(notes.clone()))?;
            notes
        }
        "notes:delete-logs" => {
            let notes =
                notes::delete_logs(state.file_path()?, value_param(&params, "logDataArray")?)?;
            emit_shell_state(&app, &mut state, Some(notes.clone()))?;
            notes
        }
        "notes:toggle-done" => {
            let notes =
                notes::toggle_done(state.file_path()?, value_param(&params, "logDataArray")?)?;
            emit_shell_state(&app, &mut state, Some(notes.clone()))?;
            notes
        }
        "notes:delete-category" => {
            let category_name = string_param(&params, "categoryName")?;
            let notes = notes::delete_category(state.file_path()?, &category_name)?;
            emit_shell_state(&app, &mut state, Some(notes.clone()))?;
            notes
        }
        "notes:empty-category" => {
            let category_name = string_param(&params, "categoryName")?;
            let notes = notes::empty_category(state.file_path()?, &category_name)?;
            emit_shell_state(&app, &mut state, Some(notes.clone()))?;
            notes
        }
        "notes:move-category" => {
            let category_name = string_param(&params, "categoryName")?;
            let position = params
                .get("position")
                .and_then(Value::as_u64)
                .ok_or_else(|| "Missing position".to_string())? as usize;
            let notes = notes::move_category(state.file_path()?, &category_name, position)?;
            emit_shell_state(&app, &mut state, Some(notes.clone()))?;
            notes
        }
        "plugin:get-data" => {
            let plugin_id = string_param(&params, "pluginId")?;
            state
                .plugin_data(&plugin_id)
                .cloned()
                .unwrap_or_else(|| json!({}))
        }
        "plugin:set-data" => {
            let plugin_id = string_param(&params, "pluginId")?;
            let data = params.get("data").cloned().unwrap_or_else(|| json!({}));
            state.set_plugin_data(&plugin_id, data.clone())?;
            data
        }
        "clipboard:write-text" => {
            let text = params.get("text").and_then(Value::as_str).unwrap_or("");
            app.clipboard()
                .write_text(text)
                .map_err(|error| error.to_string())?;
            json!({ "ok": true })
        }
        _ => return Err(format!("Unknown host method: {method}")),
    };

    if matches!(
        method.as_str(),
        "shell:set-active-plugin"
            | "shell:activate-plugin"
            | "shell:activate-notes"
            | "shell:reset-input"
            | "shell:set-plugin-enabled"
            | "plugin:set-data"
    ) {
        emit_shell_state(&app, &mut state, None)?;
    }

    Ok(result)
}

#[tauri::command]
fn commit_color_to_config(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    color_id: String,
) -> Result<(), String> {
    let mut state = state.lock().map_err(|error| error.to_string())?;
    state.load_if_needed(&app)?;
    state.theme.color = color_id;
    state.write_config()?;
    emit_shell_state(&app, &mut state, None)?;
    emit_settings_data(&app, &mut state)?;
    Ok(())
}

#[tauri::command]
fn commit_theme_to_config(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    theme_id: String,
) -> Result<(), String> {
    let mut state = state.lock().map_err(|error| error.to_string())?;
    state.load_if_needed(&app)?;
    state.theme.theme = theme_id;
    state.write_config()?;
    emit_shell_state(&app, &mut state, None)?;
    emit_settings_data(&app, &mut state)?;
    Ok(())
}

#[tauri::command]
fn complete_setup(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    selected_path: String,
) -> Result<(), String> {
    diagnostics::log_app(&app, format!("command complete_setup {selected_path}"));

    {
        let mut state = state.lock().map_err(|error| error.to_string())?;
        diagnostics::log_app(&app, "complete_setup loading state");
        state.load_if_needed(&app)?;
        state.file_path = Some(PathBuf::from(selected_path).join("captainsLogs.json"));
        state.theme = default_theme();
        diagnostics::log_app(&app, "complete_setup writing config");
        state.write_config()?;
        diagnostics::log_app(&app, "complete_setup reading notes");
        notes::read_notes(state.file_path()?)?;
    }

    {
        let mut state = state.lock().map_err(|error| error.to_string())?;
        diagnostics::log_app(&app, "complete_setup showing main");
        state.load_if_needed(&app)?;
        state.editor_mode = windows::EditorMode::Mini;
    }
    windows::show_main(&app, windows::EditorMode::Mini)?;

    diagnostics::log_app(&app, "complete_setup closing setup");
    windows::close_window(&app, "setup")?;
    diagnostics::log_app(&app, "complete_setup opening tutorial");
    windows::open_tutorial(&app)?;

    {
        let mut state = state.lock().map_err(|error| error.to_string())?;
        diagnostics::log_app(&app, "complete_setup emitting shell state");
        state.load_if_needed(&app)?;
        emit_shell_state(&app, &mut state, None)?;
    }

    diagnostics::log_app(&app, "complete_setup complete");
    Ok(())
}

#[tauri::command]
fn show_editor(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    mode: String,
    preserve_input: Option<bool>,
) -> Result<(), String> {
    diagnostics::log_app(&app, format!("command show_editor {mode}"));
    let mode = match mode.as_str() {
        "mini" => windows::EditorMode::Mini,
        "big" => windows::EditorMode::Big,
        _ => return Err(format!("Unknown editor mode: {mode}")),
    };

    {
        let mut state = state.lock().map_err(|error| error.to_string())?;
        state.load_if_needed(&app)?;
        state.editor_mode = mode;
    }

    if preserve_input.unwrap_or(false) {
        windows::show_main_preserving_input(&app, mode)?;
    } else {
        windows::show_main(&app, mode)?;
    }

    {
        let mut state = state.lock().map_err(|error| error.to_string())?;
        emit_shell_state(&app, &mut state, None)?;
    }

    Ok(())
}

#[tauri::command]
fn close_window(app: AppHandle, label: String) -> Result<(), String> {
    diagnostics::log_app(&app, format!("command close_window {label}"));
    windows::close_window(&app, &label)
}

#[tauri::command]
fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    diagnostics::log_app(&app, format!("command open_path {path}"));
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn report_frontend_error(app: AppHandle, source: String, message: String) -> Result<(), String> {
    diagnostics::log_app(&app, format!("frontend {source}: {message}"));
    Ok(())
}

#[tauri::command]
fn get_log_path(app: AppHandle) -> String {
    diagnostics::log_path_string(&app)
}

fn build_shell_state(app: &AppHandle, state: &mut AppState) -> Result<Value, String> {
    let notes = match state.file_path() {
        Ok(path) => notes::read_notes(path)?,
        Err(_) => json!({ "categories": [] }),
    };

    Ok(json!({
        "hostApiVersion": 2,
        "activePluginId": state.active_plugin_id.clone(),
        "editorMode": state.editor_mode.as_str(),
        "plugins": plugins_payload(state, false),
        "allPlugins": plugins_payload(state, true),
        "theme": {
            "accentColor": state.theme.color.clone(),
            "themeColor": state.theme.theme.clone(),
        },
        "notes": notes,
        "resourceBase": app.path().resource_dir().ok().map(|path| path.to_string_lossy().to_string()),
        "fontPath": plugins::resolve_font_path(app).map(|path| path.to_string_lossy().to_string()),
    }))
}

fn emit_shell_state(
    app: &AppHandle,
    state: &mut AppState,
    notes: Option<Value>,
) -> Result<(), String> {
    let payload = if let Some(notes) = notes {
        json!({
            "hostApiVersion": 2,
            "activePluginId": state.active_plugin_id.clone(),
            "editorMode": state.editor_mode.as_str(),
            "plugins": plugins_payload(state, false),
            "allPlugins": plugins_payload(state, true),
            "theme": {
                "accentColor": state.theme.color.clone(),
                "themeColor": state.theme.theme.clone(),
            },
            "notes": notes,
        })
    } else {
        build_shell_state(app, state)?
    };

    emit_to_main(app, "shell-state", payload)
}

fn plugins_payload(state: &AppState, include_disabled: bool) -> Vec<Value> {
    state
        .plugins
        .iter()
        .filter(|plugin| include_disabled || state.plugin_enabled(&plugin.id))
        .map(|plugin| {
            json!({
                "id": plugin.id,
                "name": plugin.name,
                "command": plugin.command,
                "aliases": plugin.aliases,
                "version": plugin.version,
                "description": plugin.description,
                "capabilities": plugin.capabilities,
                "defaultSize": plugin.default_size,
                "hasSettings": plugin.has_settings,
                "enabled": state.plugin_enabled(&plugin.id),
                "src": plugin.src,
            })
        })
        .collect()
}

fn emit_settings_data(app: &AppHandle, state: &mut AppState) -> Result<(), String> {
    app.emit_to(
        "settings",
        "settings-data",
        json!({
            "configPath": state.config_path_string(),
            "filePath": state.file_path_string(),
            "accentColor": state.theme.color.clone(),
            "themeColor": state.theme.theme.clone(),
        }),
    )
    .map_err(|error| error.to_string())
}

fn emit_to_main(app: &AppHandle, event: &str, payload: Value) -> Result<(), String> {
    app.emit_to("main", event, payload)
        .map_err(|error| error.to_string())
}

fn string_param(params: &Value, key: &str) -> Result<String, String> {
    params
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| format!("Missing {key}"))
}

fn value_param<'a>(params: &'a Value, key: &str) -> Result<&'a Value, String> {
    params.get(key).ok_or_else(|| format!("Missing {key}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    std::panic::set_hook(Box::new(|panic_info| {
        diagnostics::log_panic(format!("panic: {panic_info}"));
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .manage(Mutex::new(AppState::default()))
        .manage(Mutex::new(whisper::WhisperRuntime::default()))
        .invoke_handler(tauri::generate_handler![
            close_window,
            commit_color_to_config,
            commit_theme_to_config,
            complete_setup,
            get_settings_data,
            get_shell_state,
            get_log_path,
            invoke_host,
            open_path,
            report_frontend_error,
            show_editor,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            diagnostics::log_app(&handle, "setup start");
            let state = app.state::<Mutex<AppState>>();
            {
                let mut state = state.lock().map_err(|error| error.to_string())?;
                diagnostics::log_app(&handle, "loading state");
                state.load_if_needed(&handle)?;
                diagnostics::log_app(&handle, "building tray");
                windows::build_tray(&handle)?;
                diagnostics::log_app(&handle, "registering shortcuts");
                windows::register_shortcuts(&handle)?;
                let whisper_settings = state.plugin_data("whisper").cloned();
                let should_show_main = state.file_path.is_some();
                if should_show_main {
                    state.editor_mode = windows::EditorMode::Mini;
                }
                drop(state);
                if let Some(whisper_settings) = whisper_settings {
                    let runtime = handle.state::<Mutex<whisper::WhisperRuntime>>();
                    whisper::configure(&handle, runtime, &whisper_settings)?;
                }
                whisper::prepare_backend(&handle);
                if should_show_main {
                    diagnostics::log_app(&handle, "configured log path found; showing main window");
                    windows::show_main(&handle, windows::EditorMode::Mini)?;
                } else {
                    diagnostics::log_app(&handle, "no configured log path; opening setup window");
                    windows::open_setup(&handle)?;
                }
            }
            diagnostics::log_app(&handle, "setup complete");
            Ok(())
        })
        .on_window_event(|window, event| {
            diagnostics::log_app(
                window.app_handle(),
                format!("window event {} {event:?}", window.label()),
            );
            if window.label() == "main" {
                windows::handle_main_window_event(window, event);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
