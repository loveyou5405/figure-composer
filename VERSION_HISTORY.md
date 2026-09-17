# Figure Composer Version History

Every released version must update `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `CHANGELOG.md`, this file, its immutable file under `specs/releases/`, and the versioned launcher/closer. The production build fails when these version records disagree.

## v1.0.1 — 1.0.1 — 2026-09-18

- Added double-clickable Windows `Figure Composer Launcher v1.0.1.cmd` and `Close Figure Composer v1.0.1.cmd` controls.
- The launcher runs a hidden, managed local preview and opens the default browser; the closer authenticates through a launch-specific named pipe and stops only the child process owned by that launcher.
- Added `npm run launcher:generate` so later releases regenerate filenames and embedded versions from `package.json`.
- Expanded the build-time version gate and automated tests to require synchronized web, Tauri, Cargo, launcher, closer, changelog, and immutable release-record versions.
- This remains an interim Node-based preview control while native Tauri packaging awaits a Rust/MSVC-capable build host.

Rollback reference: restore Git tag `v1.0.1`, run `npm install`, then run `npm test` and `npm run build`. To return to the prior release, restore tag `v1.0.0`. Project schema remains `0.1.0`.

## v1.0 — 1.0.0 — 2026-09-17

- First complete multi-page A4 desktop release source.
- PNG, JPEG, SVG, and TIFF import with non-destructive source handling.
- Panel types, reusable sizing presets, alignment, distribution, automatic layout, labels, save/recovery, validation, and editable PPTX export.
- Tauri desktop shell with native dialogs and persistent selected source paths.
- Graceful unsaved-close protection and isolated per-session temporary storage lifecycle.
- Web and desktop surfaces visibly identify themselves as `v1.0`.

Rollback reference: restore the source snapshot or Git tag named `v1.0.0`, reinstall dependencies from `package-lock.json`, then run `npm test` and `npm run build`. Project schema remains `0.1.0`.
