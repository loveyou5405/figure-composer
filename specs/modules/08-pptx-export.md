# PPTX Export

Module: PPTX Export  
Spec version: 1.1.0  
Implementation status: Milestones 10-12 implemented  
Last updated: 2026-09-17  
Depends on: Project Model, Panel Labels, ADR-003 PPTX Export Strategy, ADR-004 Multi-page Document Ownership

## 1. Responsibility

Generate an editable PowerPoint presentation from an immutable editor snapshot. Every ordered `FigurePage` becomes one A4 portrait slide; panels remain independent image objects and visible labels remain independent editable text objects.

## 2. User-facing behavior

`Export PPTX` opens one compact dialog with `All pages` and `Current page only`, plus the Review summary. Browser builds download a `.pptx`; desktop builds use a native Save dialog. The operation does not mutate project state or create an Undo entry. Page 1 maps to Slide 1, Page 2 to Slide 2, and so on.

## 3. Export model

`buildPptxExportPlan` validates the canonical `EditorDocument`, selects ordered pages, and produces explicit slide, image, and label plans. Panel geometry is copied directly from page-local millimeters. Label geometry is derived from its owning panel and signed millimeter offset using the same top-left/baseline contract as preview. Screen pixels and DOM measurements are forbidden.

The physical conversion is `inches = millimeters / 25.4`; OOXML geometry therefore uses exactly 36,000 EMU per millimeter. Every slide is 7,560,000 × 10,692,000 EMU (210 × 297 mm).

## 4. Implementation boundary

`exportPptx` dynamically loads PptxGenJS 4.0.1, defines one custom A4 portrait layout, and serializes the plan. Each panel becomes a named picture object (`Panel_<label-or-index>_<type>`). Each visible non-empty label becomes a named text box (`Label_<text>`) using project font, size, bold, and color settings. Duplicate names receive deterministic numeric suffixes. A bounded JSZip integrity pass removes only content-type declarations whose package parts do not exist; this works around PptxGenJS 4.0.1's extra multi-slide `slideMasterN.xml` declarations without changing slide content.

PNG and JPEG previews are passed through without an additional application-level recompression step. SVG data remains SVG in the PPTX media package where supported by PptxGenJS and PowerPoint. TIFF uses the existing safe first-page PNG preview because PowerPoint does not provide a dependable editable TIFF image pipeline.

## 5. Preflight and errors

Structural validation and missing source assets block export with actionable errors. An unknown current page also blocks. Panels extending beyond the page produce warnings but are not silently moved, resized, clipped, or omitted. Partial files are never reported as successful.

## 6. Persistence and editability

Export produces a separate local `.pptx` and never modifies `.figproj` state or original sources. The slide is never flattened: each panel is a separate `<p:pic>` and each label is a separate text shape.

## 7. Testing requirements

- Golden conversion tests cover exact A4 dimensions and page-local panel geometry.
- Plan tests cover ordered all-page export, active-page-only export, independent object names/counts, Unicode label text, missing-source blocking, and overflow warnings.
- Package tests inspect OOXML for slide size, object type, object names, exact EMU bounds, editable text, slide count, retained SVG media, and the absence of content-type references to missing parts.
- Browser verification exercises the dialog and downloaded file.
- A generated verification deck must pass package/layout validation and render every slide without corruption.

## 8. Acceptance criteria

- Every selected project page produces exactly one ordered A4 slide.
- Panel position and size match canonical millimeter geometry independent of preview zoom.
- Panels and labels remain independent editable objects.
- SVG remains vector when technically practical; slides are never flattened.
- Missing sources block with a clear relink instruction.
- Export UI adds no permanent toolbar beyond the existing top-bar action.

## 9. Known limitations

PowerPoint may render fonts or advanced SVG features differently across installed versions. TIFF export uses its decoded first-page PNG preview. The current exporter has no progress percentage, crop, rotation, grouping, or per-object export options. Native PowerPoint rendering still requires an installed compatible PowerPoint application and remains a release-environment check.

## 10. Changelog

- 0.1.0: Recorded the planned isolated export contract.
- 0.2.0: Defined ordered one-page-to-one-slide export for multi-page projects.
- 1.0.0: Implemented editable A4 PPTX export, direct millimeter conversion, independent picture/text objects, all/current page scope, SVG retention, preflight, and OOXML golden tests.
- 1.1.0: Integrated Review gating and native desktop Save dialog routing.
