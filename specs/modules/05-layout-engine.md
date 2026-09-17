# Layout Engine

Module: Layout Engine  
Spec version: 0.5.0  
Implementation status: Milestone 6 implemented  
Last updated: 2026-09-17  
Depends on: Project Model, Canvas Preview, Panel Presets, ADR-004 Multi-page Document Ownership

## 1. Responsibility

Provide deterministic page-local movement, resizing, multi-selection layout tools, and geometry-aware automatic row packing with safe-area pagination.

## 2. User-facing behavior

Manual layout retains Milestone 4 behavior. The Layout sidebar additionally exposes Balanced, Compact, and Equal Rows modes; one millimeter gap value used for both axes; Arrange Selection, Arrange Page, and Arrange Project; Auto Pagination on by default; and optional minor scaling off by default. Auto Layout preserves the current semantic/project order and never relabels panels.

## 3. Data model

All regions, gaps, placements, and scores are calculated from page-local millimeters. The safe region is the A4 page minus its 12 mm margins: 186 × 273 mm. Candidates contain ordered rows, panel-ID-to-geometry placements, a scale factor, a stable row-partition key, total score, and score breakdown. Labels remain attached metadata and never contribute to packing bounds.

Optional minor scaling records `layoutScaleFactor` on a panel. It does not change `baseSizeMm`, `presetId`, type, label, or `manualScaleOverride`. Reset to preset clears the layout adjustment.

## 4. Public interfaces

- `getSafeLayoutRegion(page)` returns the canonical usable rectangle.
- `generateAutoLayoutCandidates(panels, region, settings)` returns deterministic score-sorted top-N candidates.
- `autoArrangeProject(project, options)` applies Selection, Page, or Project scope as one result/transaction.
- `DEFAULT_AUTO_LAYOUT_SETTINGS` defines Balanced mode, 3 mm horizontal/vertical gaps, no minor scaling, and three retained candidates.

The result includes the before/after projects, affected stable panel IDs, created stable page IDs, and candidate metadata; Milestone 7 commits the complete result as one undoable editor-document snapshot.

## 5. Row packing algorithm

Panel order is never permuted. A bounded beam search enumerates contiguous row partitions. For each next panel it tries appending to the current row and beginning a new row, rejects width/height overflow immediately, de-duplicates states by row-length partition, and keeps the best 512 partial states. This avoids a square-grid assumption while remaining responsive for the 10–40 panel target workload.

Balanced and Equal Rows center rows without changing the requested gap. Compact left-aligns rows. Vertical placement starts at the safe-region top and advances by the tallest panel in the row plus the exact vertical gap.

Pagination chooses the largest consecutive prefix that has a valid candidate, assigns it to the current page, and repeats with the remainder. Project arrangement reuses ordered existing pages before creating new A4 pages and never deletes extra user-created pages. Page arrangement creates overflow pages only when Auto Pagination is enabled. Selection arrangement first attempts its existing collective bounds, then expands from that top-left anchor to the remaining safe area; unrelated panels are not moved.

## 6. Candidate scoring

Every component is deterministic and normalized where applicable:

```text
unusedHorizontalSpace
rowWidthImbalance
rowHeightVariation
rowCountVariation
orphanRow
usedHeight
movement
scaling
```

Exact weights:

| Mode | unused | width imbalance | height variation | row-count variation | orphan | used height | movement | scaling |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Balanced | 1.2 | 2.0 | 0.4 | 0.5 | 30 | 0.2 | 0.1 | 25 |
| Compact | 0.4 | 0.5 | 0.2 | 0.2 | 12 | 2.5 | 0.05 | 25 |
| Equal Rows | 0.8 | 2.5 | 0.5 | 6.0 | 25 | 0.3 | 0.05 | 25 |

An avoidable single-panel last row receives a modest mode-specific penalty. Stable partition key breaks exact score ties. Page count is handled as a higher-priority lexicographic rule by selecting the largest valid consecutive prefix before comparing row scores; this prevents a low whitespace score from creating an unnecessary page. The unscaled search always runs first; 99%, 98%, 97%, 96%, and 95% are considered only when no 100% candidate fits and the user explicitly enabled minor scaling. Thus scaling is never selected merely to improve aesthetics.

## 7. State transitions

Arrange Selection changes only selected panel geometries and preserves ownership. Arrange Page changes active-page panels and may move overflow panels to newly created pages. Arrange Project gathers panels in page-array/panel-array order, repacks them into existing ordered pages, then appends pages only when required. Cross-page moves update `pageId` and page-local geometry while preserving panel identity, type, preset, label, and manual-override state.

## 8. Edge cases and errors

Invalid gaps/regions are rejected. A panel larger than the safe area, even at an explicitly allowed 95% adjustment, causes an atomic no-change result. Disabling Auto Pagination produces a clear fit error rather than silent shrinkage. Empty scopes and selection scopes below two panels are no-ops with user-facing messages.

## 9. Persistence requirements

Committed geometry, page ownership, layout adjustment metadata, and project-level layout settings are serialized in `.figproj`. Candidates, scores, selection, and transaction previews remain transient.

## 10. Testing requirements

Cover equal and mixed aspect ratios, mixed scientific types, exact gaps, safe-area compliance, deterministic top-N output, no overlap, order preservation, all three modes, selection/page/project isolation, two- and three-page overflow, existing-page reuse, stable IDs, preset/manual override/label preservation, zoom independence, orphan scoring, default no-scaling, and the 95–100% scaling bound.

## 11. Acceptance criteria

- Same panels and settings always produce the same millimeter geometry.
- Default layout never changes panel dimensions or presets.
- No candidate overlaps or exceeds its layout region.
- Auto Pagination creates stable A4 pages rather than aggressively shrinking panels.
- Existing pages are reused and never automatically deleted or reordered.
- Auto Layout is represented as one atomic transaction foundation.

## 12. Known limitations

Selection packing does not yet treat unrelated panels as obstacles. Top-N candidates are retained by the domain engine but Try Another Layout UI is deferred. Minor scaling is uniform per page candidate and only scales downward. Explicit page navigation and cross-page movement are implemented; direct cross-page drag and target collision avoidance remain deferred.

## 13. Changelog

- 0.1.0: Initial planned contract.
- 0.2.0: Scoped layout operations to page-local coordinates and defined explicit Auto Overflow.
- 0.3.0: Implemented active-page multi-selection and manual layout tools.
- 0.4.0: Preserved labels and excluded label bounds from layout calculations.
- 0.5.0: Added deterministic geometry-aware row packing, three layout modes, score breakdowns, top-N candidates, safe-area pagination, existing-page reuse, bounded optional scaling, and atomic transaction metadata.
