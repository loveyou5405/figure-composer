# Figure Composer

Figure Composer is a local-first scientific figure assembly application. It provides a deterministic A4 workspace for arranging biomedical manuscript and thesis panels, with editable PowerPoint as the primary output.

Figure Composer `v1.3` includes all implemented Milestones 1-12, explicit multi-page Figure groups, single-file portable projects with exact embedded source images, deterministic Review findings, a thin Tauri 2 desktop shell, and Ctrl/Cmd+V paste for image representations exposed by the browser/WebView. Full native EMF/WMF clipboard fidelity remains on the roadmap.

The canonical project architecture is multi-page: an ordered project contains independent A4 pages, and every panel belongs to exactly one page with page-local millimeter geometry. Compact navigation and page management operate without introducing a stacked document canvas.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- Rust 1.77.2 or newer plus the platform Tauri prerequisites (desktop builds only)

## Run locally

On Windows, double-click `Figure Composer Launcher v1.3.cmd` to start the managed local preview and open it in the default browser. Double-click `Close Figure Composer v1.3.cmd` to stop only the preview process owned by that launcher. The command window is minimized and closes after the action finishes. These controls require Node.js and are an interim convenience until the native Tauri executable is built; they are not the final no-server desktop package.

After any version change, update npm, Cargo, Tauri, the changelog/release record, then run:

```bash
npm run launcher:generate
npm run version:check
```

The generated launcher and closer filenames, their embedded semantic version, the web label, and the desktop title must all agree before a production build can pass.

Project compatibility rule: every newer release must continue importing existing `.figproj` files. Project schema changes require an explicit migration and regression test; old files must not become unreadable merely because the application was updated. The Figure name is editable from the top bar. `Save` overwrites the currently selected file when the platform provides a writable file handle; when a new download is required, the filename is generated as `YYYYMMDD_Custom Name.figproj`.

For terminal-based development:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

For the desktop shell after installing the Tauri prerequisites:

```bash
npm run desktop:dev
npm run desktop:build
```

## Verify

```bash
npm test
npm run build
npm run version:check
```

## Current capabilities

- Three-region application shell
- Canonical 210 × 297 mm A4 portrait page
- 12 mm safe-margin guide
- 1 mm grid with 5 mm major lines
- Zoom from 25% to 400%
- Fit-page and fit-width controls
- Multi-file PNG, JPEG, SVG, and TIFF import through the picker or canvas drop
- Ctrl/Cmd+V paste for browser-exposed SVG, TIFF, PNG, and JPEG clipboard representations as one active-page panel
- Clipboard source-quality/effective-DPI metadata, Other-by-default typing, physical-size preservation when reliable, and deterministic 3 mm safe-region placement
- Independent selectable panels with millimeter geometry
- Local, non-destructive TIFF first-page decoding into a session-only PNG preview
- Drag-to-position with 1 mm snapping
- Aspect-preserving resize and selected-panel deletion
- Built-in WB, IF, IHC, Graph, Flow, Heatmap, Microscopy, Schematic, and Other panel types
- Reusable percentage-based sizing presets with inline editing and custom preset creation
- Deterministic filename-based type inference for common scientific-panel suffixes
- Manual scale overrides, resize override tracking, and reset-to-preset controls
- Explicit Apply to all, Future panels only, or Cancel handling when an edited preset has existing panels
- Multi-page-ready project ownership with stable A4 page IDs and page-local panel geometry
- Shift-click, marquee, and active-page Select All with a deterministic last-selected anchor
- Collective drag and keyboard nudging with group boundary clamping
- Page/panel smart snapping, temporary alignment guides, and Alt/Option snap disable
- Anchor/page alignment, equal-gap distribution, explicit spacing, and aspect-safe equal width/height
- Deterministic Auto Layout with Balanced, Compact, and Equal Rows modes
- Exact 3 mm default gaps, A4 safe-area packing, and automatic multi-page overflow
- Preset-preserving Selection, Page, and Project arrangement with optional bounded minor scaling
- Explicit Auto Label Page and Auto Label Selection with 5 mm row grouping
- Live panel-attached text labels that follow movement and resizing without silent relabeling
- Manual label preservation or explicit replace-all behavior
- Hidden-label exclusion and editable millimeter label offsets, with a publication-style -2 mm / -2 mm outside-panel default
- Project-level Arial Bold 10 pt defaults with continuous or restart-per-page sequence architecture
- Label validation hooks for duplicate, missing, outside-page, and manual states
- Single-file portable `.figproj` projects containing `project.json` and exact original image bytes
- Lossless embedded PNG/JPEG/SVG/TIFF storage with byte-size and SHA-256 verification on reopen
- Explicit Import Figure plus Save, Save As, Undo, and Redo controls with standard keyboard shortcuts
- Backward-compatible opening of legacy human-readable JSON `.figproj` files using schema version `0.1.0`
- Exact multi-page millimeter geometry, labels, presets, types, and Auto Layout preference restoration
- Missing-source placeholders that preserve panel geometry and metadata
- Debounced local crash recovery with explicit Restore / Discard
- One-entry drag, resize, and Auto Layout history transactions with a 200-operation limit
- Compact `Page n / total` navigation with Add Page
- Explicit New Figure creation, Figure-local page status, and first-page Figure quick jump
- Page deletion, duplication, and ordering without a document-management sidebar
- Explicit single- and multi-panel movement to any page or adjacent page
- Safe-area-aware cross-page group placement that preserves size, identity, labels, presets, overrides, and relative geometry
- Panel-specific Replace Source with preserve-width/center or Reapply Preset sizing
- Shared-asset Refresh Source and explicit batch Refresh Changed
- Missing-source Relink that preserves exact geometry and scientific metadata
- Capability-aware source fingerprints and Check Sources summaries without silent replacement
- Vector-preserving SVG replacement and Undo/Redo for all source lifecycle operations
- Editable `.pptx` export with every Figure in one deck and one ordered A4 slide per project page
- Compact All Figures / Current page export scope dialog
- Independent named panel pictures and editable label text boxes
- Direct millimeter-to-PowerPoint geometry with missing-source preflight
- Deterministic Review findings for bounds, overlap, labels, presets, DPI, and sources
- Focusable Review items with explicit safe fixes and warning-aware export
- Tauri 2 Windows/macOS source architecture with native file dialogs
- Persistent desktop source paths with non-destructive best-effort rehydration
- New/Import Figure/Save/Undo/Redo/Select All/Duplicate/Delete/nudge shortcuts
- Three-step onboarding and a bundled three-page mixed-panel vector demo
- Save / Discard / Cancel protection when closing an unsaved desktop project
- Per-launch isolated temporary workspace with active-instance locking and stale-session cleanup
- Persistent preferences, reusable presets, label profiles, and recent settings outside disposable TEMP
- Synchronized `v1.3` web/desktop/launcher identity with build-enforced version history
- Versioned Windows preview launcher and ownership-scoped closer with no broad process termination
- Collapsed clipboard source diagnostics with available formats, canonical/preview distinction, quality class, pixel dimensions, and live effective DPI

## Roadmap

- High-fidelity Ctrl/Cmd+V import from PowerPoint through separate web and native clipboard providers
- Fidelity-ranked SVG/EMF/WMF/TIFF/PNG/DIB/JPEG canonical source selection
- PowerPoint physical-size preservation, deterministic 3 mm cascade placement, quality metadata, and effective-DPI Review
- Canonical native clipboard export without substituting lower-quality previews

See `specs/modules/13-clipboard-import.md` for the complete contract. Web clipboard paste and portable storage of its selected canonical file are implemented; native EMF/WMF enumeration and canonical native-source export are not implemented in this checkpoint.

See `specs/releases/v1.3.0.md`, `VERSION_HISTORY.md`, and `CHANGELOG.md` for the current release and rollback record.
