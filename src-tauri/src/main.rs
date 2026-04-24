#![cfg_attr(windows, windows_subsystem = "windows")]

use std::env;
use std::ffi::OsString;
use std::fs;
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
    let node_binary = resolve_node_binary(&backend.root)?;
    let mut command = Command::new(&node_binary);
    command
        .arg(&backend.entry)
        .arg("snapshot")
        .arg(&backend.root)
        .current_dir(&backend.root);

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

fn resolve_node_binary(resource_root: &Path) -> Result<OsString, String> {
    if let Some(value) = env::var_os("MONITORAI_NODE_BIN") {
        return Ok(value);
    }

    let mut candidates = Vec::new();

    let resource_candidates = [
        resource_root.join("bin").join(platform_node_binary_name()),
        resource_root.join(platform_node_binary_name()),
    ];
    candidates.extend(resource_candidates.into_iter().map(OsString::from));

    for name in [platform_node_binary_name(), platform_nodejs_binary_name()] {
        if let Some(path) = find_in_path(name) {
            candidates.push(path);
        }
    }

    for path in common_system_node_paths() {
        candidates.push(OsString::from(path));
    }

    for candidate in candidates {
        if is_executable(&candidate) {
            return Ok(candidate);
        }
    }

    Err(
        "Node runtime not found. Install Node.js 20+ in a system path, or set MONITORAI_NODE_BIN to an absolute node binary."
            .to_string(),
    )
}

fn find_in_path(binary_name: &str) -> Option<OsString> {
    let path_var = env::var_os("PATH")?;
    for directory in env::split_paths(&path_var) {
        let candidate = directory.join(binary_name);
        if candidate.is_file() {
            return Some(candidate.into_os_string());
        }
    }
    None
}

fn is_executable(path: &OsString) -> bool {
    fs::metadata(path).map(|metadata| metadata.is_file()).unwrap_or(false)
}

fn platform_node_binary_name() -> &'static str {
    #[cfg(windows)]
    {
        "node.exe"
    }

    #[cfg(not(windows))]
    {
        "node"
    }
}

fn platform_nodejs_binary_name() -> &'static str {
    #[cfg(windows)]
    {
        "nodejs.exe"
    }

    #[cfg(not(windows))]
    {
        "nodejs"
    }
}

fn common_system_node_paths() -> Vec<&'static str> {
    #[cfg(windows)]
    {
        vec![
            r"C:\Program Files\nodejs\node.exe",
            r"C:\Program Files (x86)\nodejs\node.exe",
        ]
    }

    #[cfg(not(windows))]
    {
        vec![
            "/usr/bin/node",
            "/usr/bin/nodejs",
            "/usr/local/bin/node",
            "/usr/local/bin/nodejs",
            "/bin/node",
            "/snap/bin/node",
        ]
    }
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
