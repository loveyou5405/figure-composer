# Canvas Preview

Module: Canvas Preview  
Spec version: 1.0.0  
Implementation status: Milestone 10 implemented  
Last updated: 2026-09-17  
Depends on: Project Model, ADR-002 Coordinate System, ADR-004 Multi-page document ownership

## 1. Responsibility

Render canonical millimeter geometry as a deterministic, zoomable WYSIWYG workspace without making screen pixels authoritative.

## 2. User-facing behavior

The center workspace displays the active A4 portrait page on neutral gray, with a 12 mm safe-margin guide and a 1 mm grid with 5 mm major lines. Users can toggle guides, zoom from 25–400%, fit the active page, or fit its width. Only active-page panels render. Visible non-empty labels render as live text outside the panel content by default. Missing source previews render a clearly named placeholder inside unchanged panel bounds and immediately return to live preview after Relink. Replace/Refresh render the new PNG/JPEG/SVG/TIFF preview from updated canonical geometry; SVG remains an SVG object URL and is not rasterized. Zoom changes never alter source-update geometry.

## 3. Data model

Viewport state contains active page ID, zoom percentage, guide visibility, drop-target state, ordered selected panel IDs, anchor panel ID, marquee geometry, and temporary alignment guides. The adapter uses `96 / 25.4` CSS pixels per millimeter at 100% zoom. Panel CSS bounds and label offsets are always derived from page-local millimeter data and never written back as pixels.

## 4. Public interfaces

- `getViewportMetrics(page, zoom)` returns the conversion scale and page pixel bounds.
- `calculateFitZoom(page, viewport, mode, padding)` returns a downward-rounded integer bounded zoom so fitted content never exceeds the available dimension.
- `clampZoom(value)` enforces the supported range.
- `screenPixelsToMm(pixels, pixelsPerMm)` converts pointer deltas before any panel mutation.

## 5. State transitions

Zoom and fit operations update viewport scale only. Previous/Next navigation swaps the active page record in the same A4 viewport and clears selection. Add/Duplicate may activate the new page; deleting the active page activates an adjacent sibling. Empty-space drag creates a marquee. Panel dragging converts captured screen deltas to millimeters; pointer-up commits one transaction. Replace/Refresh with Preserve Width retains X and displayed width, preserves the vertical center, and recalculates height from the new intrinsic ratio in millimeters. Reapply Preset uses the current type preset. Relink changes preview availability only and leaves exact panel bounds untouched.

## 6. Edge cases

Very small or empty viewport dimensions clamp to 25%. Very large viewports clamp to 400%. Fit width may require vertical scrolling. Pointer capture keeps drag and resize coherent when the pointer briefly leaves a panel.

## 7. Error handling

Invalid layout state must never mutate page geometry. Future error boundaries should keep project state recoverable if rendering fails.

## 8. Persistence requirements

The ordered page collection and each page's local geometry persist in `.figproj`; active page, zoom, selection, and temporary guide visibility remain session-only.

## 9. Testing requirements

Verify physical constants, proportional scaling, fit calculations, zoom bounds, margin conversion, marquee intersection, group overlays, screen-to-millimeter pointer conversion, fixed-pixel snap tolerance conversion, Auto Layout geometry parity at multiple zooms, temporary snap disable, and sibling-page isolation.

## 10. Acceptance criteria

- A4 renders with a 210:297 ratio at every zoom.
- Fit page respects both workspace dimensions.
- Fit width respects available width and permits scrolling.
- Grid and safe margins remain registered to page geometry.
- Panels keep the same millimeter geometry at every zoom.
- Selection bounding box and resize handle track the selected panel.
- The canvas binds to one stable active page ID and renders only that page's panels.
- Page changes never require a global stacked-page coordinate transform.
- Multi-selection visuals and smart guides remain preview overlays and are absent from export data.
- Labels remain editable text and are never rasterized into imported panel images.
- Auto-arranged panels render from the same canonical millimeter geometry at every zoom.
- Source replacement geometry remains deterministic and independent of zoom.
- Relinking a missing source does not move or resize its panel.

## 11. Known limitations

Only one active page is rendered at a time; thumbnails and direct cross-page dragging are not implemented. No rulers, pan gesture, cropping, rotation, distance indicators, or persistent guides exist. Browser CSS pixels are a preview approximation; PPTX export independently uses canonical millimeters and never samples DOM bounds.

## 12. Changelog

- 0.1.0: Implemented A4 preview, grid, margins, zoom, fit page, and fit width.
- 0.2.0: Added vector-preserving panel rendering, drop targeting, single selection, pointer drag, and aspect-locked resize.
- 0.3.0: Bound the preview to a stable active page and page-owned panel collection without adding page-management UI.
- 0.4.0: Added marquee selection, multi-selection/anchor overlays, collective movement, zoom-normalized snapping, and temporary alignment guides.
- 0.5.0: Added panel-attached live-text labels with zoom-independent millimeter offsets and parent-panel selection behavior.
- 0.5.1: Defined lower-left label anchoring so negative defaults render complete labels outside the panel content.
- 0.6.0: Integrated deterministic millimeter Auto Layout rendering and overflow-page count feedback without making zoom authoritative.
- 0.7.0: Added missing-source placeholders and one-transaction pointer preview/commit behavior for persisted history.
- 0.8.0: Added stable active-page navigation and destination-page rendering after explicit cross-page movement.
- 0.9.0: Added vector-preserving source replacement/refresh rendering, exact-layout relinking, and deterministic changed-aspect geometry preview.
- 1.0.0: Locked preview/export parity to their shared canonical millimeter geometry while keeping DOM measurements outside the export pipeline.
