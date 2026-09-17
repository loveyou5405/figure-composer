# ADR-003: Isolated editable PPTX export service

Status: Accepted  
Date: 2026-09-16

## Context

PowerPoint is the primary output, and every panel and label must remain independently editable. The exporter is not part of Milestone 1, but its boundary constrains the project and geometry architecture now.

## Decision

Define export as an isolated service that accepts the canonical editor document, creates a validated intermediate plan, iterates its ordered pages, converts page-local millimeters at the boundary, and creates one A4 portrait slide per page with separate named objects. Page 1 maps to Slide 1, Page 2 to Slide 2, and so on.

PptxGenJS 4.0.1 is the accepted browser-side implementation. It is dynamically imported only when exporting. The boundary uses direct `mm / 25.4` conversion, preserves SVG data when supported, emits raster sources without application-level recompression, and represents labels as editable text boxes. A bounded JSZip post-pass removes PptxGenJS content-type declarations that reference nonexistent package parts. Golden OOXML tests verify A4 dimensions, exact geometry, object separation, names, Unicode labels, SVG media retention, and referential package integrity.

## Alternatives considered

- Python `python-pptx`: mature for raster images and text, but a second runtime complicates packaging and SVG handling needs verification.
- Direct OOXML generation: maximum control, but excessive implementation and maintenance risk.
- Rasterized full-slide export: rejected because it violates the primary product rule.

## Consequences

No preview DOM measurement may leak into export. The intermediary plan keeps validation and geometry testable without creating a file, while the generator remains replaceable. PptxGenJS adds a runtime dependency and some export-time download size, mitigated through dynamic loading.

## Revisit when

PowerPoint compatibility, SVG fidelity, or packaging requirements materially exceed the verified PptxGenJS boundary.
