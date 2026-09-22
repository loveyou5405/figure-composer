# Figure Composer Version

- Product target: `1.0.0`
- Current checkpoint: `1.3.1`
- Project schema: `0.1.0`
- Specification system: `1.3.0`
- Last updated: 2026-09-22

`1.3.1` is displayed as `v1.3.1` in the web application, desktop window, and generated Windows preview controls. npm, Cargo, Tauri, launcher/closer filenames and contents, changelog, and immutable release record carry the same release identity; the build fails if they disagree. The project schema remains `0.1.0`; the portable container version is `1.0.0`.

## Project compatibility and saving rules

- New releases must import all previously supported `.figproj` files.
- Any schema change requires an explicit migration and regression test; an application update must not make an older project unreadable.
- The project title is user-editable from the top bar and is persisted inside the project document.
- `Save` overwrites the current writable file when the browser or desktop runtime provides one.
- When a new file must be created or downloaded, the suggested filename is `YYYYMMDD_Custom Name.figproj`.
- The former separate `Save As` action is intentionally not required in the compact UI; users can create a new dated file through the platform save flow when needed.
