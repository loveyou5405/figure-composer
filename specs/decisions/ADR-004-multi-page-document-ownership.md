# ADR-004: Multi-page document ownership

Status: Accepted  
Date: 2026-09-16

## Context

Figure Composer projects may contain multiple independent A4 figures. A single globally owned panel list or one vertically extended canvas would make page-local geometry, overflow, navigation, persistence, and slide export ambiguous. This boundary must be fixed before layout, undo/redo, persistence, and PPTX work build on the original single-page prototype.

## Decision

The canonical hierarchy is `FigureProject → ordered FigurePage[] → Panel[]`.

Every page has a stable `pageId`, an A4 `PageDefinition`, and its own panel collection. Every panel occurs in exactly one page and stores the matching `pageId`. Panel `xMm`, `yMm`, `widthMm`, and `heightMm` are local to that page's 210 × 297 mm coordinate space. Assets, panel types, and presets remain project-scoped references.

The preview renders one active page record at a time. Cross-page movement is an explicit domain operation that changes both collection ownership and `pageId`; it never emerges from global canvas coordinates. Explicit movement preserves group-relative geometry and derives target coordinates inside the destination safe area. Auto Layout may append pages and move overflow panels, while manual dragging never causes a surprise page jump.

PPTX export iterates the ordered pages and emits one A4 slide per page in the same order.

## Alternatives considered

- One project-level panel array with only `pageId`: rejected because it weakens page ownership and encourages global filtering everywhere.
- One vertically stacked canvas: rejected because coordinates become presentation-dependent and do not map cleanly to A4 slides.
- One project file per A4 page: rejected because shared assets, presets, navigation, overflow, and multi-slide export belong to one project workflow.

## Consequences

Page-scoped edits cannot accidentally mutate a sibling page. Page order becomes explicit project data. Persistence and export must validate unique page and panel IDs plus owner/reference agreement. The UI can stay compact because page navigation is viewport state, not a separate document-editor surface.

## Revisit when

Non-A4 formats or mixed page orientations become a product requirement. The ownership and page-local geometry rules remain even if additional page definitions are introduced.
