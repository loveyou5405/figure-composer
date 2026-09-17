# Figure Composer Master Specification

Spec version: 1.1.0  
Implementation status: Milestones 1-12 implemented as v1.0.1 source; native certification pending
Last updated: 2026-09-18

## 1. Product goal

Figure Composer is a simple, local-first application that removes repetitive sizing, alignment, spacing, labeling, and replacement work from biomedical figure assembly. PowerPoint remains the final manual-editing environment.

## 2. Stable product rules

- Editable `.pptx` is the primary final output; a complete figure must never be flattened into one raster image.
- Panels and labels remain independent PowerPoint objects whenever technically possible.
- The default page is A4 portrait: 210 × 297 mm with 12 mm safe margins.
- A project owns an ordered collection of independent A4 pages; each page owns its panels.
- Every panel belongs to exactly one stable page ID and uses page-local millimeter coordinates.
- A multi-page project is never modeled as one giant vertically extended canvas.
- Millimeters are the canonical internal geometry unit. Pixels are a viewport-only conversion.
- Original source files are never modified.
- Layout operations are deterministic and project data is human-readable where practical.
- Panel labels are panel-owned editable text with project-level typography and page-local millimeter offsets; they are never baked into source images.
- Automatic relabeling occurs only through an explicit command and preserves manual text by default.
- The default UI is calm and compact: functional sidebar, dominant central preview, contextual inspector.
- Common actions remain visible; advanced and irrelevant controls remain hidden.
- The application is local-first, requires no account, and never uploads scientific content without explicit opt-in.
- Production desktop builds bundle the frontend, require no terminal or development server, and terminate when the main window closes.
- Dirty native shutdown requires an explicit Save, Discard, or Cancel decision.
- Disposable per-session TEMP, persistent recovery, and persistent user settings are separate storage classes.
- Web, desktop, launcher, and closer version identity must remain synchronized and every release must have a rollback-oriented history record.

## 3. Architecture boundaries

The frontend owns project state, the active-page preview transform, deterministic layout, validation, source-replacement operations, and user interaction. The canonical hierarchy is `Project → ordered Pages → Panels`; project-wide assets, panel types, and presets may be referenced from any page. Source tracking is isolated behind a capability-aware boundary so browser snapshots never pretend to be live filesystem handles. Export is isolated behind a validated plan/service boundary and uses PptxGenJS 4.0.1 without changing the geometry model. Tauri is a thin outer shell for native dialogs and selected filesystem paths, not a source of domain behavior.

The module specifications under `specs/modules/` own detailed behavior. Major decisions are recorded under `specs/decisions/`.

## 4. Cross-module contracts

- Page, panel, label, and group geometry is stored in millimeters.
- Panel geometry is local to its owning page; cross-page moves explicitly change ownership and `pageId`.
- Page order is canonical export order; page navigation is viewport state and never creates a global stacked coordinate system.
- Viewport zoom changes presentation only and never mutates stored geometry.
- Canonical editor state is persisted as schema-versioned `.figproj` JSON and committed through bounded immutable history transactions.
- Auto Layout packs ordered panel geometry inside each page's safe area, preserves requested sizes by default, and creates additional stable A4 pages rather than silently shrinking scientific content.
- A replacement asset inherits the panel's layout and identity according to the replace module contract.
- Replace, Refresh, and Relink are explicit, non-destructive history transactions; detected source changes are never applied automatically.
- The exporter consumes ordered project pages rather than DOM or screen-pixel measurements; Page 1 maps to Slide 1, Page 2 to Slide 2, and so on, with every slide A4-sized.
- Validation reports stable Error/Warning/Info findings. Structural or missing-source errors block export; warnings require an explicit Export Anyway choice.
- Ordered page labeling supports continuous project sequences or per-page restart without deriving order from filenames, IDs, import order, or DOM order.

## 5. Versioning and change discipline

Behavior changes require an owning module spec update, tests, a changelog entry, and an appropriate semantic-version increment before implementation. Breaking project-schema or core-behavior changes require a major version and migration plan.

## 6. MVP boundaries

MVP includes multi-page A4 project structure, A4 preview, PNG/JPEG/SVG/TIFF import, panel types and presets, manual placement and sizing, snapping and alignment, deterministic automatic layout/pagination, labels, undo/redo, replacement, save/load, autosave recovery, validation, and editable A4 PPTX export.

AI classification, journal presets, collaboration, cloud sync, OCR, PDF editing, and submission automation are outside MVP.

## 7. Milestone 1 acceptance

- The application opens into a three-region shell.
- A white A4 portrait page is visible on a neutral workspace.
- Internal page dimensions are exactly 210 × 297 mm.
- A 12 mm safe-margin guide and 1 mm grid are visible and toggleable.
- Zoom is constrained to 25–400%.
- Fit page and fit width calculate deterministic viewport zoom.
- Automated tests verify page geometry and viewport conversion.

## 8. Current limitations

Milestones 1-12 are implemented in the `1.0.1` (`v1.0.1`) source checkpoint, including desktop shutdown protection, session TEMP ownership, stale cleanup, persistent settings, synchronized version enforcement, and versioned Windows preview controls. Remaining work is release-environment certification: build and install Windows/macOS packages, verify the final no-server double-click launch and full process termination, exercise TEMP cleanup/forced-crash recovery/OS drag-drop in packaged binaries, and open a generated three-page deck in native PowerPoint. Advanced SVG/font fidelity still depends on the receiving PowerPoint installation; TIFF continues to export its safe first-page PNG preview.
