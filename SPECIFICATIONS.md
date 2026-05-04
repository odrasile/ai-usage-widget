# SPECIFICATIONS.md

## Product Name

AI Usage Widget

---

## Goal

Desktop application for Windows and Unix desktop systems, starting with macOS and Ubuntu, that shows near-real-time remaining usage for local AI coding tools through their CLIs.

The application must behave as a floating, always-on-top widget that is discreet and easy to hide or restore.

This document also serves as continuity context if the repository is moved to another machine, for example an Ubuntu PC where `codex` should be launched and development should continue.

---

## Platform Scope

Current target platforms:

- macOS
- Windows
- Ubuntu Desktop

Future target platforms:

- Other Linux distributions compatible with Tauri/WebKitGTK, if they do not require major architectural changes.

Technology:

- Tauri.
- TypeScript frontend.
- Local Node backend.
- Rust only for Tauri and window integration.
- `node-pty` when a real TTY is required.

### Common Node.js Policy

Node.js 20 or newer is a common dependency for macOS, Windows, and Ubuntu.

Reason:

- The project uses a local Node backend for CLI detection, helper process execution, PTY handling, and output parsing.
- Providers are queried exclusively through local CLIs, not external APIs.
- The frontend must not import Node modules; Node usage must remain limited to `backend/` and `scripts/`.
- Imports such as `node:fs`, `node:path`, `node:os`, and `node:child_process` are native Node runtime modules. They are not npm dependencies and must not appear in `node_modules`.

Node runtime resolution:

1. Use `MONITORAI_NODE_BIN` if it is set.
2. Use a bundled `node` runtime next to the app if one exists.
3. Look for `node` or `nodejs` in `PATH`.
4. Look in common operating-system paths.

Installation rules:

- During development, the user must install Node.js 20+ before running `npm install`, `npm test`, `npm run build`, or `npm run tauri dev`.
- For distribution, the app may depend on system Node or bundle its own runtime; the decision must be explicit per platform.
- If distributed without bundled Node, installation instructions must clearly state that Node.js 20+ is a runtime requirement.
- If Node is installed in a non-standard path, the user must be able to set it with `MONITORAI_NODE_BIN`.

Recommended policy:

- Keep one common Node resolution strategy for all three supported operating systems.
- Do not depend on `node_modules/.bin` wrappers to run the packaged app.
- Do not add external dependencies to replace native Node modules that the runtime already provides.

Compatibility notes:

- Executable detection must be cross-platform.
- CLI execution must abstract differences between `cmd.exe` and Unix shells.
- Do not assume Windows-only APIs except in platform-gated branches.

---

## Supported Providers And Extensibility

Providers supported today:

- `codex`
- `claude`
- `gemini`

Planned providers:

- Other similar AI coding CLIs.

The architecture must allow new providers to be added without rewriting the UI or scheduler. Each provider must have:

- installation detection
- its own adapter
- its own parser or equivalent parsing rules
- mapping to the unified data model

The frontend must not assume a closed provider list.

---

## Tool Detection

The system must detect whether configured provider executables are installed.

Platform method:

### Windows

```powershell
where.exe codex
where.exe claude
where.exe gemini
```

### Unix / Ubuntu

```bash
which codex
which claude
which gemini
```

### macOS

```bash
which codex
which claude
which gemini
```

macOS notes:

- The app may be launched from Finder/Dock with a more limited `PATH` than a terminal.
- The platform layer must add common paths before detecting or launching CLIs:
  - `/opt/homebrew/bin`
  - `/usr/local/bin`
  - `/opt/local/bin`
  - `~/.npm-global/bin`
  - `~/.local/bin`
  - `~/.cargo/bin`
  - paths from Node managers commonly used to install CLIs, such as nvm, Volta, and asdf
- Node backend runtime resolution must include Apple Silicon Homebrew (`/opt/homebrew/bin/node`) in addition to traditional Unix paths.
- On macOS, `node-pty` may install its `spawn-helper` without execute permission in some environments; before opening a PTY, ensure that helper is executable if it exists.

If a tool is installed but usage retrieval fails, it must be shown as detected with unavailable usage, not as absent.

---

## Data Retrieval

### Codex

Codex requires a real TTY to run internal commands.

Known correct flow:

1. Launch `codex --no-alt-screen` inside a pseudo-terminal.
2. Send `/status`.
3. Capture output.
4. Close the session with `/quit` or close the PTY in a controlled way.
5. Parse data.

Expected output example:

```text
5h limit: [bars] 61% left (resets 20:45)
Weekly limit: [bars] 81% left (resets 09:24 on 29 Apr)
```

Data to extract:

- remaining percentage for the 5h limit
- 5h reset time
- weekly percentage
- weekly reset time

Required visual normalization:

- primary reset: show only compact local time, for example `14:49`
- weekly reset: show local time plus localized short date, for example `9:24, 29 Apr`
- never show raw UI text such as `on`, `am`, `pm`, or timezone suffixes like `(Europe/Madrid)`

Do not use:

- `codex status`
- `codex exec /status`

Reason:

- They do not correctly represent the real TUI flow.
- They may fail or not exist depending on the version.

### Claude Code

Claude also requires a real interactive session to obtain `/usage` reliably.

Known correct flow:

1. Launch `claude` inside a pseudo-terminal.
2. Send `/usage`.
3. If the initial screen appears and Claude responds `Status dialog dismissed`, send `/usage` a second time.
4. Capture output.
5. Close the PTY in a controlled way.
6. Parse data.

Expected real output example:

```text
Status   Config   Usage   Stats

Current session
0% used
Resets 2:20pm (Europe/Madrid)

Current week (all models)
0% used
Resets Apr 29, 12am (Europe/Madrid)
```

Data to extract:

- current session used percentage
- weekly used percentage
- current session reset
- weekly reset

Required calculation:

```text
percent_left = 100 - percent_used
```

Compatibility:

- Also support older formats based on `remaining/total` if they appear.
- Tolerate cleaned output where words are joined, for example `Currentsession`, `Currentweek`, `0%used`, and `Resets2:20pm`.
- Final visible output must follow the same visual normalization as Codex:
  - primary: `14:49`
  - weekly: `9:24, 29 Apr`
- Do not show `am`, `pm`, or `(Europe/Madrid)` in the UI even if they appear in raw output.

Do not assume that `echo /usage | claude` or a simple pipe is enough on every platform.

### Gemini CLI

Gemini CLI shows quota directly in the TUI status bar when the session starts.

Known correct flow:

1. Launch `gemini -p "hi"` in non-interactive mode with a small probe prompt, or launch the binary directly in a PTY.
2. Wait a reasonable amount of time, around 3 seconds, so the TUI can render the terminal status line.
3. Capture full output.
4. Parse status table data or error messages.

To avoid system keyring dialogs during the probe, launch Gemini with `GEMINI_API_KEY=1` when the user has not already defined `GEMINI_API_KEY`. Gemini still shows the Google session and quota table in this mode. The value is only a local keyring prompt bypass and must not be persisted or applied to other providers.

Expected real output example:

```text
workspace (/directory)             branch             sandbox               /model                               quota
~/development/MonitorAI            master             no sandbox            gemini-3-flash-preview            55% used
```

Data to extract:

- daily quota used percentage (`XX% used`)
- subscription level (`Tier:` or `Plan:`)

Required calculation:

```text
percent_left = 100 - percent_used
```

Specific UI representation:

- For Gemini, the primary limit label must be `24h` instead of `5h`.
- Reset time must be shown as fixed `23:59` unless the CLI provides a parseable dynamic value in the future.

Compatibility:

- Detect `exhausted capacity`, `429`, or `RESOURCE_EXHAUSTED` messages and report 0% availability immediately.
- Also detect the TUI `quota` column value `limit reached`; interpret it as 0% available.

### Future CLIs

For other providers, follow this rule:

1. Detect whether the CLI is installed.
2. Determine whether usage querying requires a real PTY or can be non-interactive.
3. Document the correct flow in this file.
4. Implement the adapter and parser without breaking existing providers.

---

## Unified Data Model

Provider with data:

```json
{
  "provider": "codex",
  "available": true,
  "usage": {
    "primary": {
      "percent_left": 61,
      "reset": "20:45"
    },
    "weekly": {
      "percent_left": 81,
      "reset": "09:24 on 29 Apr"
    }
  }
}
```

Provider detected without available data:

```json
{
  "provider": "codex",
  "available": false,
  "usage": null,
  "status": "CLI detected; usage unavailable"
}
```

Full snapshot:

```json
{
  "providers": [],
  "refresh_interval_sec": 120,
  "updated_at": "2026-04-23T16:00:00.000Z"
}
```

Rules:

- `provider` must not be restricted to a closed union of two names; new CLIs must be able to enter the model.
- `primary` represents the provider's main limit.
- `weekly` is optional.
- `status` is required when `available` is `false`.
- Internal `reset` values may come in different provider formats, but the UI must apply common normalization before showing them.

Common visual reset contract:

- primary limit (`5h`, `24h`, or equivalent): show only local time, for example `14:49`
- weekly limit: show local time plus localized short date, for example `9:24, 29 Apr`
- never show raw suffixes such as `on`, `am`, `pm`, parenthesized timezones, or placeholders such as `N/A` unless there is a real error without data

---

## UI

Floating widget with:

- always-on-top behavior
- no native borders
- reasonable fixed width
- height adaptive to content and detected provider count
- semi-transparent background
- draggable header
- information button
- settings button to open the settings panel
- manual refresh button for all CLIs
- close button
- hide-to-tray button
- tray icon with Show/Quit options when the platform supports it well
- remembered position, size, and zoom level across launches on all supported platforms, provided those values remain valid
- safe fallback if the remembered position is off-screen or remembered size is smaller than current content requires, such as centering the window or growing it to the required minimum

### Configuration And Settings

The widget includes a settings panel accessible from the header. It is designed to be robust and readable across supported desktop environments:

- **Refresh Interval**: Sets automatic refresh frequency between 1 and 60 minutes, with a 2-minute default.
- **Language**: Switches the interface between Spanish and English. The change applies immediately across the application.
- **Display Mode**: Defines the narrative and visual interpretation of data:
  - **Used Resources**: Traditional view. Bars grow left to right from 0% to 100%. Labels become `5h usage` / `Weekly usage`. Color scales from green for low usage to red for critical usage.
  - **Free Resources**: Capacity view. Bars represent available capacity; they start full and empty toward the left as the resource is consumed. Labels become `5h free` / `Weekly free`. Color scales from green for high free capacity to red for low free capacity.
- **Provider Visibility**: The panel shows one checkbox per detected CLI to enable or disable rendering in the widget.
  - Visibility is stored locally with the rest of the settings.
  - Hiding a provider disables its automatic refresh to avoid unnecessary quota queries; its last known data remains stored if it existed.
  - Every newly detected provider is visible by default.
  - If all providers are hidden, the UI shows a specific `no providers visible` empty state instead of pretending that no CLIs were detected.
- **Layout And Visibility**:
  - **Dimensions**: Width is expanded to 280px so longer labels remain fully readable.
  - **Smart Positioning**: The panel uses a calculated negative offset relative to the triggering button. This keeps the dialog inside the visible widget bounds regardless of header button position.
  - **Dark Mode Styling**: The app forces a dark theme to avoid inconsistencies with native system themes, especially on Linux/WebKitGTK. It uses solid dark backgrounds (`rgb(16, 20, 28)`), high-contrast text (`#f5f7fb`), and custom select styling with an embedded SVG arrow.
- **Persistence**: Settings are stored locally and persist between sessions. Opening the panel shows the current loaded values.

### Scaling And Zoom

The widget allows visual scale adjustment for different screen resolutions and user preferences while preserving layout integrity and readability.

- **Controls**:
  - **Keyboard**: `Ctrl` + `+` on Windows/Linux or `Cmd` + `+` on macOS to increase; `Ctrl/Cmd` + `-` to decrease; `Ctrl/Cmd` + `0` to reset to 100%.
  - **Mouse**: `Ctrl/Cmd` + mouse wheel up/down to increase/decrease.
- **Range**: 50% to 200%, in 10% steps.
- **Persistence**: Zoom level is stored with window state and restored on app startup.

#### Layout And Window Behavior

1. **Aspect Ratio Preservation**:
   - When zoom changes, the app window must resize proportionally to the applied scale factor.
   - If the user manually resized the window to be wider or taller, zoom must respect that relative proportion instead of jumping to a minimum size.
2. **Dynamic Synchronization**:
   - The Tauri window must adjust synchronously with visual content changes.
   - A clean measurement is used by temporarily putting the container into automatic height so real content size is captured, including margins, gaps, and padding.
3. **Visual Integrity**:
   - The footer (`Updated...`) has visual priority and must never be hidden by provider panels.
   - This is enforced with CSS (`flex-shrink: 0`) and correct window boundary management.
4. **Scaled Safety Limits**:
   - Window size clamps are multiplied by the current zoom factor.
   - **Minimums**: Reduced to allow compact widgets at low scales, for example 320px wide.
   - **Maximums**: Significantly expanded, for example up to 1600px high, so content is not clipped or overlapped at 200% zoom with multiple providers.
   - The window must never be smaller than what scaled content requires to remain visible.

Manual or automatic refresh behavior:

- Behavior must be consistent across all supported operating systems.
- While a refresh is running, the UI must not appear frozen or silent.
- The last valid snapshot must remain visible while CLIs are queried again.
- Refresh must resolve per provider and must not wait for the slowest provider before repainting the others.
- Each provider component must update as soon as its new result arrives, even if other providers are still pending.
- The refresh button must clearly reflect active state, for example with a spinner, temporary disabled state, or both.
- The header or footer should show transient text such as `Updating...` / `Refreshing...`.
- A pending provider may be slightly dimmed or gray, but it must not disappear or block already updated providers.
- If refresh fails, keep the last visible state and mark it as stale or alerting instead of hiding useful information.

Provider content:

- name
- 5h or equivalent primary limit bar
- weekly bar if available
- remaining percentage
- reset time

---

## Linux Transparency And Composition

### Problem Explanation

- On Linux, the widget window does not depend only on the frontend. Tauri uses the native system webview, which means WebKitGTK on this platform.
- Visual behavior is not equivalent to Windows or macOS. Transparency, blur, and related effects depend on the whole stack: Tauri, WebKitGTK, GTK, and the desktop environment.
- On X11, real transparency requires an active compositor. Without a compositor, a window with alpha may render with a black background.
- On Wayland the situation may be better, but it must not be assumed equivalent to Windows or treated as guaranteed full support.
- Even with an active compositor, transparency in Tauri + WebKitGTK may remain inconsistent or limited depending on version, distribution, and window manager.

### Adopted Technical Diagnosis

- Behavior was verified on Linux/X11 with Tauri and WebKitGTK using minimal test windows.
- A black background can persist even when the HTML UI is correct and the code requests a transparent window.
- When this happens, it must be treated as a native composition stack limitation, not as a widget layout bug.
- The project must not assume that a window marked as `transparent: true` will actually render transparent on Linux.

### Architecture Decision

- Do not pursue real transparency on Linux/X11 as a functional product requirement.
- Do not add fragile workarounds tied to a compositor, desktop environment, or specific WebKitGTK version.
- Do not block product work on visual iterations whose success depends on the user's graphics environment.
- Prioritize visual stability, readability, and widget consistency over advanced effects.

### Fallback Strategy

- The official Linux fallback is a polished dark panel that is visually stable and does not depend on real transparency.
- The widget should keep rounded corners, shadow, and sufficient contrast to maintain an overlay appearance even when the background is not truly transparent.
- The visual mode must work correctly with or without a compositor.
- The UI must remain readable and usable when native transparency is unavailable.

### Acceptance Criteria

- The app works correctly on Linux even without real transparency.
- There are no visual glitches caused by depending on a compositor for normal operation.
- The UI does not depend on real transparency to show providers, bars, states, or controls.
- The applied visual mode can be logged or exposed in diagnostics when needed.

### Future Considerations

- Evaluate Wayland behavior later as the preferred Linux path if real support proves more consistent.
- Revisit this decision when WebKitGTK or Tauri transparency support improves in a verifiable and reproducible way.
- If advanced visual support on Linux becomes necessary, evaluate alternative stacks or window strategies, but do not implement them without enough technical evidence.

States:

- initializing/detecting CLIs
- refreshing
- no providers
- provider detected but usage unavailable
- tolerable provider error

Layout rule:

- widget window height must adapt to real content, not only inner panel height
- if detected providers increase, the widget must grow
- if providers decrease, it must shrink to a practical minimum

---

## Localization

The UI must support:

- Spanish
- English

Detection:

- use the system/browser language available in the frontend
- if the language starts with `es`, use Spanish
- otherwise use English

---

## Usage Colors

Bars must communicate severity by remaining percentage through a smooth interpolation split into three health ranges:

- **Safe Range (0% to 45% usage)**: transition from **Green** (`#4fc978`) to **Yellow** (`#e5d85c`).
- **Warning Range (45% to 75% usage)**: transition from **Yellow** (`#e5d85c`) to **Orange** (`#f2a33a`).
- **Critical Range (75% to 100% usage)**: transition from **Orange** (`#f2a33a`) to **Red** (`#df3f3f`).

Percentage text must use the same computed color as its bar.

### Delta Segment (Session Consumption)

To provide feedback on immediate consumption, each bar may show a pulsing delta segment:

- **Function**: Represents only the usage increase that happened during the current application session.
- **Session Baseline**: On startup, the first valid value obtained, either from cache or from the first real query, is stored internally as the reference point. In this initial state, no delta is shown.
- **Activation**: The delta segment appears only when a later reading detects a usage increase compared with the session baseline.
- **Display Mode**:
  - In **Used Resources**: the delta is added to the right of the solid bar, showing spending growth.
  - In **Free Resources**: the delta occupies the space that has just been emptied to the right of the remaining reserve.
- **Baseline Update**: If a quota reset is detected because usage drops sharply compared with the baseline, the system automatically updates the baseline to the new minimum so consumption for the new quota starts from zero.

---

## Refresh

- refresh every 30 to 120 seconds
- default value: 120 seconds
- incremental update by provider, without waiting for the slowest provider before repainting the rest
- fault tolerance
- no UI blocking
- keep previous data visible during refresh and show a subtle indicator
- allow immediate manual refresh from the widget header

---

## Configuration

Optional local file in the repository root:

```json
{
  "refresh_interval_sec": 120
}
```

The value must be clamped between 30 and 120 seconds.

---

## Architecture

Expected modules:

- ProviderDetector
- CLIExecutor
- Platform abstraction
- CodexAdapter
- ClaudeAdapter
- future provider adapters
- Parser
- Unified data model
- UI Renderer
- Scheduler
- i18n
- Tray/window integration

Important rule:

- platform logic must be concentrated in a small and explicit layer
- most adapters and parsers must remain agnostic to Windows or Unix

---

## Security

- execute only whitelisted lookup commands and supported providers
- do not execute user input
- use fixed arguments
- use timeouts
- do not use the network to obtain data
- hide helper consoles on Windows
- close helper processes after reading
- on Unix, do not assume elevated privileges or dependencies outside Tauri/Node/local CLI tools

Current minimum whitelist:

- `where.exe` or `which`
- `codex`
- `claude`
- `gemini`

---

## Testing

Minimum cases:

1. Codex present with parseable `/status`.
2. Claude present with parseable `/usage`.
3. Gemini present with parseable quota table (`XX% used`).
4. Gemini with an exhausted capacity message.
5. Claude where the first `/usage` only dismisses a dialog and the second `/usage` shows usage.
6. Multiple providers present at the same time.
7. No providers present.
8. CLI detected but usage unavailable.
9. CLI failure through exit codes or timeouts.
10. Unexpected or noisy output, for example SSH agent messages at startup.
11. Unified time format across all tools.
12. UI with Gemini-specific labels (`24h`, `23:59`).
13. Spanish/English localization.
14. Adaptive widget height based on provider count.
15. Windows/Unix detection compatibility.

---

## Build

The project must generate a build for the current platform.

### Windows

- `.exe`
- installable bundle when Tauri supports it (`.msi`, NSIS, etc.)

### Ubuntu

- `.deb` and/or AppImage when the Tauri environment supports it

### macOS

- `.app`
- `.dmg` when the current environment supports it

Base commands:

```bash
npm install
npm test
npm run build
npm run tauri dev
npm run tauri build
```

Expected Ubuntu dependencies for compiling Tauri:

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

---

## Operational Context For Moving The Repo To macOS Or Ubuntu

### macOS

1. Install Node.js 20+, Rust, and the usual Tauri dependencies.
2. Install `codex`, `claude`, and/or `gemini` in a detectable path, for example with Homebrew or global npm.
3. Verify that `which codex`, `which claude`, and/or `which gemini` return a path from the terminal.
4. Run:

```bash
npm install
npm test
npm run tauri dev
```

5. Manually validate that the app detects CLIs when launched from the bundle/Finder, where `PATH` may be more limited.

### Ubuntu

If the repository is moved to an Ubuntu machine for continued development:

1. Install Node.js, Rust, and Tauri/WebKitGTK dependencies.
2. Install `codex` and, optionally, `claude`.
3. Verify that `which codex` and `which claude` return a path.
4. Run:

```bash
npm install
npm test
npm run tauri dev
```

5. Manually validate on that machine:
   - `codex --no-alt-screen` opens correctly in a PTY and responds to `/status`
   - `claude` responds to a second `/usage` if its initial screen appears
   - system tray and transparency behave acceptably in the desktop environment in use

If the previous development session state cannot be recovered, this file must be enough to understand:

- Codex and Claude already use real PTYs
- Claude may require two `/usage` commands
- the Claude parser must tolerate joined tokens after ANSI cleanup
- widget height must adapt to provider count
- the project already has a platform layer for Windows and Unix

---

## Expected Result

The executable application must:

1. Start without a visible console on Windows and as a native app on Ubuntu.
2. Detect Codex, Claude, and Gemini if installed.
3. Retrieve usage through the correct provider-specific flows.
4. Show a floating widget.
5. Show primary and weekly limits when available.
6. Refresh automatically.
7. Allow manual refresh.
8. Hide/restore from the system tray when the platform supports it well.
9. Show Spanish or English text based on system language.
10. Be extensible to other CLIs without rebuilding the foundation.
