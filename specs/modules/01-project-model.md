# Project Model

Module: Project Model  
Spec version: 1.1.0  
Implementation status: Milestone 10 implemented  
Last updated: 2026-09-17  
Depends on: ADR-002 Coordinate System, ADR-004 Multi-page document ownership, ADR-006 Source Binding and Refresh

## 1. Responsibility

Own canonical, serializable project state and invariants shared by preview, editing, validation, persistence, and export.

## 2. User-facing behavior

A new project opens with Page 1 as an A4 portrait page, 12 mm margins, a 1 mm grid, snapping enabled, default panel types, and editable presets. A project may own any ordered number of independent A4 pages. Imported files create independently typed selectable panel objects on the active page. View-only changes such as active-page navigation or zoom do not alter project or panel geometry.

## 3. Data model

`FigureProject` owns an ordered `pages` collection. Every `FigurePage` has a stable ID, display name, immutable A4 `PageDefinition`, and its own ordered `panels` collection. A `Panel` carries the matching `pageId` as an explicit reference and must occur in exactly one owning page. Its `PanelGeometry` is always page-local; there is no canonical global or vertically concatenated canvas coordinate system.

The immutable `PageDefinition` owns `widthMm`, `heightMm`, `marginMm`, and `gridMm`. `EditorDocument` is the history/persistence aggregate around the project plus project-scoped assets, panel type definitions, presets, and Auto Layout preferences. An `ImportedAsset` has a stable ID, filename/size/modified-time fingerprint, supported kind, intrinsic dimensions, a session-local preview URL, and an explicit missing-source state. A `Panel` also has stable IDs for itself, its asset, type, and preset; a stable `baseSizeMm`; inherited aspect-lock state; explicit manual-override intent; optional bounded `layoutScaleFactor`; and one attached `PanelLabel`. Label text, auto/manual intent, visibility, signed millimeter offsets from the panel top-left anchor, and automatic/manual offset intent are panel metadata. All authoritative geometry fields use millimeters.

## 4. Public interfaces

`A4_PORTRAIT` is the per-page format contract. `createInitialProject` creates Page 1; `appendA4Page`, `deleteProjectPage`, `duplicateProjectPage`, and `reorderProjectPage` own page lifecycle/order. `movePanelsToPage` transfers one active-page selection while preserving identity and relative geometry. `replacePanelSource` changes one selected panel to a new independently identified asset; `refreshAssetSource` updates every panel referencing one logical asset while preserving that asset ID; `relinkAssetSource` restores a missing logical asset without changing panel geometry. `geometryPreservingWidthAndCenter` provides the deterministic default for changed aspect ratios. `getProjectOwnershipErrors` validates structural invariants. PPTX export reads this immutable aggregate and never writes export-only geometry back into the model.

## 5. State transitions

Import registers one asset and one panel per accepted file on the active page. Selection is active-page viewport state. Replace keeps panel ID/page/type/preset/label/order and either preserves displayed width and center while recalculating height or explicitly reapplies the current preset. Refresh keeps the logical asset ID and applies the same sizing rule to every reference. Relink keeps exact panel geometry and metadata. Add appends a stable empty A4 page. Duplicate inserts a copy immediately after its source with a new stable page ID and new panel IDs while reusing immutable asset references. Delete keeps at least one page and removes unreferenced asset records only after confirmation for populated pages. Reorder changes the page array and normalized display names without changing page IDs or panel ownership. Auto Layout preserves current page order and may append pages. Zoom, active page, selection, guides, and source-check results remain viewport state only.

## 6. Edge cases

Reject non-finite intrinsic dimensions and non-positive sizes. Stable project, page, and object IDs use a cryptographically random UUID when available with a collision-safe session fallback. A project must contain at least one page; page IDs and panel IDs must be unique; a panel's `pageId` must match its containing page. Interactive bounds are kept within that A4 page.

## 7. Error handling

Invalid stored data must produce a clear load error and must not partially replace the active project.

## 8. Persistence requirements

The `.figproj` format is human-readable JSON using schema `0.1.0` with an ordered `pages` array. Each serialized page contains its own panel array, and every panel includes `pageId` plus page-local millimeter geometry. Asset fingerprints and source hints are serialized, while browser object URLs, source bytes, `File` objects, selection, active page, zoom, guides, and history are session-only. Loading validates the complete document before replacing active state. Missing source previews preserve the asset record and every referencing panel.

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
