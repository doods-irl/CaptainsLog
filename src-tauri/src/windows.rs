use crate::{diagnostics, state::AppState};
use serde_json::json;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    image::Image, AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, Window, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const WINDOW_WIDTH: f64 = 800.0;
const MINI_HEIGHT: f64 = 90.0;
const MIN_BIG_HEIGHT: f64 = 520.0;
const RECORDING_STATUS_SIZE: f64 = 100.0;
const RECORDING_STATUS_MARGIN: f64 = 20.0;

pub use crate::state::EditorMode;

pub fn show_main(app: &AppHandle, mode: EditorMode) -> Result<(), String> {
    show_main_with_prepare(app, mode, true)
}

pub fn show_main_preserving_input(app: &AppHandle, mode: EditorMode) -> Result<(), String> {
    show_main_with_prepare(app, mode, false)
}

fn show_main_with_prepare(
    app: &AppHandle,
    mode: EditorMode,
    should_prepare: bool,
) -> Result<(), String> {
    diagnostics::log_app(app, format!("show_main requested {}", mode.as_str()));
    let window = ensure_main_window(app)?;
    diagnostics::log_app(app, "show_main main window ready");

    let height = match mode {
        EditorMode::Mini => MINI_HEIGHT,
        EditorMode::Big => big_editor_height(&window),
    };

    diagnostics::log_app(app, format!("show_main positioning {}", mode.as_str()));
    position_editor(&window, height)?;
    diagnostics::log_app(app, "show_main showing window");
    window.show().map_err(|error| error.to_string())?;
    diagnostics::log_app(app, "show_main focusing window");
    window.set_focus().map_err(|error| error.to_string())?;
    if !should_prepare {
        diagnostics::log_app(app, "show_main preserving input");
        return Ok(());
    }

    diagnostics::log_app(app, "show_main emitting prepare-show");
    window
        .emit(
            "editor-command",
            json!({
                "type": "prepare-show",
                "mode": mode.as_str(),
            }),
        )
        .map_err(|error| error.to_string())
}

pub fn hide_main(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .emit("editor-command", json!({ "type": "reset-input" }))
            .map_err(|error| error.to_string())?;
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn open_setup(app: &AppHandle) -> Result<(), String> {
    diagnostics::log_app(app, "open_setup setup.html");
    open_or_focus(app, "setup", "setup.html", 800.0, 260.0, false)
}

pub fn open_tutorial(app: &AppHandle) -> Result<(), String> {
    diagnostics::log_app(app, "open_tutorial tutorial.html");
    open_or_focus(app, "tutorial", "tutorial.html", 800.0, 1000.0, true)
}

pub fn open_settings(app: &AppHandle) -> Result<(), String> {
    diagnostics::log_app(app, "open_settings settings.html");
    open_or_focus(app, "settings", "settings.html", 800.0, 520.0, true)
}

pub fn close_window(app: &AppHandle, label: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(label) {
        window.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn show_recording_status(app: &AppHandle, status: &str) -> Result<(), String> {
    let window = if let Some(window) = app.get_webview_window("recording-status") {
        window
    } else {
        WebviewWindowBuilder::new(
            app,
            "recording-status",
            WebviewUrl::App(format!("recording-status.html?status={status}").into()),
        )
        .title("Captain's Log")
        .inner_size(RECORDING_STATUS_SIZE, RECORDING_STATUS_SIZE)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        // The status overlay must not steal focus from the editor.
        .focused(false)
        // Build hidden so we can move it to the corner before it is ever shown,
        // otherwise it flashes at the default position and flies to the corner.
        .visible(false)
        .build()
        .map_err(|error| error.to_string())?
    };

    position_recording_status(&window)?;
    window.show().map_err(|error| error.to_string())?;
    window
        .emit("recording-status", json!({ "status": status }))
        .map_err(|error| error.to_string())
}

pub fn close_recording_status(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("recording-status") {
        window.close().ok();
    }
}

pub fn build_tray(app: &AppHandle) -> Result<(), String> {
    diagnostics::log_app(app, "build_tray start");
    let mini = MenuItem::with_id(app, "mini", "Mini Editor", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let big = MenuItem::with_id(app, "big", "Big Editor", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let tutorial = MenuItem::with_id(app, "tutorial", "Tutorial", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let close = MenuItem::with_id(app, "close", "Close", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let menu = Menu::with_items(app, &[&mini, &big, &tutorial, &settings, &close])
        .map_err(|error| error.to_string())?;

    let icon = Image::from_bytes(include_bytes!("../../captainsloglogo.png"))
        .map_err(|error| error.to_string())?;

    TrayIconBuilder::new()
        .icon(icon)
        .tooltip("Captain's Log")
        .menu(&menu)
        .on_menu_event(|app, event| {
            let state = app.state::<std::sync::Mutex<AppState>>();
            match event.id().as_ref() {
                "mini" => with_state(app, &state, EditorMode::Mini),
                "big" => with_state(app, &state, EditorMode::Big),
                "tutorial" => open_tutorial(app),
                "settings" => open_settings(app),
                "close" => {
                    app.exit(0);
                    Ok(())
                }
                _ => Ok(()),
            }
            .ok();
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let state = app.state::<std::sync::Mutex<AppState>>();
                with_state(app, &state, EditorMode::Big).ok();
            }
        })
        .build(app)
        .map_err(|error| error.to_string())?;

    diagnostics::log_app(app, "build_tray complete");
    Ok(())
}

pub fn register_shortcuts(app: &AppHandle) -> Result<(), String> {
    diagnostics::log_app(app, "register_shortcuts installing plugin");
    let editor_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyL);
    let big_editor_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyK);
    let escape_shortcut = Shortcut::new(None, Code::Escape);
    let editor_shortcut_for_handler = editor_shortcut.clone();
    let big_editor_shortcut_for_handler = big_editor_shortcut.clone();
    let escape_shortcut_for_handler = escape_shortcut.clone();

    let handle = app.clone();
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if crate::whisper::handle_shortcut_event(app, shortcut, &event) {
                    return;
                }

                if event.state() != ShortcutState::Pressed {
                    return;
                }

                let state = app.state::<std::sync::Mutex<AppState>>();
                if shortcut == &editor_shortcut_for_handler {
                    toggle_mini_shortcut(app, &state).ok();
                } else if shortcut == &big_editor_shortcut_for_handler {
                    with_state(app, &state, EditorMode::Big).ok();
                } else if shortcut == &escape_shortcut_for_handler {
                    hide_main(app).ok();
                }
            })
            .build(),
    )
    .map_err(|error| error.to_string())?;

    diagnostics::log_app(app, "register_shortcuts registering ctrl-alt-l");
    handle
        .global_shortcut()
        .register(editor_shortcut)
        .map_err(|error| error.to_string())?;
    diagnostics::log_app(app, "register_shortcuts registering ctrl-alt-k");
    handle
        .global_shortcut()
        .register(big_editor_shortcut)
        .map_err(|error| error.to_string())?;
    diagnostics::log_app(app, "register_shortcuts registering escape");
    handle
        .global_shortcut()
        .register(escape_shortcut)
        .map_err(|error| error.to_string())?;
    diagnostics::log_app(app, "register_shortcuts complete");
    Ok(())
}

pub fn handle_main_window_event(window: &Window, event: &WindowEvent) {
    if matches!(event, WindowEvent::Focused(false)) {
        // The recording-status overlay can momentarily take focus when it
        // appears; don't treat that as the user dismissing the editor.
        if let Some(status) = window.app_handle().get_webview_window("recording-status") {
            if status.is_visible().unwrap_or(false) {
                return;
            }
        }
        let _ = window.emit("editor-command", json!({ "type": "reset-input" }));
        let _ = window.hide();
    }
}

fn with_state(
    app: &AppHandle,
    state: &tauri::State<'_, std::sync::Mutex<AppState>>,
    mode: EditorMode,
) -> Result<(), String> {
    {
        let mut state = state.lock().map_err(|error| error.to_string())?;
        state.editor_mode = mode;
    }
    show_main(app, mode)
}

fn toggle_mini_shortcut(
    app: &AppHandle,
    state: &tauri::State<'_, std::sync::Mutex<AppState>>,
) -> Result<(), String> {
    let current_mode = {
        let state = state.lock().map_err(|error| error.to_string())?;
        state.editor_mode
    };

    let main_is_visible = app
        .get_webview_window("main")
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false);
    let next_mode = if main_is_visible && current_mode == EditorMode::Mini {
        EditorMode::Big
    } else {
        EditorMode::Mini
    };

    with_state(app, state, next_mode)
}

fn open_or_focus(
    app: &AppHandle,
    label: &str,
    url: &str,
    width: f64,
    height: f64,
    resizable: bool,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(label) {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title("Captain's Log")
        .inner_size(width, height)
        .decorations(false)
        .resizable(resizable)
        .visible(true)
        .build()
        .map_err(|error| error.to_string())?;

    diagnostics::log_app(app, format!("created window {label} {url}"));

    Ok(())
}

fn ensure_main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window("main") {
        diagnostics::log_app(app, "using existing main window");
        return Ok(window);
    }

    diagnostics::log_app(app, "creating main window index.html");
    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Captain's Log")
        .inner_size(WINDOW_WIDTH, MINI_HEIGHT)
        .min_inner_size(420.0, MINI_HEIGHT)
        .decorations(false)
        .resizable(true)
        .visible(false)
        .skip_taskbar(false)
        .build()
        .map_err(|error| {
            diagnostics::log_app(app, format!("failed to create main window: {error}"));
            error.to_string()
        })?;
    diagnostics::log_app(app, "created main window index.html");
    Ok(window)
}

fn position_editor(window: &WebviewWindow, height: f64) -> Result<(), String> {
    let Some(monitor) = window
        .current_monitor()
        .map_err(|error| error.to_string())?
    else {
        window
            .set_size(LogicalSize::new(WINDOW_WIDTH, height))
            .map_err(|error| error.to_string())?;
        return Ok(());
    };

    let work_area = monitor.work_area();
    let scale = monitor.scale_factor();
    let width = WINDOW_WIDTH.min(work_area.size.width as f64 / scale);
    let logical_height = height.min(work_area.size.height as f64 / scale);
    let x =
        work_area.position.x as f64 / scale + work_area.size.width as f64 / scale - width - 20.0;
    let y = work_area.position.y as f64 / scale + 20.0;

    window
        .set_size(LogicalSize::new(width, logical_height))
        .map_err(|error| error.to_string())?;
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|error| error.to_string())
}

fn position_recording_status(window: &WebviewWindow) -> Result<(), String> {
    let Some(monitor) = window
        .current_monitor()
        .map_err(|error| error.to_string())?
    else {
        window
            .set_size(LogicalSize::new(
                RECORDING_STATUS_SIZE,
                RECORDING_STATUS_SIZE,
            ))
            .map_err(|error| error.to_string())?;
        return Ok(());
    };

    let work_area = monitor.work_area();
    let scale = monitor.scale_factor();
    let x = work_area.position.x as f64 / scale + work_area.size.width as f64 / scale
        - RECORDING_STATUS_SIZE
        - RECORDING_STATUS_MARGIN;
    let y = work_area.position.y as f64 / scale + work_area.size.height as f64 / scale
        - RECORDING_STATUS_SIZE
        - RECORDING_STATUS_MARGIN;

    window
        .set_size(LogicalSize::new(
            RECORDING_STATUS_SIZE,
            RECORDING_STATUS_SIZE,
        ))
        .map_err(|error| error.to_string())?;
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|error| error.to_string())
}

fn big_editor_height(window: &WebviewWindow) -> f64 {
    window
        .current_monitor()
        .ok()
        .flatten()
        .map(|monitor| {
            let scale = monitor.scale_factor();
            let work_area = monitor.work_area();
            MIN_BIG_HEIGHT.max((work_area.size.height as f64 / scale - 40.0).min(900.0))
        })
        .unwrap_or(900.0)
}
