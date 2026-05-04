# Release Plan

Repository cleanup, preparation, and publication plan.

This document is a living checklist. Mark an item only when the change has been applied and validated.

## Goals

- Publish the repository cleanly in Git.
- Keep explicit support for Windows, Ubuntu Desktop, and macOS.
- Generate platform installers through native builds or CI runners using the same operating system.
- Avoid publishing local artifacts, temporary scripts, or documentation biased toward one platform.

## Initial Findings

- [x] Project based on Tauri + TypeScript + local Node backend.
- [x] Currently supported providers: Codex, Claude Code, and Gemini.
- [x] README.md already mentions Windows, Ubuntu, and macOS.
- [x] SPECIFICATIONS.md already covers much of the cross-platform architecture.
- [x] AGENTS.md was originally written with a mainly Windows-oriented goal.
- [x] README.md had duplicated/confusing build script descriptions.
- [x] SPECIFICATIONS.md needed small adjustments to treat Gemini as a complete provider in the expected result.
- [x] A temporary tracked script existed: `tmp-claude-debug.mjs`.
- [x] CI validated Ubuntu, but did not generate cross-platform installers.

## Phase 1: Documentation Cleanup

- [x] Update `AGENTS.md` to declare Windows, Ubuntu Desktop, and macOS as target platforms.
- [x] Review `AGENTS.md` to replace Windows-only commands with cross-platform equivalents where applicable.
- [x] Update `README.md` to clearly separate:
  - local development
  - local build for the current platform
  - installer generation
  - release publication
- [x] Fix duplicated script descriptions in `README.md`.
- [x] Document that installers must be built on native runners:
  - Windows on `windows-latest`
  - Ubuntu on `ubuntu-latest`
  - macOS on `macos-latest`
- [x] Update `SPECIFICATIONS.md` to include Gemini in the expected result alongside Codex and Claude.
- [x] Review `CONTRIBUTING.md` to align commands with `npm ci`, `npm test`, `npm run build`, and `cargo check`.

## Phase 2: Repository Cleanup

- [x] Delete `tmp-claude-debug.mjs` or move it to `scripts/dev/` with configurable paths.
- [x] Review whether Android/iOS icons under `src-tauri/icons/` should be kept or removed.
  Decision: keep them. iOS icons are part of the set needed to package macOS correctly with Tauri.
- [x] Confirm that `.gitignore` covers:
  - `node_modules/`
  - `dist/`
  - `src-tauri/target/`
  - logs
  - local configuration (`config.json`)
- [x] Confirm that no logs or temporary dumps are tracked.
- [x] Review `git status --short` before preparing commits.

## Phase 3: Local Validation

- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run `cargo check` in `src-tauri`.
- [x] Run `npm run tauri build` if the environment allows it.
- [x] Confirm that a real provider query does not leave resident processes behind.
- [x] Confirm that the app remains fault-tolerant if a CLI is missing.

## Phase 4: Validation CI

Note: this phase is configured in GitHub Actions; actual execution remains pending until the branch is published on GitHub.

- [x] Convert `.github/workflows/ci.yml` to a cross-platform matrix.
- [x] Run checks on:
  - Ubuntu
  - Windows
  - macOS
- [x] Use `npm ci` in CI.
- [x] Keep WebKitGTK dependency installation only on Ubuntu.
- [x] Run `npm test` on all systems.
- [x] Run `npm run build` on all systems.
- [x] Run `cargo check` on all systems.

## Phase 5: Release Workflow

Note: this phase is configured in GitHub Actions; actual Windows/macOS installer generation remains pending until a `v*` tag is created.

- [x] Create `.github/workflows/release.yml`.
- [x] Trigger releases from `v*` tags.
- [x] Use matrix:
  - `windows-latest`
  - `ubuntu-latest`
  - `macos-latest`
- [x] Install system dependencies on Ubuntu.
- [x] Run `npm ci`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run `npm run tauri build`.
- [x] Upload Tauri-generated artifacts to GitHub Releases.
- [x] Document that bundles are initially unsigned unless a later decision changes that.

## Phase 6: Expected Installers

### Windows

- [ ] Generate a Tauri installer for Windows (`.msi` and/or NSIS, depending on final config).
- [ ] Validate that no helper console appears.
- [ ] Validate Node and CLI detection from the installed app.
- [ ] Document the possible SmartScreen warning when unsigned.

### Ubuntu

- [x] Generate `.deb` and/or AppImage.
  Local result: `.deb`, `.rpm`, and `.AppImage` were generated with `npm run tauri:build`.
- [x] Validate required runtime dependencies.
  Local result: `ldd` resolved the generated binary's main native dependencies; no missing libraries were detected in this Ubuntu environment.
- [ ] Validate system tray behavior.
- [x] Document Linux/WebKitGTK transparency limitations.

### macOS

- [ ] Generate `.app` and/or `.dmg`.
- [ ] Validate `PATH` resolution when launched from Finder/Dock.
- [ ] Validate detection of CLIs installed with Homebrew/global npm.
- [ ] Document the possible Gatekeeper block when not notarized.

## Phase 7: Git Publication Preparation

- [x] Review product name, description, and license.
- [x] Review `package.json`.
- [x] Review `src-tauri/tauri.conf.json`.
- [x] Review `LICENSE`, `SECURITY.md`, and `CONTRIBUTING.md`.
- [ ] Create small, reviewable commits:
  - cross-platform documentation
  - repository cleanup
  - CI/release
- [ ] Create remote repository.
- [x] Push main branch.
- [x] Create initial tag `v0.1.0`.
- [x] Run release workflow.
  Result: `v0.1.0` successfully generated Windows, Ubuntu, and macOS assets in GitHub Releases.
- [ ] Test generated installers before announcing the release.

## Pending Decisions

- [x] Decide whether to bundle the Node runtime with the app or keep Node.js 20+ as an external requirement.
  Decision: for `v0.1.0`, keep Node.js 20+ as an external requirement. Preserve resolution through `MONITORAI_NODE_BIN`, future bundled runtime, `PATH`, and common locations.
- [x] Decide whether to sign Windows/macOS installers in the first release.
  Decision: the first release does not sign or notarize installers. README and release notes must document possible SmartScreen and Gatekeeper warnings.
- [x] Decide whether to keep Tauri-generated Android/iOS icons.
  Decision: keep them; especially iOS icons are needed for macOS packaging.
- [x] Decide the final remote repository name.
  Decision: the remote repository is named `ai-usage-widget`.
- [x] Decide whether to keep `bundle.targets = "all"` or set targets per platform in CI.
  Decision: keep `bundle.targets = "all"` for `v0.1.0`. Each native runner generates the bundles supported by Tauri on that platform.
