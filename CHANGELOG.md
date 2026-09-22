# Changelog

All notable changes to Figure Composer are documented here. Versions follow Semantic Versioning.

## [Unreleased]

## [1.3.0] - 2026-09-22

### Added

- Added a single-file portable `.figproj` container with `project.json` plus exact embedded PNG, JPEG, SVG, and TIFF source bytes.
- Added per-asset byte-size and SHA-256 integrity verification during Import Figure.
- Added an explicit `Import Figure` project action and portable project MIME/file-picker support in browser and desktop modes.

### Changed

- Save and Save As now create portable projects that can move to another computer and reopen without the original image paths.
- Reopened embedded assets become exact in-session source files for later editing, saving, source checking, and export.
- Portable Save blocks when exact source bytes are unavailable rather than substituting a rendered preview or recompressed image.
- Legacy JSON `.figproj` files remain readable; recovery storage remains metadata-only and separate from durable portable Save.

## [1.2.0] - 2026-09-22

### Added

- Added explicit Figure grouping with a `New Figure` action; ordinary Add Page continues the active Figure.
- Added first-page Figure jumping beside the page navigator and a Figure-local page indicator below the canvas that is excluded from the page and PPTX.
- Added backward-compatible Figure ownership for saved projects that predate Figure IDs.

### Changed

- Continuous Auto Label now continues across pages within one Figure and restarts at A for each new Figure.
- Auto Layout and overflow pagination preserve Figure boundaries, and pages can only be reordered within their Figure.
- PPTX `All Figures` export writes every Figure into one presentation in project order, with each Figure Composer page becoming one A4 slide.

## [1.1.2] - 2026-09-21

### Fixed

- Auto Layout now aligns visible label anchors within each row while keeping a hidden-label panel centered on the preceding image.
- Auto Label now recognizes top-, center-, or label-aligned panels as row peers, preventing left-to-right labels from reversing after `Show label` is disabled.
- The current versioned closer can securely stop an older managed preview from the same checkout after an in-place update.

## [1.1.1] - 2026-09-20

### Fixed

- Auto Layout now aligns images in each row by their vertical centers, so disabling `Show label` no longer raises that image to the neighboring label boundary.
- Editor and preset scale percentages now use PowerPoint's 96 DPI original-image reference; `60%` in Figure Composer therefore exports as the corresponding `60%` PowerPoint size rather than the former fixed-64-mm ratio.
- Loading an older `.figproj` normalizes its internal panel scale bases without changing any saved panel geometry.

## [1.1.0] - 2026-09-20

### Added

- Added local `.tif` / `.tiff` import using first-page TIFF decoding and session-only PNG previews while preserving original source bytes.
- Added TIFF MIME/extension validation, malformed-data tests, and a 100-megapixel preview safety limit.
- Added a complete high-fidelity PowerPoint clipboard roadmap covering web/native providers, SVG/EMF/WMF/TIFF/PNG/DIB/JPEG fidelity ranking, physical-size preservation, canonical/preview separation, persistence, Review, export, TEMP ownership, and verification.
- Added a dedicated clipboard-import module specification and connected contracts across project data, asset import, UI, save/load, PPTX export, validation, and desktop packaging.
- Implemented Ctrl/Cmd+V image paste through the web clipboard provider for browser-exposed SVG, TIFF, PNG, and JPEG representations.
- Clipboard paste now creates one Other panel on the active page as one Undo/Redo transaction, preserves reliable HTML physical dimensions, uses a deterministic 3 mm safe-region cascade, and displays source-quality/effective-DPI metadata.
- Added compact, collapsed Clipboard Source Diagnostics with available/selected formats, canonical-versus-preview identity, vector/raster class, source pixels, physical/displayed size, live effective DPI, conversion state, and bitmap-fallback guidance.

### Changed

- Replaced the label-font free-text field with an Arial / Times New Roman dropdown.
- Changed the publication-style label default to -2 mm X / -2 mm Y from each panel's top-left anchor and render labels fully above the image content.
- Added an explicit choice to reapply changed defaults to automatically positioned labels or use them only for future automatic labels; manual positions remain protected.
- Refactored canonical ownership to `Project → ordered A4 Pages → Panels`, with stable page IDs and page-local millimeter geometry.
- Bound canvas interactions to the stable active-page record while keeping page management compact.
- Added structural validation and pure operations for page creation, page-scoped mutations, and explicit cross-page panel movement.
- Updated the future PPTX contract to emit one ordered A4 slide per project page.

### Known limitations

- Native EMF/WMF enumeration, portable clipboard-asset embedding, and canonical native clipboard export remain roadmap work. Browser/WebView fidelity is limited to representations the platform exposes to web paste events.

## [1.0.1] - 2026-09-18

### Added

- Versioned, double-clickable Windows preview launcher and closer files.
- A launch-specific named-pipe control channel so the closer shuts down only its owned preview process tree.
- Launcher regeneration and build-time checks that keep launcher, closer, web, Cargo, Tauri, changelog, and release-record versions synchronized.

### Changed

- Updated the visible web and desktop version to `v1.0.1`.

### Known limitations

- The preview controls require the existing Node.js environment and are not a substitute for the final bundled Tauri `.exe`; native packaging still requires Rust and MSVC tooling.

## [1.0.0] - 2026-09-18

### Added

- Visible `v1.0` identity in the bundled web application and native desktop window title.
- Build-time version consistency gate covering npm, Cargo, Tauri, changelog, and version history records.
- Explicit Save / Discard / Cancel protection when closing a dirty desktop project; active exports must finish before shutdown.
- Unique per-launch `FigureComposer/session-<pid>-<timestamp>` temporary directories with preview, thumbnail, conversion, export-staging, and cache subdirectories.
- Cross-process session lock files, conservative stale-session cleanup, and normal-exit recursive temporary cleanup without touching projects, sources, exports, recovery, or settings.
- Persistent application settings for preferences, reusable panel presets/types, label-style profiles, and recent layout settings, kept separately from disposable TEMP and crash recovery.
- Immutable `VERSION_HISTORY.md` and `v1.0.0` release specification for rollback-oriented release tracking.
- Persistent-settings and synchronized-version coverage brings the automated suite to 18 test files and 187 passing tests.

### Changed

- Production desktop architecture explicitly bundles the Vite output inside Tauri and runs no Node/Python/localhost server or unmanaged sidecar.
- Project Save now reports success/cancel/failure to the shutdown coordinator so closing occurs only after a confirmed successful save.

### Verification boundary

- Automated application, settings, version, PPTX, and lifecycle-adjacent tests run locally. The Windows double-click installer, process termination, live TEMP cleanup, forced-crash recovery, and macOS application checks still require native build hosts with Rust/MSVC or Xcode.

## [0.9.0-rc.1] - 2026-09-17

### Added

- Tauri 2 desktop source architecture for Windows and macOS with least-privilege native dialog/filesystem capabilities.
- Native Open, Save, Save As, Import, Replace/Refresh/Relink, and PPTX Export routing with browser fallbacks.
- Persistent desktop source paths and best-effort source rehydration on project Open.
- Ctrl/Cmd+N and Ctrl/Cmd+D alongside the existing save/open/history/select/delete/nudge shortcuts.
- Three-step empty-project onboarding and a deterministic bundled three-page vector demo.
- Six desktop/release tests plus desktop source-path refresh coverage, including 40-panel deterministic review and generated three-page PPTX package validation, bringing the full suite to 181 tests.
- Updated Vite, Vitest, and the React Vite plugin to audited Node 20-compatible releases; `npm audit` reports zero vulnerabilities.

### Known limitations

- Rust/Cargo, macOS, and native PowerPoint are unavailable on the current validation host, so installers, platform installation, signing/notarization, OS drag/drop, packaged crash recovery, and native PowerPoint rendering remain RC certification tasks.

## [0.7.0-m11] - 2026-09-17

### Added

- Stable severity-sorted Review findings for structural ownership, page/safe-margin bounds, near-edge placement, panel/label collisions, label state, preset deviation, same-type scaling, missing/changed sources, TIFF fallback, and effective raster DPI.
- Compact Review sidebar with click-to-focus behavior and explicit Reset preset, Move inside margin, Relabel page, and Refresh source fixes.
- Export review summary with errors blocked and warnings requiring Export Anyway.
- Twelve focused validation tests covering thresholds, floating-point tolerance, deterministic ordering, and non-destructive fixes.

## [0.6.0-m10] - 2026-09-17

### Added

- Editable `.pptx` export using one 210 × 297 mm slide for each selected ordered project page.
- Compact All pages / Current page export dialog with busy, failure, and completion feedback.
- Independent named picture objects for panels and editable text objects for visible labels.
- Direct page-local millimeter-to-inch conversion with exact A4 and object geometry.
- Missing-source preflight, outside-page warnings, and deterministic duplicate object-name suffixes.
- Vector SVG retention in the PPTX media package where supported, without flattening complete slides.
- Bounded OOXML integrity repair for PptxGenJS multi-slide content-type declarations that reference nonexistent slide masters.
- Seven focused export planning/package tests, bringing the full suite to 162 tests.
- Accepted ADR-003 with PptxGenJS 4.0.1 as the isolated, dynamically loaded export implementation.

### Known limitations

- TIFF uses the existing first-page PNG preview for PowerPoint compatibility.
- Advanced SVG effects and font metrics can differ between PowerPoint versions.
- Crop, rotation, grouping, progress percentage, and advanced export controls are deferred.

## [0.5.0-m9] - 2026-09-17

### Added

- Panel-specific Replace Source while preserving panel ID, page, type, preset, label, order, and override metadata.
- Preserve-width/preserve-center replacement sizing with deterministic changed-aspect height calculation.
- Optional Reapply panel preset sizing for Replace and Refresh.
- Shared-asset Refresh Source and explicit one-transaction Refresh Changed.
- Exact-layout Relink Source for reopened missing-source panels.
- Filename, byte-size, and modified-time fingerprints plus capability-aware changed/missing/unchanged/unavailable checks.
- Compact Check Sources summary and per-panel source status without adding another permanent toolbar.
- Eleven focused source-lifecycle tests, bringing the full suite to 155 tests.
- ADR-006 for explicit, non-destructive browser source binding and refresh behavior.

### Changed

- Source changes are never applied automatically; every Refresh remains an explicit user action.
- Committed source operations participate in Undo/Redo and autosave recovery as atomic document transactions.
- SVG replacement remains vector in the preview pipeline; TIFF continues to use its safe local first-page preview.

### Known limitations

- Standard browser input/drop sources are immutable snapshots, so automatic disk-change detection is unavailable without a refreshable platform handle.
- Folder relinking and persistent native source paths are deferred to desktop packaging.

## [0.4.0-m8] - 2026-09-17

### Added

- Compact `Page n / total` previous/next navigation and top-bar Add Page action.
- Page inspector actions for Add, Delete, Duplicate, Move Earlier, and Move Later.
- Populated-page deletion confirmation with panel count and Undo recovery.
- Unique page/panel identity generation when duplicating a populated page while reusing immutable asset references.
- Explicit Move to Page, Previous Page, and Next Page commands for one or multiple selected panels.
- Safe-area-aware destination placement preserving panel dimensions, metadata, and group-relative geometry.
- Atomic Undo/Redo and autosave recovery coverage for every page lifecycle/order/movement operation.
- Eleven focused page-management tests, bringing the full suite to 144 tests.

### Known limitations

- Cross-page movement is command-based; direct drag between pages is deferred.
- Destination panels are not treated as collision obstacles during explicit movement.
- Groups larger than the destination safe area are rejected rather than scaled.

## [0.3.0-m7] - 2026-09-17

### Added

- Human-readable `.figproj` Save, Save As, and Open with explicit schema `0.1.0` and migration foundations.
- Validated persistence for ordered A4 pages, page-owned millimeter panel geometry, labels, presets, types, manual/layout overrides, asset metadata, and Auto Layout settings.
- Missing-source asset state and placeholders that retain panel metadata instead of deleting unavailable scientific content.
- File System Access API writable-handle support with browser download fallback.
- A 750 ms debounced local recovery snapshot and explicit startup Restore / Discard prompt.
- Bounded 200-operation immutable Undo/Redo history covering implemented canonical edits.
- One-entry pointer move/resize transactions and atomic cross-page Auto Layout undo behavior.
- Compact top-bar file/history actions, dirty status, and Ctrl/Cmd+O/S/Z/Shift+Z/Y shortcuts.
- Twelve focused persistence/history tests, bringing the full suite to 133 tests.

### Known limitations

- Browser fallback Save downloads a new file rather than overwriting an earlier download.
- Original image bytes are deliberately not embedded; reopening shows missing-source placeholders until Milestone 9 adds Relink Source.
- Page navigation and management remain deferred to Milestone 8 even when Auto Layout creates overflow pages.

## [0.2.0-m6] - 2026-09-17

### Added

- Deterministic geometry-aware Auto Layout with Balanced, Compact, and Equal Rows scoring modes.
- Exact millimeter row/column gaps and 12 mm A4 safe-area placement.
- Arrange Selection, Arrange Page, and Arrange Project actions in the existing Layout sidebar tab.
- Auto Pagination that preserves order, panel IDs, types, presets, labels, and manual overrides while creating stable A4 pages as needed.
- Existing-page reuse for project arrangement and atomic before/after transaction metadata for Milestone 7 history integration.
- Top-N deterministic candidate output, orphan-row scoring, and an explicit 95–100% minor-scaling option that is off by default.
- Thirteen focused Auto Layout tests covering geometry, scoring, scopes, pagination, order, metadata preservation, zoom independence, and scaling limits.

### Known limitations

- Auto-created overflow pages update the page count but cannot be navigated until Milestone 8.
- Selection arrangement does not yet reserve unrelated panel geometry as obstacles.
- Candidate cycling UI is deferred even though the engine returns deterministic top-N candidates.

## [0.1.0-m5] - 2026-09-16

### Added

- Panel-owned label metadata with automatic/manual text intent, visibility, millimeter offsets, and automatic/manual offset intent.
- A…Z, AA, AB, and unbounded alphabetic label generation.
- Geometry-only top-to-bottom, left-to-right reading order with a deterministic 5 mm row tolerance.
- Explicit Auto Label Page and Auto Label Selection actions.
- Preserve-manual and Replace-all relabel policies, with preservation as the default.
- Hidden-label exclusion for major-panel sequencing.
- Live text label preview using project-level Arial Bold 10 pt defaults and zoom-independent millimeter positioning.
- Collapsed project label settings for typography, default offsets, and continuous/restart-per-page sequence mode.
- Pure multi-page sequence utilities and label warning hooks for duplicate, missing, outside-page, and manual states.
- Eighteen focused label tests covering sequence, order, selection/page scope, manual policies, layout attachment, zoom, multi-page sequencing, and validation.

### Known limitations

- Page navigation and Relabel All Pages UI remain deferred even though ordered multi-page sequence utilities are implemented.
- Order preview, direct label dragging, collision solving, per-label typography, and the full Review UI are deferred.
- Label state remains in memory until Milestone 7 persistence.

## [0.1.0-m4] - 2026-09-16

### Added

- Active-page Shift-click, bounding-box-intersection marquee, and Ctrl/Cmd+A multi-selection.
- Ordered selection state with the last-selected panel as deterministic anchor.
- Collective drag and 1 mm / Shift+Arrow 5 mm keyboard movement with group boundary clamping.
- Smart snapping to safe margins, page centers, and peer-panel edges/centers with temporary guides.
- Zoom-normalized 6 px snap tolerance and Alt/Option temporary snap disable.
- Anchor- and page-relative alignment, equal edge-gap distribution, exact horizontal/vertical spacing, and aspect-safe equal width/height.
- Compact multi-selection inspector with batch preset assignment.
- Automated selection and layout coverage, including page isolation.

### Known limitations

- Smart distance indicators and Tidy Selection are deferred.
- Page-management UI, automatic overflow, cross-page drag, grouping, persistence, and undo/redo remain deferred.

## [0.1.0-m3] - 2026-09-16

### Added

- Extensible panel types with built-in WB, IF, IHC, Graph, Flow, Heatmap, Microscopy, Schematic, and Other definitions.
- Reusable default sizing presets from WB 50% and IF 40% through the remaining requested scientific-panel defaults.
- Deterministic filename inference, including `_Prism` mapping to Graph.
- Stable-base preset sizing so repeated type changes never compound panel dimensions.
- Inspector controls for type assignment, manual scale override, preset-following status, and reset-to-preset.
- Inline preset editing and custom preset creation with explicit Apply to all, Future panels only, or Cancel decisions.
- Batch-safe domain functions for assigning types and applying preset changes without adding multi-selection UI.
- Unit coverage for inference, preset application, override protection, tolerance, lock inheritance, and custom extension behavior.

### Changed

- New imports receive their inferred type and preset-relative size while retaining immutable source asset data.
- Manual canvas resize now records a preset override; panel position changes do not affect preset-following state.
- Aspect-ratio lock is inherited from the selected preset and remains enabled by default.

### Known limitations

- Presets use percentage scaling from each panel's import-time base dimensions; target-width sizing is deferred.
- Custom presets cannot yet be deleted or reordered, and duplicate display names are allowed.
- Apply to all deliberately protects panels with manual scale or resize overrides.
- Imported assets and preset edits are session-only because persistence remains deferred.
- Multi-selection, snapping helpers, alignment, distribution, and equal-size tools are deferred to Milestone 4.

## [0.1.0-m2] - 2026-09-16

### Added

- Local multi-file PNG, JPEG, and SVG import from a picker or direct A4 canvas drop.
- Independent, stable asset and panel IDs for every accepted file.
- Canonical millimeter panel geometry with deterministic 1 mm drag snapping.
- Aspect-ratio-preserving bottom-right resize in millimeter space.
- Single-panel selection bounding box, Assets list selection, contextual inspector, and delete actions.
- Per-file import errors that do not cancel valid siblings.

### Changed

- The Assets sidebar is now functional while Presets and Layout remain intentionally deferred.
- The empty A4 page is an explicit file drop target.

### Known limitations

- Imported assets are session-only because project persistence is not part of Milestone 2.
- Full local source paths are unavailable in the browser implementation.
- Selection is single-panel and resize is limited to the bottom-right aspect-locked handle.

## [0.1.0-m1] - 2026-09-16

### Added

- React, TypeScript, and Vite project skeleton.
- Three-region application shell with a page-context inspector.
- Deterministic A4 portrait preview backed by millimeter-domain constants.
- A 12 mm safe-margin guide and toggleable 1 mm grid.
- Zoom controls from 25% to 400%, plus fit-page and fit-width behavior.
- Stable fit-mode tracking across workspace resize and scrollbar reflow.
- Unit tests for A4 geometry, unit conversion, zoom bounds, and fitting.
- Hierarchical master, module, release, and architecture specifications.

### Known limitations

- No panels can be imported or edited yet.
- Project persistence, undo/redo, validation, and PPTX export are not implemented.
- Desktop packaging is deferred while the local web foundation is validated.
