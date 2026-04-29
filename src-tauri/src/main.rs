#![cfg_attr(windows, windows_subsystem = "windows")]

use std::env;
use std::ffi::OsString;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Output, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{
    webview::PageLoadEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, LogicalPosition, LogicalSize, Manager, WebviewWindowBuilder,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(unix)]
use std::os::unix::process::CommandExt as UnixCommandExt;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(windows)]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
const BACKEND_COMMAND_TIMEOUT: Duration = Duration::from_secs(70);
static ACTIVE_BACKEND_CHILDREN: OnceLock<Mutex<HashSet<u32>>> = OnceLock::new();

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct WindowState {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    zoom: Option<f64>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct AppConfig {
    refresh_interval_min: u64,
    view_mode: String,
    #[serde(default)]
    provider_visibility: HashMap<String, bool>,
}

#[tauri::command]
fn load_app_config(app: AppHandle) -> Result<AppConfig, String> {
    load_app_config_from_disk(&app)
}

#[tauri::command]
fn save_app_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    save_app_config_to_disk(&app, &config)
}

#[tauri::command]
async fn get_usage_snapshot(app: AppHandle) -> Result<serde_json::Value, String> {
    let project_root = project_root()?;
    let backend = resolve_backend(&app, &project_root)?;
    tauri::async_runtime::spawn_blocking(move || run_backend_snapshot(backend))
        .await
        .map_err(|error| format!("Unable to join backend task: {error}"))?
}

#[tauri::command]
async fn get_detected_providers(app: AppHandle) -> Result<Vec<String>, String> {
    let project_root = project_root()?;
    let backend = resolve_backend(&app, &project_root)?;
    tauri::async_runtime::spawn_blocking(move || run_backend_detect(backend))
        .await
        .map_err(|error| format!("Unable to join detect task: {error}"))?
}

#[tauri::command]
async fn get_provider_usage(app: AppHandle, provider: String) -> Result<serde_json::Value, String> {
    let project_root = project_root()?;
    let backend = resolve_backend(&app, &project_root)?;
    tauri::async_runtime::spawn_blocking(move || run_backend_provider_usage(backend, provider))
        .await
        .map_err(|error| format!("Unable to join provider task: {error}"))?
}

#[tauri::command]
async fn get_refresh_interval(app: AppHandle) -> Result<u64, String> {
    let project_root = project_root()?;
    let backend = resolve_backend(&app, &project_root)?;
    tauri::async_runtime::spawn_blocking(move || run_backend_refresh_interval(backend))
        .await
        .map_err(|error| format!("Unable to join refresh interval task: {error}"))?
}

#[tauri::command]
fn load_window_state(app: AppHandle) -> Result<Option<WindowState>, String> {
    load_window_state_from_disk(&app)
}

#[tauri::command]
fn save_window_state(app: AppHandle, state: WindowState) -> Result<(), String> {
    save_window_state_to_disk(&app, &state)
}

#[tauri::command]
fn append_window_debug_log(app: AppHandle, message: String) -> Result<(), String> {
    let log_path = window_debug_log_path(&app)?;
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Unable to create debug log directory: {error}"))?;
    }

    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| format!("Unable to open debug log: {error}"))?;

    writeln!(file, "{message}")
        .map_err(|error| format!("Unable to append debug log: {error}"))
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    kill_active_backend_children();
    app.exit(0);
}

fn run_backend_snapshot(backend: BackendPaths) -> Result<serde_json::Value, String> {
    run_backend_json_command(backend, "snapshot", None)
}

fn run_backend_detect(backend: BackendPaths) -> Result<Vec<String>, String> {
    let value = run_backend_json_command(backend, "detect", None)?;
    serde_json::from_value(value).map_err(|error| format!("Invalid detect JSON: {error}"))
}

fn run_backend_provider_usage(backend: BackendPaths, provider: String) -> Result<serde_json::Value, String> {
    run_backend_json_command(backend, "provider", Some(provider))
}

fn run_backend_refresh_interval(backend: BackendPaths) -> Result<u64, String> {
    let value = run_backend_json_command(backend, "refresh-interval", None)?;
    let interval = value
        .get("refresh_interval_sec")
        .and_then(|entry| entry.as_u64())
        .ok_or_else(|| "Invalid refresh interval JSON".to_string())?;
    Ok(interval)
}

fn run_backend_json_command(
    backend: BackendPaths,
    command_name: &str,
    provider: Option<String>,
) -> Result<serde_json::Value, String> {
    if !backend.entry.is_file() {
        return Err(format!(
            "Backend entry is not a file: {}",
            backend.entry.display()
        ));
    }

    if !backend.root.is_dir() {
        return Err(format!(
            "Backend root is not a directory: {}",
            backend.root.display()
        ));
    }

    let node_binary = normalize_path_for_child(PathBuf::from(resolve_node_binary(&backend.root)?));
    let mut command = Command::new(&node_binary);
    command
        .arg(&backend.entry)
        .arg(command_name)
        .arg(&backend.root)
        .current_dir(&backend.root)
        .env("AI_USAGE_WIDGET_CLI_CWD", &backend.cli_cwd);

    if let Some(ref provider) = provider {
        command.arg(provider);
    }

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
    #[cfg(unix)]
    command.process_group(0);

    append_backend_launch_log(&node_binary, &backend, command_name, provider.as_deref());

    let output = run_backend_command_with_timeout(command, BACKEND_COMMAND_TIMEOUT)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(if stdout.is_empty() {
            stderr
        } else {
            format!("{stderr}\nstdout: {stdout}")
        });
    }

    serde_json::from_slice(&output.stdout).map_err(|error| format!("Invalid backend JSON: {error}"))
}

fn run_backend_command_with_timeout(
    mut command: Command,
    timeout: Duration,
) -> Result<Output, String> {
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Unable to run Node backend: {error}"))?;
    let child_pid = child.id();
    register_backend_child(child_pid);

    let start = Instant::now();
    let result = loop {
        match child.try_wait() {
            Ok(Some(_status)) => {
                break child
                    .wait_with_output()
                    .map_err(|error| format!("Unable to collect Node backend output: {error}"));
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    terminate_backend_child(&mut child, child_pid);
                    let output = child
                        .wait_with_output()
                        .map_err(|error| format!("Unable to collect timed-out Node backend output: {error}"))?;
                    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                    break Err(if stderr.is_empty() {
                        format!("Node backend timed out after {}s", timeout.as_secs())
                    } else {
                        format!("Node backend timed out after {}s: {stderr}", timeout.as_secs())
                    });
                }
                thread::sleep(Duration::from_millis(50));
            }
            Err(error) => {
                terminate_backend_child(&mut child, child_pid);
                let _ = child.wait();
                break Err(format!("Unable to wait for Node backend: {error}"));
            }
        }
    };

    unregister_backend_child(child_pid);
    result
}

fn active_backend_children() -> &'static Mutex<HashSet<u32>> {
    ACTIVE_BACKEND_CHILDREN.get_or_init(|| Mutex::new(HashSet::new()))
}

fn register_backend_child(pid: u32) {
    if let Ok(mut children) = active_backend_children().lock() {
        children.insert(pid);
    }
}

fn unregister_backend_child(pid: u32) {
    if let Ok(mut children) = active_backend_children().lock() {
        children.remove(&pid);
    }
}

fn kill_active_backend_children() {
    let pids = active_backend_children()
        .lock()
        .map(|children| children.iter().copied().collect::<Vec<_>>())
        .unwrap_or_default();

    for pid in pids {
        kill_backend_process_tree(pid);
    }
}

fn terminate_backend_child(child: &mut Child, pid: u32) {
    kill_backend_process_tree(pid);
    let _ = child.kill();
}

fn kill_backend_process_tree(pid: u32) {
    #[cfg(unix)]
    {
        let _ = Command::new("kill")
            .arg("-TERM")
            .arg(format!("-{pid}"))
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        thread::sleep(Duration::from_millis(150));
        let _ = Command::new("kill")
            .arg("-KILL")
            .arg(format!("-{pid}"))
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .arg("/PID")
            .arg(pid.to_string())
            .arg("/T")
            .arg("/F")
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
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
        candidates.push(path.into_os_string());
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
        if is_executable_file(&candidate) {
            return Some(candidate.into_os_string());
        }
    }
    None
}

fn is_executable(path: &OsString) -> bool {
    is_executable_file(Path::new(path))
}

fn is_executable_file(path: &Path) -> bool {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => return false,
    };

    if !metadata.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        return metadata.permissions().mode() & 0o111 != 0;
    }

    #[cfg(not(unix))]
    {
        true
    }
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

fn common_system_node_paths() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        vec![
            PathBuf::from(r"C:\Program Files\nodejs\node.exe"),
            PathBuf::from(r"C:\Program Files (x86)\nodejs\node.exe"),
        ]
    }

    #[cfg(not(windows))]
    {
        let mut paths = vec![
            PathBuf::from("/opt/homebrew/bin/node"),
            PathBuf::from("/opt/homebrew/bin/nodejs"),
            PathBuf::from("/usr/bin/node"),
            PathBuf::from("/usr/bin/nodejs"),
            PathBuf::from("/usr/local/bin/node"),
            PathBuf::from("/usr/local/bin/nodejs"),
            PathBuf::from("/opt/local/bin/node"),
            PathBuf::from("/opt/local/bin/nodejs"),
            PathBuf::from("/bin/node"),
            PathBuf::from("/snap/bin/node"),
        ];

        if let Some(home) = home_dir() {
            paths.push(home.join(".volta").join("bin").join("node"));
            paths.push(home.join(".asdf").join("shims").join("node"));
            paths.extend(nvm_node_paths(&home));
        }

        paths
    }
}

#[cfg(not(windows))]
fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME").map(PathBuf::from)
}

#[cfg(not(windows))]
fn nvm_node_paths(home: &Path) -> Vec<PathBuf> {
    let versions_dir = home.join(".nvm").join("versions").join("node");
    let Ok(entries) = fs::read_dir(versions_dir) else {
        return Vec::new();
    };

    entries
        .filter_map(Result::ok)
        .map(|entry| entry.path().join("bin").join("node"))
        .filter(|candidate| candidate.is_file())
        .collect()
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
    cli_cwd: PathBuf,
}

fn resolve_backend(app: &AppHandle, project_root: &Path) -> Result<BackendPaths, String> {
    let cli_cwd = resolve_cli_workspace(app)?;
    let dev_entry = project_root.join("backend").join("index.js");
    if dev_entry.exists() {
        return Ok(BackendPaths {
            entry: normalize_path_for_child(dev_entry),
            root: normalize_path_for_child(project_root.to_path_buf()),
            cli_cwd,
        });
    }

    let resource_root = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Unable to resolve resource directory: {error}"))?;

    for candidate_root in backend_resource_roots(&resource_root) {
        let candidate_entry = candidate_root.join("backend").join("index.js");
        if candidate_entry.exists() {
            return Ok(BackendPaths {
                entry: normalize_path_for_child(candidate_entry),
                root: normalize_path_for_child(candidate_root),
                cli_cwd,
            });
        }
    }

    Err(format!(
        "Backend entry not found in resource directory: {}",
        resource_root.display()
    ))
}

fn backend_resource_roots(resource_root: &Path) -> Vec<PathBuf> {
    vec![
        resource_root.to_path_buf(),
        resource_root.join("_up_"),
    ]
}

fn resolve_cli_workspace(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app data directory: {error}"))?;
    let cli_workspace = app_data_dir.join("cli-workspace");
    fs::create_dir_all(&cli_workspace)
        .map_err(|error| format!("Unable to create CLI workspace: {error}"))?;
    Ok(normalize_path_for_child(cli_workspace))
}

fn normalize_path_for_child(path: PathBuf) -> PathBuf {
    #[cfg(windows)]
    {
        let value = path.as_os_str().to_string_lossy();
        if let Some(stripped) = value.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{stripped}"));
        }

        if let Some(stripped) = value.strip_prefix(r"\\?\") {
            return PathBuf::from(stripped);
        }
    }

    path
}

fn append_backend_launch_log(
    node_binary: &Path,
    backend: &BackendPaths,
    command_name: &str,
    provider: Option<&str>,
) {
    let log_dir = env::temp_dir().join("ai-usage-widget");
    if fs::create_dir_all(&log_dir).is_err() {
        return;
    }

    let log_path = log_dir.join("backend-launch.log");
    let mut file = match fs::OpenOptions::new().create(true).append(true).open(log_path) {
        Ok(file) => file,
        Err(_) => return,
    };

    let _ = writeln!(
        file,
        "node={} entry={} root={} cli_cwd={} command={} provider={}",
        node_binary.display(),
        backend.entry.display(),
        backend.root.display(),
        backend.cli_cwd.display(),
        command_name,
        provider.unwrap_or("")
    );
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn load_window_state_from_disk(app: &AppHandle) -> Result<Option<WindowState>, String> {
    let state_path = window_state_path(app)?;
    if !state_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&state_path)
        .map_err(|error| format!("Unable to read window state: {error}"))?;
    let state = serde_json::from_str::<WindowState>(&content)
        .map_err(|error| format!("Unable to parse window state: {error}"))?;

    if state.width <= 0.0 || state.height <= 0.0 {
        return Ok(None);
    }

    Ok(Some(state))
}

fn save_window_state_to_disk(app: &AppHandle, state: &WindowState) -> Result<(), String> {
    let state_path = window_state_path(app)?;
    if let Some(parent) = state_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Unable to create window state directory: {error}"))?;
    }

    let content = serde_json::to_string(state)
        .map_err(|error| format!("Unable to serialize window state: {error}"))?;
    fs::write(&state_path, content)
        .map_err(|error| format!("Unable to persist window state: {error}"))
}

fn load_app_config_from_disk(app: &AppHandle) -> Result<AppConfig, String> {
    let config_path = app_config_path(app)?;
    if !config_path.exists() {
        return Ok(AppConfig {
            refresh_interval_min: 2,
            view_mode: "consumed".to_string(),
            provider_visibility: HashMap::new(),
        });
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|error| format!("Unable to read app config: {error}"))?;
    serde_json::from_str::<AppConfig>(&content)
        .map_err(|error| format!("Unable to parse app config: {error}"))
}

fn save_app_config_to_disk(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let config_path = app_config_path(app)?;
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Unable to create app config directory: {error}"))?;
    }

    let content = serde_json::to_string(config)
        .map_err(|error| format!("Unable to serialize app config: {error}"))?;
    fs::write(&config_path, content)
        .map_err(|error| format!("Unable to persist app config: {error}"))
}

fn window_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app data directory: {error}"))?;
    Ok(app_data_dir.join("window-state.json"))
}

fn app_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app data directory: {error}"))?;
    Ok(app_data_dir.join("config.json"))
}

fn window_debug_log_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app data directory: {error}"))?;
    Ok(app_data_dir.join("window-debug.log"))
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
            "quit" => {
                kill_active_backend_children();
                app.exit(0);
            }
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

    let window = WebviewWindowBuilder::from_config(app, &window_config)?
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
                let _ = window.show();
                let _ = window.set_focus();
            }
        })
        .build()?;

    if let Ok(Some(state)) = load_window_state_from_disk(app) {
        let _ = window.set_size(LogicalSize::new(state.width, state.height));
        let _ = window.set_position(LogicalPosition::new(state.x, state.y));
    }

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            setup_tray(app.handle())?;
            create_main_window(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_usage_snapshot,
            get_detected_providers,
            get_provider_usage,
            get_refresh_interval,
            load_window_state,
            save_window_state,
            load_app_config,
            save_app_config,
            append_window_debug_log,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
