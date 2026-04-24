#![cfg_attr(windows, windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{
    webview::PageLoadEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewWindowBuilder,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[tauri::command]
fn get_usage_snapshot(app: AppHandle) -> Result<serde_json::Value, String> {
    let project_root = project_root()?;
    let backend = resolve_backend(&app, &project_root)?;
    let mut command = Command::new("node");
    command
        .arg(&backend.entry)
        .arg("snapshot")
        .arg(&backend.root);

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command
        .output()
        .map_err(|error| format!("Unable to run Node backend: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    serde_json::from_slice(&output.stdout).map_err(|error| format!("Invalid backend JSON: {error}"))
}

fn project_root() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Unable to resolve project root".to_string())
}

struct BackendPaths {
    entry: PathBuf,
    root: PathBuf,
}

fn resolve_backend(app: &AppHandle, project_root: &Path) -> Result<BackendPaths, String> {
    let dev_entry = project_root.join("backend").join("index.js");
    if dev_entry.exists() {
        return Ok(BackendPaths {
            entry: dev_entry,
            root: project_root.to_path_buf(),
        });
    }

    let resource_root = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Unable to resolve resource directory: {error}"))?;
    let resource_entry = resource_root.join("backend").join("index.js");

    if resource_entry.exists() {
        Ok(BackendPaths {
            entry: resource_entry,
            root: resource_root,
        })
    } else {
        Err("Backend entry not found".to_string())
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let icon = app.default_window_icon().cloned();

    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("AI Usage Widget")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            }
            | TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = icon {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}

fn create_main_window(app: &AppHandle) -> tauri::Result<()> {
    let Some(window_config) = app.config().app.windows.first() else {
        return Ok(());
    };

    let mut window_config = window_config.clone();
    window_config.visible = false;

    WebviewWindowBuilder::from_config(app, &window_config)?
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
                let _ = window.show();
                let _ = window.set_focus();
            }
        })
        .build()?;

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            setup_tray(app.handle())?;
            create_main_window(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_usage_snapshot])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
