# Figure Composer Version History

Every released version must update `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `CHANGELOG.md`, this file, its immutable file under `specs/releases/`, and the versioned launcher/closer. The production build fails when these version records disagree.

## v1.4.0 — 1.4.0 — 2026-09-24

- Added single-image preset selection, lowercase labels, and compact horizontal-first layout behavior.

## v1.3.1 — 1.3.1 — 2026-09-22

- Added editable Figure naming in the top bar.
- Save now overwrites the current writable file; new browser files use `YYYYMMDD_Custom Name.figproj`.
- Recorded the rule that all future releases must import previously supported `.figproj` files through explicit migrations and regression tests.
- Regenerated the versioned Windows launcher and closer.

Rollback reference: restore `v1.3.0`, reinstall exact dependencies, and rerun the verification contract. Project schema remains `0.1.0`.

## v1.3 — 1.3.0 — 2026-09-22

- Replaced metadata-only Save output with a single portable `.figproj` ZIP-compatible container containing `project.json` and every original image file.
- Stores image entries without lossy conversion, records byte size and SHA-256, and verifies both before reopening.
- Restores embedded files as live editable sources so later Save and PPTX export do not depend on the original computer or path.
- Added an explicit `Import Figure` action and kept legacy JSON `.figproj` loading compatible.
- Blocks portable Save when an exact original source is missing instead of silently substituting a preview.
- Regenerated `Figure Composer Launcher v1.3.cmd` and `Close Figure Composer v1.3.cmd` from the authoritative npm version.

Rollback reference: restore `v1.2.0`, reinstall exact dependencies, and rerun the verification contract. Existing portable v1.3 projects require v1.3 or newer; legacy JSON projects remain readable by v1.3.

## v1.2 — 1.2.0 — 2026-09-22

- Added explicit Figure groups: Add Page continues the active Figure, while New Figure creates a new first page and restarts automatic labels at A.
- Added a Figure quick-jump selector beside the global page navigator and a Figure-local page caption below the canvas that is not part of the page or export.
- Kept Auto Layout and overflow pages inside their owning Figure, and limited page reordering to that Figure.
- Changed `All pages` export to `All Figures`, producing one PowerPoint containing every Figure/page in project order, one canvas page per A4 slide.
- Added backward-compatible loading that treats projects without Figure IDs as one continuous Figure.
- Regenerated `Figure Composer Launcher v1.2.cmd` and `Close Figure Composer v1.2.cmd` from the authoritative npm version.

Rollback reference: restore `v1.1.2`, reinstall exact dependencies, and rerun the verification contract. Project schema remains `0.1.0`.

## v1.1.2 — 1.1.2 — 2026-09-21

- Changed Auto Layout row placement so visible labels share one label-anchor Y position.
- Preserved the requested fallback for panels without rendered labels: their image center follows the preceding image center.
- Made Auto Label row detection accept matching image tops, image centers, or label anchors, preventing C/D reversals after a label is hidden.
- Kept authenticated, launch-owned shutdown available when the checkout is updated while an older preview is still running.
- Regenerated `Figure Composer Launcher v1.1.2.cmd` and `Close Figure Composer v1.1.2.cmd` from the authoritative npm version.

Rollback reference: restore `v1.1.1`, reinstall exact dependencies, and rerun the verification contract. Project schema remains `0.1.0`.

## v1.1.1 — 1.1.1 — 2026-09-20

- Corrected mixed labeled/unlabeled Auto Layout rows to align the image centers while continuing to reserve visible-label bounds for collision avoidance.
- Rebased scale percentages on the 96 DPI original-image size used by generated PowerPoint output, including import, manual scaling, presets, source replacement, and legacy project loading.
- Relabeled the selected-panel control as `PPT scale` and added regression coverage for the reported 60% case.
- Regenerated `Figure Composer Launcher v1.1.1.cmd` and `Close Figure Composer v1.1.1.cmd` from the authoritative npm version.

Rollback reference: restore `v1.1.0`, reinstall exact dependencies, and rerun the verification contract. Project schema remains `0.1.0`; saved panel geometry is unchanged by the scale-base normalization.

## v1.1 — 1.1.0 — 2026-09-20

- Implemented Ctrl/Cmd+V paste for SVG/TIFF/PNG/JPEG representations exposed by the browser/WebView, creating one active-page Other panel with one-entry Undo/Redo, physical-size parsing, 3 mm safe placement, and source-quality/effective-DPI feedback.
- Added persistent clipboard diagnostics and a compact collapsed inspector disclosure for available formats, canonical/preview distinction, source pixels, physical/displayed size, live effective DPI, and preview conversion.
- Added the remaining source-fidelity-first native PowerPoint clipboard roadmap and a dedicated module contract spanning provider selection, canonical/preview separation, persistence, export, TEMP ownership, security, and Windows verification.
- Updated related project-model, asset-import, UI, persistence, PPTX, validation, desktop-packaging, master-specification, and README contracts while keeping native EMF/WMF support explicitly deferred.
- Consolidated the current TIFF, page-safe-margin, and label-position work under the `1.1.0` checkpoint while retaining project schema `0.1.0`.
- Regenerated synchronized `Figure Composer Launcher v1.1.cmd` and `Close Figure Composer v1.1.cmd` controls from the authoritative npm version.

Rollback reference: restore the prior Git tag `v1.0.1`, run `npm install`, then run `npm test` and `npm run build`. Project schema remains `0.1.0`; no migration is required.

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
