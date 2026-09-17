# Figure Composer Version History

Every released version must update `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `CHANGELOG.md`, this file, and its immutable file under `specs/releases/`. The production build fails when these version records disagree.

## v1.0 — 1.0.0 — 2026-09-17

- First complete multi-page A4 desktop release source.
- PNG, JPEG, SVG, and TIFF import with non-destructive source handling.
- Panel types, reusable sizing presets, alignment, distribution, automatic layout, labels, save/recovery, validation, and editable PPTX export.
- Tauri desktop shell with native dialogs and persistent selected source paths.
- Graceful unsaved-close protection and isolated per-session temporary storage lifecycle.
- Web and desktop surfaces visibly identify themselves as `v1.0`.

Rollback reference: restore the source snapshot or Git tag named `v1.0.0`, reinstall dependencies from `package-lock.json`, then run `npm test` and `npm run build`. Project schema remains `0.1.0`.
