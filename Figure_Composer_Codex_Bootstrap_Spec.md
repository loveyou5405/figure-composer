# Figure Composer — Codex Bootstrap Specification

**Document type:** Project bootstrap / master specification  
**Product name:** Figure Composer  
**Current specification version:** `0.1.0`  
**Target product version:** `MVP 0.1.0`  
**Primary platform:** macOS + Windows  
**Primary use case:** Biomedical manuscript / thesis figure assembly  
**Primary output:** Editable PowerPoint (`.pptx`)  
**Default canvas:** A4 portrait, 210 × 297 mm  
**Status:** Ready for Codex implementation

---

# 1. Purpose

Figure Composer is a lightweight local application for assembling scientific manuscript figures without repeatedly performing manual resizing, alignment, spacing, panel labeling, and replacement in PowerPoint.

The application is **not intended to replace PowerPoint, GraphPad Prism, ImageJ, Illustrator, BioRender, or R**. It should instead automate the repetitive assembly stage and export a clean, editable PowerPoint file for final manual adjustment.

The core workflow is:

```text
Import panels
    ↓
Classify panel type
    ↓
Apply type preset
    ↓
Arrange on A4 canvas
    ↓
Auto-align / snap / label
    ↓
Preview exactly as output
    ↓
Export editable PPTX
    ↓
Final adjustment in PowerPoint
```

The application should remain intentionally simple. Advanced functions must not make the default interface visually complicated.

---

# 2. Product Principles

These rules have higher priority than individual feature requests.

## 2.1 PowerPoint-first

The editable `.pptx` file is the primary output.

Each panel should remain an independent PowerPoint object whenever technically possible.

Do **not** flatten the full figure into one raster image.

Preferred PPTX structure:

```text
Slide
├── Label "A"
├── Image / SVG panel A
├── Label "B"
├── Image / SVG panel B
├── Label "C"
├── Image / SVG panel C
└── ...
```

The user must be able to open the generated PPTX and:

- move a panel;
- resize a panel;
- delete a panel;
- replace a panel;
- edit A/B/C labels;
- add text or arrows;
- group / ungroup objects;
- copy objects to another figure.

---

## 2.2 A4-first

The default working canvas is:

```text
A4 Portrait
210 mm × 297 mm
```

Default safe margins:

```text
Top:    12 mm
Bottom: 12 mm
Left:   12 mm
Right:  12 mm
```

Future versions may add A4 landscape and journal-specific presets, but A4 portrait is the MVP default.

---

## 2.3 Type-based sizing

The most important feature is **consistent sizing of panels of the same scientific type**.

Examples:

```text
Western blot (WB)    → 50%
Immunofluorescence   → 40%
IHC                  → 45%
Graph / Prism        → 60%
```

These values are user-editable presets.

A panel assigned as `WB` should immediately adopt the active WB preset.

A newly imported WB panel should use the same WB sizing rule as existing WB panels unless the user explicitly overrides it.

---

## 2.4 Simple by default, powerful when selected

Do not expose every property at all times.

The UI should follow this model:

- common operations visible;
- advanced operations hidden under an `Advanced` disclosure;
- contextual controls appear only when relevant;
- the center preview should remain visually dominant.

---

## 2.5 Non-destructive editing

Never modify original source files.

All crop, scale, placement, label, grouping, and layout information should be stored in the project file.

Replacing an image must preserve layout unless the user asks otherwise.

---

## 2.6 Deterministic layout

Automatic alignment and sizing must be reproducible.

The same project file should render the same result after reopening.

Avoid layout behavior that changes unpredictably between sessions.

---

# 3. Specification Architecture

The project MUST use a hierarchical specification system.

The master specification defines:

- product architecture;
- version;
- shared rules;
- cross-module contracts;
- global acceptance criteria.

Detailed behavior MUST live in module-specific specifications.

Codex must not continuously append all implementation details to one giant file.

Recommended structure:

```text
figure-composer/
│
├── README.md
├── CHANGELOG.md
├── package.json / pyproject.toml
│
├── specs/
│   ├── MASTER_SPEC.md
│   ├── VERSION.md
│   │
│   ├── modules/
│   │   ├── 01-project-model.md
│   │   ├── 02-canvas-preview.md
│   │   ├── 03-asset-import.md
│   │   ├── 04-panel-presets.md
│   │   ├── 05-layout-engine.md
│   │   ├── 06-panel-labels.md
│   │   ├── 07-ui-shell.md
│   │   ├── 08-pptx-export.md
│   │   ├── 09-project-save-load.md
│   │   ├── 10-validation.md
│   │   └── 11-smart-features.md
│   │
│   ├── decisions/
│   │   ├── ADR-001-tech-stack.md
│   │   ├── ADR-002-coordinate-system.md
│   │   └── ADR-003-pptx-export-strategy.md
│   │
│   └── releases/
│       ├── v0.1.0.md
│       └── v0.2.0.md
│
├── src/
├── tests/
└── examples/
```

---

# 4. Specification Rules for Codex

Codex must follow these rules while developing the application.

## 4.1 Master spec is the source of truth

`specs/MASTER_SPEC.md` contains only stable product-level decisions.

Do not fill it with implementation minutiae.

If a module becomes detailed enough to require more than roughly 1–2 screens of explanation, move that detail into its module specification.

---

## 4.2 Every module has its own version

Each module specification should begin with:

```text
Module:
Spec version:
Implementation status:
Last updated:
Depends on:
```

Example:

```text
Module: Panel Presets
Spec version: 0.1.2
Implementation status: Implemented
Last updated: 2026-09-16
Depends on: Project Model, Canvas Preview
```

---

## 4.3 Semantic versioning

Use:

```text
MAJOR.MINOR.PATCH
```

Interpretation:

```text
PATCH
Bug fix or behavior clarification.

MINOR
Backward-compatible feature addition.

MAJOR
Project format or core behavior change that may break compatibility.
```

---

## 4.4 Change discipline

When Codex changes behavior:

1. identify the owning module;
2. update that module specification;
3. update tests;
4. update `CHANGELOG.md`;
5. increase the appropriate version;
6. only then modify implementation.

Do not silently alter behavior.

---

## 4.5 Architecture Decision Records

Any major technical decision should be recorded as an ADR.

Examples:

- switching PPTX library;
- changing coordinate systems;
- changing project file format;
- introducing a backend service;
- changing SVG handling;
- changing the desktop wrapper.

ADR format:

```text
Context
Decision
Alternatives considered
Consequences
Status
```

---

# 5. Recommended Technical Architecture

Codex may change the exact stack if a strong reason is documented in an ADR.

Preferred MVP architecture:

```text
Desktop shell
    Tauri
        │
        ↓
Frontend
    React + TypeScript + Vite
        │
        ├── Canvas / preview engine
        ├── Project state
        ├── Preset manager
        └── Layout engine
        │
        ↓
Export service
    TypeScript or Python helper
        │
        └── Editable PPTX generation
```

Preferred principles:

- local-first;
- no account required;
- no cloud upload;
- fast startup;
- project files human-readable where practical;
- cross-platform;
- no unnecessary database.

If Tauri introduces excessive complexity during MVP, a local web application is acceptable as the first implementation, provided the code architecture remains compatible with later desktop packaging.

---

# 6. Coordinate System

Internally, layout should use **millimeters** as the canonical measurement system.

Do not use raw screen pixels as the authoritative stored geometry.

Example panel geometry:

```json
{
  "x_mm": 18.0,
  "y_mm": 34.0,
  "width_mm": 52.0,
  "height_mm": 27.4
}
```

The preview layer converts millimeters to screen pixels according to zoom.

The PPTX exporter converts millimeters to PowerPoint units.

This makes the preview and output deterministic.

---

# 7. MVP Scope — Version 0.1.0

The MVP should solve the most repetitive figure-assembly tasks.

Required features:

1. A4 portrait canvas.
2. Drag-and-drop image import.
3. PNG, JPG/JPEG, SVG support.
4. Panel type assignment.
5. Panel-type scaling presets.
6. Manual scale override.
7. Preserve aspect ratio by default.
8. Drag-to-position.
9. Snap-to-grid.
10. Smart alignment guides.
11. Multi-select.
12. Align left/right/top/bottom/center.
13. Equal horizontal / vertical spacing.
14. Auto panel labels A/B/C/D...
15. Manual label override.
16. Undo / redo.
17. Replace image while preserving position and size.
18. Save project.
19. Load project.
20. WYSIWYG preview.
21. Export editable A4 PPTX.
22. Basic layout validation.
23. Autosave / crash recovery.

Not required for MVP:

- AI image recognition;
- journal presets;
- automatic OCR;
- PDF editing;
- microscopy scale-bar generation;
- CMYK conversion;
- journal submission automation;
- collaboration;
- cloud synchronization.

---

# 8. Panel Type System

Default panel types:

```text
WB
IF
IHC
Graph
Flow
Heatmap
Microscopy
Schematic
Other
```

The user can create custom types.

Each type owns a preset.

Example initial defaults:

| Type | Default scale | Lock aspect ratio |
|---|---:|---|
| WB | 50% | Yes |
| IF | 40% | Yes |
| IHC | 45% | Yes |
| Graph | 60% | Yes |
| Flow | 60% | Yes |
| Heatmap | 60% | Yes |
| Microscopy | 45% | Yes |
| Schematic | 70% | Yes |
| Other | 100% | Yes |

These values are placeholders and must be editable.

---

# 9. Preset Model

Each panel type can contain:

```text
Name
Scale
Target width (optional)
Target height (optional)
Aspect-ratio lock
Default crop behavior
Default internal padding
Default label offset
Default z-order behavior
```

The UI should expose only:

```text
Type
Scale
Lock ratio
```

by default.

Everything else belongs under `Advanced`.

---

## 9.1 Two sizing modes

The system should support both:

### Relative scale mode

Example:

```text
WB → 50% of imported dimensions
IF → 40%
```

This directly matches the user's current workflow.

### Target-size mode

Example:

```text
WB → target width 42 mm
IF → target width 36 mm
```

Target-size mode is useful when imported files have inconsistent original dimensions.

MVP may show relative scale as the default UI and provide target width under Advanced settings.

---

# 10. Smart Filename Classification

The app should infer panel type from filename when possible.

Examples:

```text
Fig3A_WB.png
Fig3B_IF.tif
Fig3C_IHC.jpg
Fig3D_Prism.svg
```

Mapping:

```text
_WB       → WB
_IF       → IF
_IHC      → IHC
_Prism    → Graph
_Graph    → Graph
_Flow     → Flow
_Heatmap  → Heatmap
```

The user can always override the inferred type.

Never use opaque AI classification when deterministic filename rules are sufficient.

---

# 11. Main UI

The interface should use a three-region layout.

```text
┌──────────────────────────────────────────────────────────────┐
│ New  Open  Save    Undo Redo        A4 Portrait    Export   │
├───────────────┬───────────────────────────────┬──────────────┤
│               │                               │              │
│ LEFT PANEL    │         A4 PREVIEW            │ INSPECTOR    │
│               │                               │              │
│ Assets        │                               │ Selected: A  │
│ Presets       │                               │ Type: WB     │
│ Layout        │                               │ Scale: 50%   │
│               │                               │ X / Y        │
│               │                               │ W / H        │
│               │                               │ Label        │
│               │                               │              │
├───────────────┴───────────────────────────────┴──────────────┤
│ Zoom 82%      Grid 1 mm       0 warnings                   │
└──────────────────────────────────────────────────────────────┘
```

---

# 12. Left Sidebar

The left sidebar should contain three clearly separated tabs.

## 12.1 Assets

Shows imported files.

Example:

```text
ASSETS

A_WB.png       [WB]
B_IF.png       [IF]
C_Graph.svg    [Graph]

+ Import
```

Functions:

- import;
- drag asset onto canvas;
- replace asset;
- reveal source;
- remove unused asset.

---

## 12.2 Presets

Example:

```text
PRESETS

WB        50%
IF        40%
IHC       45%
Graph     60%

+ New preset
```

Clicking a preset opens a small editor.

Editing a preset should ask:

```text
Apply change to existing WB panels?
[Apply to all] [Future panels only]
```

---

## 12.3 Layout

Keep this compact.

Example:

```text
ALIGN
[Left] [Center] [Right]
[Top]  [Middle] [Bottom]

DISTRIBUTE
[Horizontal] [Vertical]

SIZE
[Equal Width]
[Equal Height]

AUTO
[Auto Arrange]
```

Advanced layout settings should not occupy the main screen.

---

# 13. Right Inspector

The right panel is contextual.

Nothing selected:

```text
PAGE
A4 Portrait
Margins
Grid
Label style
```

One panel selected:

```text
PANEL

Type        WB
Scale       50%
X           18 mm
Y           42 mm
Width       46 mm
Height      Auto
Lock ratio  ✓

Label       A
Label auto  ✓

[Replace image]

Advanced ▸
```

Multiple panels selected:

```text
MULTIPLE PANELS

4 selected

Align
Distribute
Equal width
Equal height
Apply preset
Group
```

Do not show irrelevant controls.

---

# 14. Preview Mode

The central A4 canvas is a WYSIWYG preview.

Required behavior:

- white A4 page;
- gray application background;
- visible safe-margin guides;
- optional grid;
- optional rulers;
- zoom 25–400%;
- fit page;
- fit width;
- smooth pan;
- selection boxes;
- smart alignment guides;
- live label rendering.

The preview should visually match exported PPTX placement as closely as possible.

---

# 15. Grid and Snapping

Default grid:

```text
1 mm
```

Optional values:

```text
0.5 mm
1 mm
2 mm
5 mm
```

Snapping candidates:

- page margins;
- page center;
- neighboring panel edges;
- neighboring panel centers;
- grid;
- label anchor points.

Holding a modifier key should temporarily disable snapping.

---

# 16. Smart Alignment Guides

When moving a panel, show temporary guide lines when it approaches:

- another panel's left edge;
- right edge;
- top edge;
- bottom edge;
- horizontal center;
- vertical center.

Display the distance between nearby panels when practical.

Example:

```text
A        B
|<-- 3.0 mm -->|
```

This should feel similar to modern slide/design software.

---

# 17. Panel Labels

Default label style:

```text
A, B, C, D...
Arial
Bold
10 pt
Black
```

Default label position:

```text
top-left relative to panel bounding box
```

Default offset should be stored globally and user-adjustable.

Auto-label behavior:

1. determine reading order;
2. assign labels from top-left to bottom-right;
3. allow manual override;
4. never silently overwrite a manual label.

The user should be able to run:

```text
Relabel panels
```

after rearranging the figure.

---

# 18. Reading Order

Auto-label reading order should primarily use:

1. vertical position;
2. row grouping tolerance;
3. horizontal position.

Panels whose top edges fall within the row tolerance should be considered the same row.

The exact algorithm belongs in `06-panel-labels.md`.

---

# 19. Replace Image

This is a core feature.

When the user selects a panel and chooses:

```text
Replace image
```

the new source must inherit:

- x;
- y;
- panel type;
- preset;
- label;
- width or scale according to replacement policy;
- z-order;
- group membership where feasible.

Default replacement behavior:

```text
Preserve displayed width
Preserve panel center
Preserve aspect ratio
```

The user should not need to realign the entire figure after replacing a revised graph or blot.

---

# 20. Source Tracking

Each panel stores its source file path.

Example:

```json
{
  "id": "panel-003",
  "source": "/Users/.../Fig3C_WB_v4.png",
  "type": "WB",
  "preset": "WB",
  "label": "C"
}
```

Future smart behavior:

If the original source file changes on disk:

```text
Source updated:
Fig3C_WB_v4.png

[Refresh]
```

Do not automatically replace without user action in MVP.

---

# 21. Auto Arrange

Auto Arrange should be conservative.

It should not behave like an opaque AI design generator.

MVP behavior:

- arrange selected panels into rows;
- respect current panel sizes;
- preserve aspect ratios;
- apply consistent gaps;
- stay inside safe margins.

Suggested controls:

```text
Columns: Auto / 1 / 2 / 3 / 4
Gap: 3 mm
[Auto Arrange]
```

Future versions may score several candidate layouts.

---

# 22. Panel Groups

A group is a logical collection of panels.

Examples:

```text
WB + quantification
IF images + quantification
IHC + H-score
UMAP + violin plot
```

MVP should support simple grouping / ungrouping.

Group templates may be added in v0.2+.

---

# 23. Smart Validation

The application should have a lightweight `Review` function.

Checks:

- object outside A4 canvas;
- object inside forbidden margin;
- accidental overlap;
- labels outside page;
- inconsistent scaling within the same preset type;
- panel too small to be practical;
- missing labels;
- duplicated labels;
- missing source file;
- raster image likely too low-resolution.

Results should appear as:

```text
2 warnings

⚠ Panel F extends 1.8 mm beyond safe margin.
⚠ WB panel C uses 47% while WB preset is 50%.
```

Warnings should not block export unless the project is structurally invalid.

---

# 24. Scale Consistency Intelligence

This is a high-priority smart feature.

If most WB panels use the WB preset but one is manually altered:

```text
WB preset: 50%
Panel A:   50%
Panel C:   50%
Panel F:   44%
```

the app should show:

```text
Panel F differs from WB preset.

[Reset to 50%]
[Keep override]
```

Do not automatically change manual overrides.

---

# 25. Undo / Redo

Undo and redo must cover at least:

- move;
- resize;
- type change;
- preset application;
- label change;
- alignment;
- distribution;
- grouping;
- import;
- delete;
- replace;
- auto-arrange.

The user should feel safe experimenting.

---

# 26. Autosave and Recovery

The project should autosave local recovery state after meaningful edits.

If the application crashes:

```text
A recovered project is available.

[Restore]
[Discard]
```

Do not require manual saving after every small layout change.

---

# 27. Project File

Use a human-readable format, preferably JSON.

Suggested extension:

```text
.figproj
```

Internally it may be JSON.

Example:

```json
{
  "schemaVersion": "0.1.0",
  "page": {
    "size": "A4",
    "orientation": "portrait",
    "width_mm": 210,
    "height_mm": 297,
    "margins_mm": 12
  },
  "presets": {},
  "panels": [],
  "groups": [],
  "settings": {}
}
```

Project format migration must be supported if the schema version changes later.

---

# 28. PPTX Export

The PPTX exporter is a critical module and should have strong automated testing.

Output requirements:

```text
Page size: A4 portrait
210 × 297 mm
```

Each panel:

- separate PowerPoint object;
- correct x/y coordinates;
- correct size;
- preserve aspect ratio;
- retain highest practical image quality;
- SVG should remain vector when technically feasible;
- labels should be editable text boxes.

Do not flatten the slide.

---

# 29. PPTX Object Naming

PowerPoint objects should receive meaningful internal names where technically feasible.

Example:

```text
Panel_A_WB
Label_A
Panel_B_IF
Label_B
```

This makes manual editing easier.

---

# 30. Export Modes

MVP:

```text
Export PPTX
```

Optional secondary output:

```text
Export preview PNG
```

Later:

```text
PDF
TIFF 300 dpi
TIFF 600 dpi
SVG
```

PPTX remains the master editable output.

---

# 31. Import Formats

MVP priority:

```text
1. PNG
2. JPG / JPEG
3. SVG
```

Later:

```text
TIFF
PDF
EPS
```

If TIFF support is straightforward, it may be included early, but it must not delay the core MVP.

---

# 32. Raster Quality Check

For raster panels, estimate effective DPI at displayed size.

Example:

```text
Source:
1800 px wide

Displayed width:
60 mm = 2.36 inches

Effective DPI:
~763 dpi
```

Warnings:

```text
≥ 300 dpi   OK
200–299     Warning
< 200       Strong warning
```

This is a convenience check, not a publishing guarantee.

---

# 33. Minimal Keyboard Shortcuts

Use familiar conventions.

```text
Cmd/Ctrl + Z          Undo
Cmd/Ctrl + Shift + Z  Redo
Cmd/Ctrl + S          Save
Cmd/Ctrl + O          Open
Delete                Remove selected panel
Cmd/Ctrl + D          Duplicate
Cmd/Ctrl + G          Group
Shift + Cmd/Ctrl + G  Ungroup
Arrow                 Move 1 mm
Shift + Arrow         Move 5 mm
```

Exact increments may become configurable.

---

# 34. Visual Style

The app should look calm and utilitarian.

Avoid:

- dashboard-like visual clutter;
- large decorative cards;
- excessive icons;
- gradients;
- unnecessary animations;
- multiple modal dialogs.

Preferred:

- neutral gray application background;
- white canvas;
- compact controls;
- clear typography;
- subtle separators;
- consistent spacing;
- one accent color only.

The scientific figure should remain the visual focus.

---

# 35. Smart Features Roadmap

These features are valuable but should not overcomplicate MVP.

## v0.2

```text
Panel templates
WB + quantification template
IF + graph template
A4 landscape
Preset import/export
TIFF support
Source-file refresh
Batch type assignment
```

## v0.3

```text
Journal page / figure presets
Auto layout candidate generator
Project-wide style checker
Better SVG preservation
PDF import
```

## v0.4+

```text
Natural-language command bar
Optional AI panel classification
Automatic figure consistency suggestions
Cross-figure manuscript style profile
```

---

# 36. Natural-Language Command Bar — Future

This should be optional and hidden by default.

Examples:

```text
Make all WB panels 10% smaller.
Align A, B and C to the top.
Set all IF panels to 40%.
Make D and E equal width.
Use 2 mm gaps in the second row.
Relabel panels by reading order.
```

The command layer should translate text into the same deterministic operations available through the normal UI.

It must never create a separate parallel layout system.

---

# 37. Manuscript Style Profile — Future

A user may create:

```text
My Paper Style
```

containing:

```text
WB scale
IF scale
Graph scale
A/B/C font
Default gap
Margins
Preferred graph width
Preferred microscopy width
```

A second project can reuse the same profile.

This is preferable to reconfiguring every figure independently.

---

# 38. Recommended MVP Workflow

The first usable flow should feel like:

```text
1. Open Figure Composer

2. A4 page appears immediately

3. Drag files onto page

4. App detects:
   Fig3A_WB.png    → WB → 50%
   Fig3B_IF.png    → IF → 40%
   Fig3C_Graph.svg → Graph → 60%

5. User drags panels approximately into place

6. Smart guides snap panels into alignment

7. Select three panels → Distribute horizontally

8. Click "Auto Label"

9. Preview looks like final A4 slide

10. Click "Review"

11. Fix warnings if needed

12. Export PPTX

13. Open PowerPoint and perform final manuscript-specific tweaks
```

If this workflow is not fast, the product has failed.

---

# 39. MVP Acceptance Criteria

Version `0.1.0` is complete only when all criteria below are met.

## Canvas

- A4 portrait dimensions are correct.
- Preview scales correctly at different zoom values.
- Coordinates remain stable after save / reopen.

## Import

- PNG works.
- JPG works.
- SVG works or has a documented safe fallback.
- Multiple files can be imported at once.

## Presets

- WB can be set to 50%.
- IF can be set to 40%.
- Changing type applies the correct preset.
- Manual override remains possible.
- Existing preset differences can be detected.

## Layout

- Drag works.
- Snap works.
- Multi-select works.
- Align works.
- Distribute works.
- Equal width / height works.

## Labels

- Auto A/B/C works.
- Labels remain editable.
- Manual label is preserved.
- Re-labeling is possible.

## Replace

- Replacing a panel preserves its layout.
- New image does not require rebuilding the page.

## Persistence

- Save works.
- Load works.
- Autosave recovery works.

## Export

- PPTX is A4.
- Every panel is independently editable.
- Every A/B/C label is independently editable.
- Object positions visually match preview.
- Exported PPTX opens without repair warnings in PowerPoint.

## Validation

- outside-page warning works;
- safe-margin warning works;
- inconsistent preset scale warning works;
- low-resolution warning works.

---

# 40. Testing Strategy

Minimum automated tests:

```text
Unit tests
├── coordinate conversion
├── scale calculation
├── preset application
├── row detection
├── label ordering
├── alignment
├── distribution
├── project serialization
└── DPI calculation

Integration tests
├── import → layout → save → reopen
├── replace asset
├── auto label
└── PPTX export

Golden tests
└── compare known project geometry with exported object geometry
```

The PPTX exporter should be tested with known coordinates rather than only visually inspected.

---

# 41. Performance Requirements

Typical project:

```text
10–40 panels
```

The UI should remain responsive.

Desired behavior:

- dragging should feel immediate;
- zoom should be smooth;
- preset application should be near-instant;
- save should normally complete without noticeable blocking;
- exporting PPTX may take longer, but must show progress if not immediate.

Avoid premature optimization for hundreds of panels.

---

# 42. Data Safety

The application is local-first.

Requirements:

- never upload figures automatically;
- never require account login;
- never send image content to external APIs without explicit opt-in;
- project file references should remain local;
- original scientific data should remain untouched.

---

# 43. Codex Working Instructions

When implementing this project, Codex should work in small vertical slices.

Recommended sequence:

```text
Milestone 1
Project skeleton + A4 preview

Milestone 2
Image import + drag + resize

Milestone 3
Panel types + WB/IF presets

Milestone 4
Snap + alignment + distribution

Milestone 5
A/B/C labels

Milestone 6
Save / load

Milestone 7
Replace image

Milestone 8
Editable PPTX export

Milestone 9
Validation

Milestone 10
Polish + installer
```

After each milestone:

1. update the owning specification;
2. run tests;
3. update CHANGELOG;
4. provide a short implementation summary;
5. identify known limitations;
6. do not proceed by silently changing earlier behavior.

---

# 44. Codex UI Rule

Before adding a new visible UI element, ask internally:

```text
Can this feature be:
1. contextual,
2. placed under Advanced,
3. merged into an existing control,
or
4. triggered by selection?
```

If yes, do that.

Do not solve feature growth by continuously adding buttons to the main screen.

---

# 45. Codex Feature Rule

Any new feature must belong to one of these categories:

```text
Assets
Presets
Layout
Labels
Page
Export
Review
```

If it does not clearly belong somewhere, reconsider the feature or document a new category in the master spec.

This prevents the interface from becoming unstructured.

---

# 46. First Launch Defaults

On first launch:

```text
Page:
A4 Portrait

Margins:
12 mm

Grid:
1 mm

Snap:
On

Labels:
Arial Bold 10 pt

Presets:
WB      50%
IF      40%
IHC     45%
Graph   60%
Flow    60%
Heatmap 60%
Other   100%
```

The user should be able to start arranging a figure immediately without setup.

---

# 47. Suggested First-Run Demo

Bundle a small example project with dummy scientific panels.

Example:

```text
A_WB.png
B_Graph.svg
C_IF.png
D_IF.png
```

The demo should illustrate:

- type presets;
- alignment;
- auto labels;
- editable PPTX export.

Do not bundle real unpublished scientific data.

---

# 48. Definition of "Smart"

For this project, "smart" means:

- remembers repeated rules;
- applies deterministic defaults;
- detects inconsistencies;
- preserves user intent;
- minimizes repetitive actions;
- explains warnings;
- does not unexpectedly redesign the figure.

"Smart" does **not** mean:

- unpredictable automatic styling;
- hidden AI decisions;
- changing panel order without permission;
- modifying source data;
- replacing user-defined geometry silently.

---

# 49. Final Product Goal

The intended experience is:

> The user should spend time deciding the scientific story and panel order, not manually making ten Western blots exactly the same size or repeatedly aligning A/B/C labels.

The program handles mechanical consistency.

PowerPoint remains available for final human judgment.

---

# 50. Kickoff Prompt for Codex

Copy the following prompt into Codex together with this specification.

---

## Codex Prompt

You are implementing a local scientific figure assembly application called **Figure Composer**.

Read the entire bootstrap specification before writing code.

Your first task is **not** to implement the whole application.

First:

1. create the repository structure defined in this specification;
2. create `specs/MASTER_SPEC.md`;
3. create all module spec files under `specs/modules/`;
4. create the initial ADR files;
5. create `CHANGELOG.md`;
6. create the v0.1.0 release plan;
7. propose the exact technical stack;
8. document any necessary deviations from the recommended architecture;
9. then implement only **Milestone 1: project skeleton + A4 preview**.

The product must remain simple and local-first.

Important product rules:

- default page is A4 portrait, 210 × 297 mm;
- use millimeters as the canonical internal layout unit;
- editable PPTX is the primary final output;
- panels must remain separate editable PowerPoint objects;
- do not flatten the whole figure;
- WB, IF, IHC, Graph and other panel types must support reusable sizing presets;
- WB 50% and IF 40% are initial example defaults;
- UI should use three regions: left functional sidebar, center A4 preview, right contextual inspector;
- advanced settings should stay hidden unless needed;
- every behavior change must update its owning specification;
- all architecture decisions must be documented;
- implementation must be testable and deterministic.

Do not add unrelated features.

At the end of Milestone 1, provide:

- files created;
- architecture summary;
- how to run the application;
- tests added;
- known limitations;
- exact next milestone.

---

# 51. Recommended Child-Spec Template

Every module spec should use this format:

```markdown
# <Module Name>

Spec version:
Implementation status:
Last updated:
Depends on:

## 1. Responsibility

## 2. User-facing behavior

## 3. Data model

## 4. Public interfaces

## 5. State transitions

## 6. Edge cases

## 7. Error handling

## 8. Persistence requirements

## 9. Testing requirements

## 10. Acceptance criteria

## 11. Known limitations

## 12. Changelog
```

---

# 52. Recommended Release Spec Template

Each release file should contain:

```markdown
# Release vX.Y.Z

## Goal

## Included modules

## User-visible changes

## Schema changes

## Migration requirements

## Test requirements

## Known limitations

## Completion checklist
```

---

# 53. Recommended ADR Template

```markdown
# ADR-XXX: <Decision>

Status:
Date:

## Context

## Decision

## Alternatives considered

## Consequences

## Revisit when
```

---

# 54. Immediate Next Step

Codex should begin with the architecture/spec skeleton and A4 preview only.

Do not start by implementing export, AI, journal presets, or complex auto-layout.

The first checkpoint should demonstrate:

```text
Application opens
    ↓
A4 page is visible
    ↓
Zoom / fit page works
    ↓
Grid and margins are visible
    ↓
Internal dimensions are truly 210 × 297 mm
```

Once this foundation is stable, panel import and type-based scaling can be added safely.
