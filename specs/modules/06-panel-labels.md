# Panel Labels

Module: Panel Labels  
Spec version: 0.2.2  
Implementation status: Milestone 5 implemented  
Last updated: 2026-09-16  
Depends on: Project Model, Layout Engine, Canvas Preview

## 1. Responsibility

Own deterministic alphabetic sequences, geometry-based reading order, explicit relabeling, editable panel-attached labels, project typography, millimeter positioning, multi-page sequence policy, and label validation hooks.

## 2. User-facing behavior

`Auto Label Page` assigns A/B/C from top to bottom and left to right. `Auto Label Selection` applies the same logic only to the selected subset. Labels remain attached during every panel layout operation and never change merely because the panel moves or resizes. Editing text marks it manual. Hidden labels retain their text but do not render or participate in automatic major-panel sequencing.

## 3. Data model

Every panel owns a `PanelLabel` with `text`, `mode` (`auto` or `manual`), `visible`, `offsetXmm`, `offsetYmm`, and `offsetMode` (`automatic` or `manual`). Labels are metadata, not canvas objects. `ProjectLabelSettings` owns font family, point size, bold state, color, default offsets, row tolerance, and `continuous` or `restart-per-page` sequencing. The font selector offers Arial and Times New Roman. Defaults are Arial Bold 10 pt black, offsets -2 mm X / -2 mm Y, 5 mm row tolerance, and continuous project sequencing.

The panel's top-left corner is the reference anchor. The label's lower-left anchor is `panel.xMm + offsetXmm`, `panel.yMm + offsetYmm`; text extends upward from that point. Negative defaults therefore place the complete label above and slightly left of the image content. Preview and future export derive position from this page-local geometry. Labels remain text and are never baked into source images.

## 4. Public interfaces

- `alphabeticLabel(index)` generates A…Z, AA, AB, and beyond.
- `getPanelReadingOrder(panels, toleranceMm)` excludes hidden labels, groups top coordinates into rows using an inclusive tolerance, orders rows by top Y, then orders each row by X.
- `autoLabelPanels` labels a page or explicit panel-ID subset and accepts preserve/replace manual policy.
- `autoLabelOrderedPages` supports continuous and restart-per-page project sequencing over ordered pages.
- Label update helpers distinguish manual text from automatic generation and manual offsets from project-managed offsets.
- `getPanelLabelBoundsMm` and `getLabelValidationWarnings` expose deterministic geometry and warning hooks.

## 5. State transitions

Import creates a visible, empty automatic label at project-default offsets. Auto Label is always explicit. If no manual labels are in scope it runs immediately. If manual labels exist, the UI defaults to Preserve manual labels and also offers Replace all labels.

The deterministic preserve policy is positional: every visible eligible panel consumes its geometry-order alphabetic slot. An automatic panel receives that slot's generated text. A manual panel keeps its text while still consuming the slot. Therefore a manual `C1` in position three produces `A, B, C1, D`. Replace converts every eligible label back to auto. Editing text marks it manual. Hiding a label excludes it and consumes no slot.

Changing project defaults does not silently move labels. The UI offers `Apply to automatic labels`, which commits the new project default and reapplies it only to labels whose `offsetMode` remains automatic, or `Future automatic labels only`, which changes the project default without moving existing labels. Manually positioned labels are protected in both cases.

## 6. Reading-order determinism

Candidates sort by top Y, then X, width, and height. A row is anchored to its first/topmost member; another candidate joins when its top Y is within the inclusive tolerance. Rows sort top-to-bottom and their members left-to-right. IDs, filenames, asset names, DOM order, and import order are not ordering keys. Exactly congruent panels have indistinguishable geometry; their relative sequence is intentionally unspecified until one is moved.

## 7. Edge cases

The alphabetic sequence has no Z limit. Manual text accepts Unicode scientific notation up to 24 characters. Empty visible labels are allowed but reported by validation. Hidden labels preserve underlying mode and text. Selection relabeling starts at A and does not affect unselected panels. Automatic offsets may place labels beyond a page edge and are warned rather than silently moved.

## 8. Error handling

Negative or non-integer sequence indices and negative/non-finite row tolerances are rejected. Duplicate, missing, outside-page, and manual-override states are warning metadata and never destructive auto-fixes or export blockers by themselves.

## 9. Persistence requirements

Future project persistence stores the complete project-level label settings and every panel's label metadata. Preview CSS pixels, measured DOM bounds, and rasterized label images are never serialized.

## 10. Testing requirements

Test A/Z/AA transitions, row clustering and tolerance boundaries, input-order independence, active-page and selected-subset scope, hidden exclusion, manual creation/preservation/replacement, layout attachment, zoom independence, both multi-page sequence modes, default/manual offsets, duplicate detection, and outside-page bounds.

## 11. Acceptance criteria

Explicit auto labeling is deterministic; manual labels survive by default; hidden labels are excluded; movement never relabels; panel layout ignores labels; typography is project-level; and canonical placement remains millimeter-based at every zoom.

## 12. Known limitations

Order preview, direct label dragging, collision solving, per-label typography overrides, label-to-label collision warnings, full Review UI, and full page navigation are deferred. Only Latin alphabetic automatic sequences are provided.

## 13. Changelog

- 0.1.0: Initial planned contract.
- 0.2.0: Implemented panel-attached labels, deterministic ordering/sequences, manual preservation, visibility, project styles, multi-page policies, and validation hooks.
- 0.2.1: Changed the default offset to -2 mm / -2 mm, defined outside-panel lower-left anchoring, and added explicit existing/future automatic-offset application choices.
- 0.2.2: Replaced free-text font entry with Arial and Times New Roman project-level choices.
