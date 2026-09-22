# Validation

Module: Validation  
Spec version: 1.3.0
Implementation status: Milestone 11 and web clipboard quality review implemented; native clipboard formats deferred
Last updated: 2026-09-22
Depends on: Project Model, Panel Presets, Panel Labels, Clipboard Import

## 1. Responsibility

Produce deterministic structural and quality findings without unexpectedly modifying the figure.

## 2. User-facing behavior

Review reports concise warnings for page overflow, safe-margin intrusion, overlap, label problems, scale inconsistency, missing sources, impractical size, and low effective DPI.

## 3. Data model

Each finding has a stable code, severity, affected entity IDs, human explanation, and optional deterministic remediation command.

## 4. Public interfaces

`reviewDocument` accepts an immutable editor snapshot plus optional source-check results and returns stable, severity-sorted findings. `summarizeReview` derives Error/Warning/Info counts. Checks cover structural Figure/page ownership and Figure contiguity, page and safe-margin bounds, near-edge placement, panel overlap, label collision/outside/duplicate/missing/manual states, preset deviation, manual scale overrides, same-type scale inconsistency, missing or changed sources, TIFF fallback, and effective raster DPI. Raster thresholds are 300 DPI OK, 200–299 warning, and below 200 strong warning.

## 5. State transitions

Validation reruns after relevant committed edits and source checks. Applying Move inside margin, Reset to preset, Relabel page, or Refresh source creates a normal undoable project command. Review never applies fixes automatically.

## 6. Edge cases

Handle boundary equality per page, intentional or distribution-created overlap, explicit negative equal gaps, SVG without raster DPI, missing metadata, manual overrides created by equal-size operations, sub-tolerance floating-point drift, duplicated manual labels, and the same panel ID appearing on multiple pages.

## 7. Error handling

Unknown metadata yields an informational finding rather than fabricated precision. Structural invalidity and missing source content block export; warnings remain exportable through an explicit Export Anyway action.

## 8. Persistence requirements

Findings are derived and not persisted; explicit user decisions such as keeping an override are persisted where needed.

## 9. Testing requirements

Test every warning threshold and boundary, including exactly-one-page ownership, owner/reference agreement, 0.001 mm normalization, equal-size override intent, preset dimension tolerance, 300/200 DPI cutoffs, per-page and margin edges, duplicate labels, missing visible labels, outside-page label bounds, and manual overrides.

## 10. Acceptance criteria

Outside-page, image/label safe-margin, label-collision, inconsistent-scale, and low-resolution checks work and never silently alter geometry.

## 11. Clipboard quality review

The selected-panel inspector classifies clipboard sources as Vector, lossless/lossy format plus effective DPI, or Bitmap fallback. Review emits explicit bitmap-fallback and lossy-source findings. Effective DPI remains a calculation from pixel dimensions and displayed millimeters, never an inference from the TIFF/PNG/JPEG extension. Vector sources omit raster DPI, while unknown metadata yields informational uncertainty rather than fabricated precision.

## 12. Known limitations

The Review panel does not perform destructive bulk repair, infer scientific correctness, or estimate DPI for SVG. Collision findings are geometric and do not inspect transparent image pixels.

## 13. Changelog

- 0.1.0: Initial planned contract.
- 0.2.0: Added the shared tolerant preset-consistency predicate contract.
- 0.3.0: Added multi-page structural ownership validation foundations.
- 0.4.0: Documented normalized batch layout geometry and equal-size override validation behavior.
- 0.5.0: Added warning hooks for duplicate/missing visible labels, outside-page label geometry, and manual overrides.
- 1.0.0: Added deterministic unified findings, DPI/source/collision checks, severity summaries, compact focusable Review UI, safe one-click fixes, and export review gating.
- 1.1.0: Added the planned clipboard quality taxonomy and format-independent effective-DPI rules.
- 1.2.0: Implemented clipboard quality metadata display plus bitmap-fallback warning and lossy-raster information findings.
- 1.3.0: Added required page Figure ownership and contiguous Figure-group structural validation.
