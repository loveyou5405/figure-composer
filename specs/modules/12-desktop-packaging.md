# Desktop Packaging

Module: Desktop Packaging  
Spec version: 1.1.0  
Implementation status: Milestone 12 v1 source implemented; native release verification pending  
Last updated: 2026-09-18  
Depends on: UI Shell, Project Save and Load, Asset Import, PPTX Export, ADR-007, ADR-008

## 1. Responsibility

Wrap the existing React/Vite editor in a thin Tauri 2 desktop shell for Windows and macOS without moving canonical document behavior out of tested TypeScript domain modules.

The production deliverables are a double-clickable `Figure Composer.exe` on Windows and `Figure Composer.app` on macOS. Production bundles `dist/` directly and never requires npm, Python, localhost commands, a terminal, or a separately managed development server.

## 2. Native integration

Open, Save, Save As, Import, Replace/Refresh/Relink, and Export use native dialogs in Tauri. The filesystem plugin reads or writes only user-selected paths. Browser inputs/downloads remain a supported fallback. Source paths are persisted where the desktop API supplies them and reopening attempts non-destructive source rehydration.

## 3. Interaction

The desktop WebView keeps OS file drop enabled. Standard Ctrl/Cmd shortcuts cover New, Open, Save, Save As, Undo, Redo, Select All, Duplicate, Delete, and 1/5 mm arrow nudging. Page navigation remains compact and canvas-first.

Closing the main window exits the application; there is no tray/background mode. No Node, Python, HTTP server, converter, or sidecar is included in v1. If a future owned child process is introduced, the shutdown coordinator must terminate it before exit.

## 4. Onboarding and demo

The empty Assets view provides three short steps and a bundled deterministic three-page project containing WB, IF, Graph, Microscopy, and Schematic examples, automatic labels, preset sizing, and PPTX-ready vector sources.

## 5. Security and privacy

The app is local-first, has no cloud transport, and never modifies source files. Tauri capabilities expose only core defaults, native dialogs, and selected-file read/write/stat operations.

## 6. Unsaved-project shutdown protection

The frontend intercepts native close requests. A dirty project presents Save, Discard, and Cancel. Save must finish successfully before forced window destruction; picker cancellation or write failure keeps the app open. Discard clears the associated recovery record and exits. Cancel aborts shutdown. An active export prevents Save/Discard until the export finishes. Browser builds also register the standard dirty `beforeunload` guard.

The graceful order is: request close, resolve dirty state, finish active export, persist application settings, resolve recovery according to Save/Discard, destroy the main window, receive Tauri `RunEvent::Exit`, release the session lock, delete session TEMP, and terminate the process.

## 7. Session TEMP lifecycle

Every native launch creates `<OS TEMP>/FigureComposer/session-<pid>-<timestamp>/` with `preview`, `thumbnails`, `conversion`, `export-staging`, and `cache` subdirectories. A retained exclusive `.session.lock` distinguishes live instances. On startup, only session directories whose lock can be acquired, or which have no lock file, are treated as stale and recursively removed. Locked sessions belonging to another live instance are never removed.

On normal Tauri exit, the app unlocks and recursively deletes only its exact current session directory. It never targets source files, exported files, `.figproj`, application data, or paths outside the application-specific OS TEMP root. Multiple instances therefore have independent IDs, directories, and locks.

## 8. TEMP, recovery, and settings separation

Disposable conversion/cache state belongs only to session TEMP. Crash recovery remains under the persistent WebView application-data storage key `figure-composer:recovery:v1` and survives abnormal process termination. Preferences, reusable panel types/presets, label/manuscript style profiles, and recent layout/zoom settings use the distinct persistent key `figure-composer:settings:v1`. Neither recovery nor settings are deleted by TEMP cleanup.

Successful explicit Save and explicit Discard clear recovery. Normal shutdown flushes settings synchronously before window destruction.

## 9. Version identity and rollback record

`package.json` is the web version source. The UI derives its visible label from it (`1.0.0` → `v1.0`). Cargo and Tauri use the exact semantic version and the desktop title includes the visible version. `npm run version:check` blocks builds unless npm, Cargo, Tauri, `CHANGELOG.md`, and `VERSION_HISTORY.md` agree. Each release adds an immutable `specs/releases/vX.Y.Z.md` record and should receive a matching source-control tag or archived source snapshot.

## 10. Release verification

Required automated gates are version consistency, TypeScript/Vite production build, full tests, settings round-trip, 40-panel deterministic review, three-page PPTX planning/package checks, and production dependency audit.

Before Milestone 12 is marked fully release-certified on Windows, manually verify double-click launch without a terminal/server; window close terminates the Figure Composer process and leaves no owned Node/Python/listener; session TEMP exists while running and disappears after normal close; forced termination leaves recovery but the next launch removes only stale TEMP; and `.figproj`, source PNG/JPEG/SVG/TIFF, exported PPTX, settings, and presets remain intact. Equivalent `.app` launch/shutdown verification is required on macOS when available.

## 11. Known limitations

The current development host has no Rust/Cargo or native PowerPoint installation, so installers and actual PowerPoint rendering cannot be certified here. macOS packaging must run on macOS. No auto-updater, telemetry, cloud sync, or speculative desktop feature is included.

## 12. Changelog

- 1.0.0: Added Tauri 2 shell, capability boundary, native file workflows, desktop source restoration, shortcuts, onboarding, demo project, and RC verification contract.
- 1.1.0: Added mandatory v1 double-click/no-server architecture, unsaved-close coordinator, isolated locked session TEMP lifecycle, stale cleanup, recovery/settings separation, multi-instance safety, synchronized visible versioning, and expanded manual release gates.
