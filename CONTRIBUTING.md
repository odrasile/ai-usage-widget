# Contributing

## Scope

This project is intentionally small. Changes should keep the widget simple, local-first, and easy to maintain.

## Development Rules

- Keep the architecture modular and direct.
- Do not introduce network usage for quota retrieval.
- Do not replace Tauri with Electron.
- Keep provider integrations isolated by adapter/parser.
- Preserve graceful degradation when a CLI is detected but usage is unavailable.

## Local Setup

```bash
npm install
npm test
npm run tauri:dev
```

For Linux builds, install the Tauri/WebKitGTK dependencies described in [README.md](./README.md).

## Pull Requests

- Keep pull requests focused.
- Include tests when parser or provider behavior changes.
- Document platform-specific tradeoffs when touching Tauri, PTY handling, or packaging.
