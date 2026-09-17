# Validation

Module: Validation  
Spec version: 1.0.0  
Implementation status: Milestone 11 implemented  
Last updated: 2026-09-17  
Depends on: Project Model, Panel Presets, Panel Labels

## 1. Responsibility

Produce deterministic structural and quality findings without unexpectedly modifying the figure.

## 2. User-facing behavior

Review reports concise warnings for page overflow, safe-margin intrusion, overlap, label problems, scale inconsistency, missing sources, impractical size, and low effective DPI.

## 3. Data model

Each finding has a stable code, severity, affected entity IDs, human explanation, and optional deterministic remediation command.

## 4. Public interfaces

`reviewDocument` accepts an immutable editor snapshot plus optional source-check results and returns stable, severity-sorted findings. `summarizeReview` derives Error/Warning/Info counts. Checks cover structural ownership, page and safe-margin bounds, near-edge placement, panel overlap, label collision/outside/duplicate/missing/manual states, preset deviation, manual scale overrides, same-type scale inconsistency, missing or changed sources, TIFF fallback, and effective raster DPI. Raster thresholds are 300 DPI OK, 200–299 warning, and below 200 strong warning.

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

Outside-page, safe-margin, inconsistent-scale, and low-resolution checks work and never silently alter geometry.

## 11. Known limitations

The Review panel does not perform destructive bulk repair, infer scientific correctness, or estimate DPI for SVG. Collision findings are geometric and do not inspect transparent image pixels.

## 12. Changelog

- 0.1.0: Initial planned contract.
- 0.2.0: Added the shared tolerant preset-consistency predicate contract.
- 0.3.0: Added multi-page structural ownership validation foundations.
- 0.4.0: Documented normalized batch layout geometry and equal-size override validation behavior.
- 0.5.0: Added warning hooks for duplicate/missing visible labels, outside-page label geometry, and manual overrides.
- 1.0.0: Added deterministic unified findings, DPI/source/collision checks, severity summaries, compact focusable Review UI, safe one-click fixes, and export review gating.
