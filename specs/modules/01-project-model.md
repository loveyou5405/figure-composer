# Project Model

Module: Project Model  
Spec version: 1.6.0
Implementation status: Milestone 10 implemented  
Last updated: 2026-09-22
Depends on: ADR-002 Coordinate System, ADR-004 Multi-page document ownership, ADR-006 Source Binding and Refresh, Clipboard Import

## 1. Responsibility

Own canonical, serializable project state and invariants shared by preview, editing, validation, persistence, and export.

## 2. User-facing behavior

A new project opens with Figure 1, Page 1 as an A4 portrait page, 12 mm margins, a 1 mm grid, snapping enabled, default panel types, and editable presets. A project may own any ordered number of Figures, each containing one or more independent A4 pages. Imported files create independently typed selectable panel objects on the active page. View-only changes such as active-page/Figure navigation or zoom do not alter project or panel geometry.

## 3. Data model

`FigureProject` owns an ordered `pages` collection. Contiguous pages sharing a stable `figureId` form one Figure. Every `FigurePage` has stable page and Figure IDs, a global display name, immutable A4 `PageDefinition`, and its own ordered `panels` collection. A `Panel` carries the matching `pageId` as an explicit reference and must occur in exactly one owning page. Its `PanelGeometry` is always page-local; there is no canonical global or vertically concatenated canvas coordinate system.

The immutable `PageDefinition` owns `widthMm`, `heightMm`, per-edge `marginsMm`, the legacy uniform `marginMm` fallback, and `gridMm`. `EditorDocument` is the history/persistence aggregate around the project plus project-scoped assets, panel type definitions, presets, and Auto Layout preferences. An `ImportedAsset` has a stable ID, filename/size/modified-time fingerprint, supported kind, intrinsic dimensions, a session-local preview URL, and an explicit missing-source state. A `Panel` also has stable IDs for itself, its asset, type, and preset; a stable `baseSizeMm`; inherited aspect-lock state; explicit manual-override intent; optional bounded `layoutScaleFactor`; and one attached `PanelLabel`. Label text, auto/manual intent, visibility, signed millimeter offsets from the panel top-left anchor, and automatic/manual offset intent are panel metadata. All authoritative geometry fields use millimeters.

## 4. Public interfaces

`A4_PORTRAIT` is the per-page format contract. `createInitialProject` creates Figure 1/Page 1; `appendPageToFigure` adds a page after the last page of one Figure; `appendNewFigure` creates a new Figure and first page; `deleteProjectPage`, `duplicateProjectPage`, and `reorderProjectPage` own remaining page lifecycle/order. `getProjectFigures` derives ordered Figure groups. `movePanelsToPage` transfers one active-page selection while preserving identity and relative geometry. `getProjectOwnershipErrors` validates structural and contiguous-Figure invariants. PPTX export reads this immutable aggregate and never writes export-only geometry back into the model.

## 5. State transitions

Import registers one asset and one panel per accepted file on the active page. Selection is active-page viewport state. Replace, Refresh, and Relink keep their existing non-destructive identity rules. Add Page inserts a stable empty A4 page after the last page of the active Figure. New Figure appends a new Figure with one empty page. Duplicate stays in its source Figure. Delete keeps at least one project page; deleting the last page of a Figure removes that derived Figure group. Reorder is limited to pages inside one Figure. Auto Layout preserves Figure boundaries and may add overflow pages to the owning Figure. Zoom, active page, selection, guides, and source-check results remain viewport state only.

## 6. Edge cases

Reject non-finite intrinsic dimensions and non-positive sizes. Stable project, page, and object IDs use a cryptographically random UUID when available with a collision-safe session fallback. A project must contain at least one page; page IDs and panel IDs must be unique; a panel's `pageId` must match its containing page. Interactive bounds are kept within that A4 page.

## 7. Error handling

Invalid stored data must produce a clear load error and must not partially replace the active project.

## 8. Persistence requirements

The `.figproj` format is a ZIP-compatible portable container using container version `1.0.0`. It contains a human-readable `project.json` document using schema `0.1.0` plus exact original source bytes under `assets/`. Each serialized page contains its `figureId` and panel array, and every panel includes `pageId` plus page-local millimeter geometry. Asset fingerprints, source hints, and available clipboard diagnostics are serialized, while browser object URLs, selection, active page, zoom, guides, and history are session-only. Embedded files are stored without lossy image conversion and verified by byte size plus SHA-256 before the loaded document replaces active state. Legacy JSON `.figproj` files remain readable but require available source files before they can be saved as complete portable projects. Clipboard diagnostics preserve advertised and selected formats, canonical/preview separation, quality class, conversion state, and only dimensions actually reported or decoded; selected canonical clipboard bytes are embedded rather than generated previews.

## 9. Testing requirements

Test default page constants, stable project/page IDs, page ownership, page lifecycle/reorder, cross-page movement, replacement with same/different aspect ratio, width/center preservation, preset reapplication, type/label/override preservation, shared-asset refresh, exact-layout relinking, missing/change detection, undoable replacement, deterministic pagination, schema validation, serialization, recovery, and atomic history.

## 10. Acceptance criteria

- Canonical A4 dimensions are exactly 210 × 297 mm.
- A project owns an ordered collection of independently identified A4 pages.
- Each panel occurs in exactly one page and its `pageId` matches that owner.
- Panel geometry is page-local and never expressed on one giant multi-page canvas.
- Default margin and grid values are 12 mm and 1 mm.
- Viewport zoom cannot mutate the page definition.
- Every accepted file creates an independently identified panel.
- Panel position and size remain canonical millimeter values.
- Interactive resize preserves the imported aspect ratio.
- Preset application always derives from `baseSizeMm`, never current size.
- Manual override intent is explicit and protected during batch preset updates.
- Layout operations cannot mutate sibling-page panels or global preset definitions.
- Stored layout values are normalized to 0.001 mm precision.

## 11. Known limitations

Cross-page dragging is not implemented; users move selections through explicit target/previous/next page commands. Target-page collision avoidance is not automatic. Standard browser file inputs provide immutable snapshots rather than refreshable filesystem handles, so automatic change checks report unavailable and explicit file reselection is required. Folder relinking and persistent native paths are deferred to desktop packaging.

## 12. Changelog

- 0.1.0: Added the Milestone 1 page-domain foundation.
- 0.2.0: Added asset and panel entities plus deterministic millimeter move, placement, and aspect-locked resize rules.
- 0.3.0: Added stable base size, type/preset references, inherited ratio lock, and explicit manual override state.
- 0.4.0: Added ordered stable A4 pages, page-owned panel collections, explicit panel `pageId`, ownership validation, and cross-page move foundations.
- 0.5.0: Added ordered multi-selection with a deterministic anchor plus page-local batch layout operations and override-safe equal sizing.
- 0.6.0: Added project-level label settings and panel-owned label metadata with explicit text, visibility, mode, and millimeter offset intent.
- 0.6.1: Clarified signed label offsets from each panel's top-left anchor.
- 0.7.0: Added atomic project-wide Auto Layout results, stable overflow-page creation, cross-page ownership updates, and explicit bounded layout-scaling metadata.
- 0.8.0: Added the `EditorDocument` aggregate, schema `0.1.0` persistence, asset missing state, validated multi-page round-trip, recovery storage, and bounded atomic history.
- 0.9.0: Added page lifecycle/order operations, unique page duplication, safe group-preserving cross-page movement, and history-ready immutable page transactions.
- 1.0.0: Added deterministic Replace/Refresh/Relink transformations, source fingerprints, stable shared-asset refresh, exact-layout relinking, and history-ready source transactions.
- 1.1.0: Confirmed the immutable editor aggregate as the only PPTX export input and retained schema `0.1.0` with no export-only state.
- 1.2.0: Reserved canonical-source, preview, clipboard provenance, quality, and physical-size metadata for the planned portable asset model.
- 1.3.0: Persisted browser clipboard source diagnostics while keeping unavailable metadata unknown and effective DPI derived from current panel geometry.
- 1.4.0: Defined `baseSizeMm` as the PowerPoint 96 DPI scale reference and normalized legacy saved bases on load without changing panel geometry.
- 1.5.0: Added contiguous Figure ownership, Add Page/New Figure semantics, within-Figure reordering, and backward-compatible legacy Figure normalization.
- 1.6.0: Implemented single-file portable `.figproj` ownership of exact source bytes with manifest integrity verification and legacy JSON compatibility.
