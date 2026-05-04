# AGENTS.md

## Goal

Implement and maintain a desktop widget for Windows, Ubuntu Desktop, and macOS that monitors AI coding tool usage through local CLIs.

The expected result is:

- A functional Tauri desktop application.
- A TypeScript frontend.
- A compact, floating, always-on-top, borderless widget.
- Local integration with Codex, Claude Code, and Gemini.
- Working builds for Windows, Ubuntu Desktop, and macOS.
- A simple, modular base that is ready to distribute.

---

## Working Principles

1. KISS: keep the code simple and direct.
2. Avoid overengineering.
3. Separate responsibilities by module.
4. Do not add dependencies unless they solve a real limitation.
5. Do not use the network or external APIs to obtain usage data.
6. Prioritize fault tolerance: if one provider fails, the widget must keep working.
7. Do not block the UI while querying CLIs.

---

## Workflow

1. Initialize or review the Tauri + frontend project.
2. Implement CLI detection.
3. Implement safe command execution.
4. Implement provider adapters.
5. Implement parsers with tests.
6. Implement the unified data model.
7. Implement the minimal UI.
8. Integrate the refresh scheduler.
9. Validate detection, parsing, and UI behavior.
10. Prepare builds and installers for Windows, Ubuntu Desktop, and macOS.
11. Document the result.

Do not skip phases unless the repository already has that phase completed.

---

## Technical Constraints

- Frontend: TypeScript.
- Desktop framework: Tauri.
- Local backend: Node.
- CLI execution: `child_process` and, when a real TTY is required, a pseudo-terminal.
- Do not use Electron.
- Do not use heavy UI libraries.
- Do not use external APIs to query usage.
- Do not implement history, multi-user support, or browser extensions.

---

## Codex Integration

Codex must not be queried with `codex status`, because current versions do not expose `status` as a subcommand.

Correct flow:

1. Detect installation with `where.exe codex` on Windows or `which codex` on Unix/macOS.
2. Open `codex --no-alt-screen` inside a pseudo-terminal.
3. Send `/status`.
4. Capture output.
5. Exit with `/quit`.

Expected data:

- `5h limit: ... NN% left (resets HH:MM)`
- `Weekly limit: ... NN% left (resets ...)`

The adapter must extract percentage and reset data for both the 5h and weekly limits.

Do not use `codex exec /status` for the widget. It creates a non-interactive session, may consume tokens/events, and does not represent the TUI internal command.

---

## Claude Code Integration

1. Detect installation with `where.exe claude` on Windows or `which claude` on Unix/macOS.
2. Run `claude`.
3. Send `/usage` through stdin or PTY input depending on the adapter path.
4. Parse remaining requests, total requests, and reset.

Calculation:

```text
percent_left = remaining / total * 100
```

---

## Gemini CLI Integration

Gemini CLI shows quota in the TUI status bar when it starts.

Correct flow:

1. Detect installation with `where.exe gemini` on Windows or `which gemini` on Unix/macOS.
2. Launch `gemini` inside a pseudo-terminal when the TUI must be captured.
3. Use `GEMINI_API_KEY=1` only if the user has not defined `GEMINI_API_KEY`, to avoid keyring dialogs without persisting that value.
4. Capture the status table.
5. Close the PTY in a controlled way, including the process group on Unix.

Expected data:

- `quota` column with `NN% used`
- `quota` column with `limit reached`

Calculation:

```text
percent_left = 100 - percent_used
```

---

## Security

- Only execute whitelisted commands: `where.exe`/`which`, `codex`, `claude`, and `gemini`.
- Do not execute arbitrary user input.
- Use fixed arguments.
- Add timeouts to every execution.
- Do not query external APIs for quota data.
- On Windows, hide helper consoles:
  - Tauri must compile as the `windows` subsystem.
  - Node processes launched from Rust must use `CREATE_NO_WINDOW`.
  - Codex PTY should use hidden mode when available.
- On Unix/macOS:
  - Do not assume elevated privileges.
  - Close PTYs and helper process groups after reading.
  - Do not depend on Windows-only APIs outside platform-gated branches.

---

## UI And UX

The widget must:

- Be always-on-top.
- Have no native window decorations.
- Be draggable from the header.
- Have a close button.
- Have a button to hide to the system tray.
- Restore from the tray with a click or menu.
- Show initialization/CLI detection state with a visual indicator.
- Keep previous data visible during refreshes and show a subtle refresh indicator.
- Detect the system/browser language and show Spanish or English text.

For each provider:

- Show name.
- Show the 5h bar if available.
- Show the weekly bar if available.
- Show percentage and reset for each bar.
- Match percentage text color to the corresponding bar color.

Recommended color scale:

- 100%: green.
- 55%: yellow.
- 25%: orange.
- 0%: red.

---

## Data Model

Provider with data:

```json
{
  "provider": "codex",
  "available": true,
  "usage": {
    "primary": {
      "percent_left": 58,
      "reset": "20:45"
    },
    "weekly": {
      "percent_left": 81,
      "reset": "09:24 on 29 Apr"
    }
  }
}
```

Provider detected without usage:

```json
{
  "provider": "codex",
  "available": false,
  "usage": null,
  "status": "CLI detected; usage unavailable"
}
```

---

## Testing

The agent must:

- Simulate CLI outputs.
- Cover realistic `codex /status` output.
- Cover realistic `claude /usage` output.
- Cover realistic `gemini` output with quota in the status table.
- Handle parsing errors.
- Validate that the UI does not break if a provider is missing.
- Validate that a provider detected without data is not shown as nonexistent.

Minimum commands:

```bash
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

---

## Deliverables

- Complete source code.
- Build scripts.
- README with instructions.
- Builds and installers for Windows, Ubuntu Desktop, and macOS when run on their native platform or an equivalent CI runner.
- Parser tests.

---

## Do Not

- Do not add unspecified features.
- Do not implement history.
- Do not implement multi-user support.
- Do not add a browser extension.
- Do not query external services for usage/quota data.
- Do not replace Tauri with Electron.
