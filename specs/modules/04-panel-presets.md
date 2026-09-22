# Panel Presets

Module: Panel Presets  
Spec version: 0.3.0
Implementation status: Milestone 3 implemented  
Last updated: 2026-09-20
Depends on: Project Model, Asset Import

## 1. Responsibility

Own panel types and reusable deterministic sizing rules.

## 2. User-facing behavior

Assigning a type applies its active preset from the panel's stable PowerPoint reference size and clears any manual override. The 100% reference is the source's intrinsic pixel size at 96 DPI, matching the original-size basis reported for generated PowerPoint images. Manual resize or PPT scale remains available and shows Modified status with a contextual reset action. The compact Presets sidebar lists every type and scale and opens an inline editor for name, scale, and aspect-ratio lock.

## 3. Data model

`PanelTypeDefinition` owns stable `id`, editable `name`, and `presetId`. `PanelPreset` owns stable `id`, `scalePercent`, and `lockAspectRatio`. `Panel` stores `typeId`, `presetId`, `baseSizeMm`, current display geometry, inherited `aspectRatioLocked`, and `manualScaleOverride`. Defaults are WB 50%, IF 40%, IHC 45%, Graph 60%, Flow 60%, Heatmap 60%, Microscopy 45%, Schematic 70%, and Other 100%, all ratio-locked. Custom types use the same records.

## 4. Public interfaces

Pure interfaces derive preset size, infer filename type, assign a type to one or many panel IDs, apply manual scale, mark manual resize, reset to preset, evaluate status, create a custom type/preset pair, and commit a preset edit with `future-only` or `apply-all` policy.

## 5. State transitions

Type assignment applies the selected preset from `baseSizeMm`, preserves panel center where possible, and clears override. Reapplying never compounds current scale. Manual resizing or scale marks an override; moving and zooming do not. Reset returns to exact preset-derived dimensions. Editing a preset with matching panels requires Apply to all, Future panels only, or Cancel. Apply to all updates matching non-overridden panels and leaves manual overrides protected. Future only changes the preset definition and leaves every existing panel unchanged.

## 6. Edge cases

Handle renamed defaults through stable IDs, duplicate custom names, invalid scale values, floating-point drift, deleted future custom types, panels already near page edges, and preset edits when no matching panels exist.

## 7. Error handling

Reject empty names and non-finite or non-positive scale values with contextual messages. Clamp interactive UI scale to the documented 1–400% range.

## 8. Persistence requirements

Persistence is not implemented. The future project file stores type and preset definitions, stable IDs, stable panel base size, inherited lock state, and per-panel override intent.

## 9. Testing requirements

Test WB 50%, IF 40%, non-compounding reapplication, type changes from base size, manual override/reset, zoom independence, filename inference, future-only and apply-all policies, override protection, and floating-point tolerance.

## 10. Acceptance criteria

- WB and IF derive 50% and 40% sizes from stable base dimensions.
- Type assignment is overrideable and deterministic.
- Manual scale and resize show Modified; Reset restores Following preset.
- Existing panels are never silently resized by preset edits.
- Custom type/preset records can be added without schema changes.

## 11. Known limitations

Multi-select UI, preset import/export, target-width sizing mode, per-panel lock overrides, deleting types, and duplicate-name prevention are deferred. Batch-safe pure operations are implemented for later multi-select use.

## 12. Changelog

- 0.1.0: Initial planned contract and defaults.
- 0.2.0: Implemented default/custom types, relative presets, inspector assignment and overrides, tolerant status, and explicit batch update policies.
- 0.3.0: Rebased stable panel size and all preset/manual percentages on PowerPoint's 96 DPI original-image reference.
