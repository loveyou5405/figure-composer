# High-Fidelity Clipboard Import

Module: Clipboard Import
Spec version: 0.4.0
Implementation status: Web clipboard provider and portable embedding implemented for browser-exposed SVG/TIFF/PNG/JPEG; native provider deferred
Last updated: 2026-09-22
Depends on: Project Model, Asset Import, Project Save and Load, PPTX Export, Validation, Desktop Packaging

## 1. Responsibility and product rule

Import a PowerPoint image, graph, grouped selection, or other visual object through Ctrl/Cmd+V as one Figure Composer panel without requiring a temporary user-exported image file.

The governing rule is: preserve the best source already available, convert only when technically necessary, and never convert merely because another extension sounds more publication-friendly. Original vector remains vector; original TIFF, PNG, or JPEG bytes remain in their original representation. PNG-to-TIFF conversion is not a quality improvement, and vector clipboard content must not be rasterized except to create a disposable preview when a renderer requires one.

## 2. Fidelity selection

The Windows native provider enumerates every available representation and selects the highest-fidelity supported candidate. The initial priority is:

```text
SVG or equivalent vector
→ EMF
→ WMF
→ TIFF, when genuinely present
→ PNG
→ DIB / bitmap
→ JPEG fallback
```

The order describes information fidelity, not extension prestige. SVG/EMF is preferred to TIFF for text-, line-, symbol-, and curve-heavy scientific graphs. TIFF is a first-class canonical raster format for microscopy, WB, IF, IHC, gels, and tissue images when TIFF is the actual source. DIB conversion, when required, is lossless and targets PNG or TIFF rather than JPEG.

## 3. Provider boundary

Clipboard support is isolated behind a `ClipboardImportService` with two providers:

```text
ClipboardImportService
├─ WebClipboardProvider
└─ NativeClipboardProvider
```

`WebClipboardProvider` is the React/Vite development fallback and may use only representations exposed by the browser, such as SVG, PNG, and JPEG. It must disclose that browser mode cannot guarantee full PowerPoint fidelity.

`NativeClipboardProvider` is the final Tauri desktop implementation. On Windows it enumerates Office/Windows formats including SVG, EMF, WMF, TIFF, PNG, DIB, and JPEG, then returns the best supported canonical candidate. Browser Clipboard API limitations must not constrain the native design. Unsupported or unreadable candidates fall through deterministically without silently choosing a lossy representation when a supported higher-fidelity candidate exists.

## 4. Canonical source and preview separation

Every clipboard asset distinguishes its canonical source from its preview representation. For example, an EMF canonical asset may use a session-generated PNG or SVG preview, but the preview never replaces the EMF bytes in persistence, metadata, validation, history, or export.

Clipboard assets record at least:

```text
sourceKind: clipboard
sourceApplication: PowerPoint | Unknown
canonicalFormat: SVG | EMF | WMF | TIFF | PNG | DIB | JPEG | ...
isVector: boolean
isLosslessRaster: boolean
qualityClass: vector | lossless-raster | lossy-raster | bitmap-fallback
physicalSizeSource: clipboard | estimated | default
```

Where pixel dimensions are known, Review calculates effective DPI independently from format. TIFF is not automatically high resolution, and PNG is not automatically low resolution.

## 5. Physical size and placement

Reliable clipboard physical dimensions are preserved in millimeters. A 52 × 38 mm PowerPoint object therefore enters as a 52 × 38 mm panel. When dimensions are absent or unreliable, the existing import-size policy is used and `physicalSizeSource` records `estimated` or `default`.

Paste targets the active page, creates exactly one panel for a grouped or multi-selected PowerPoint payload in the first implementation, and never initially places content outside that page's safe region. Repeated paste uses a deterministic +3 mm X / +3 mm Y cascade. When the next cascade would exceed the safe region, placement resets to a sensible visible origin inside it. Placement and size are canonical millimeter values and independent of viewport zoom.

Clipboard type defaults to `Other / Unclassified`; clipboard format alone never determines scientific type. Existing deterministic filename/source-metadata inference may run only when reliable metadata exists. Paste preserves copied physical size by default and does not apply a WB/IF/Graph preset unless type is known or the user explicitly chooses it. A later inspector control may offer `Preserve PowerPoint size` versus `Apply panel preset`.

## 6. TIFF, raster, and vector handling

- TIFF remains canonical TIFF, preserving bit depth, lossless compression, and metadata where technically practical; preview decoding is non-destructive.
- PNG bytes are preserved and are never recompressed as JPEG.
- JPEG bytes are preserved without another lossy encode unless a documented platform boundary makes it unavoidable.
- SVG, EMF, and WMF remain canonical vector sources. Preview rendering is derivative only.
- A grouped or multi-object clipboard selection becomes one panel in v1. `Paste as Separate Objects` is deferred.

## 7. History, persistence, and export

One paste is one history transaction: Ctrl/Cmd+V creates one panel, Undo removes it, and Redo restores it. Canonical asset cleanup may occur only after project and history reference analysis proves no remaining reference.

Clipboard assets without an external path are stored in the portable `.figproj` container using the exact selected canonical `File` bytes held by their source binding. Legacy metadata-only JSON cannot claim portable clipboard persistence. Preview derivatives remain rebuildable and are never substituted for the canonical file during Save.

PPTX export resolves the canonical representation, never a lower-resolution preview when a higher-fidelity source exists. SVG/EMF should produce a vector PowerPoint object where technically reliable; TIFF/PNG/JPEG produce raster picture objects without destructive recompression. WMF/DIB conversion behavior must be explicit and tested.

## 8. Preview TEMP lifecycle

Generated EMF/WMF/TIFF/native previews live only under the owning session directory, for example:

```text
<OS TEMP>/FigureComposer/session-<id>/clipboard-preview/
```

Normal shutdown deletes preview derivatives. Startup stale-session cleanup removes abandoned preview directories only through the existing ownership/lock rules. Canonical clipboard assets belong to the project asset store and must never be deleted as TEMP.

## 9. Review and user feedback

The selected-panel inspector owns a compact collapsed `SOURCE QUALITY` disclosure. It reports clipboard/application provenance, formats actually advertised by the clipboard, selected and canonical format, vector/lossless/lossy/bitmap-fallback class, raster pixel dimensions, reliable physical dimensions when supplied, current displayed size, live effective DPI, preview format, and whether preview conversion occurred. Unknown values remain unknown rather than inferred. Review classifies Vector, High-resolution raster, Low-resolution raster, Lossy raster, and Clipboard bitmap fallback, and warns on low effective DPI. It must not imply TIFF quality without measuring resolution.

## 10. Security and integrity

Clipboard import is local-only, never uploads content, and never modifies PowerPoint or any original source. It must not downgrade representation without technical necessity. Malformed, oversized, or inconsistent clipboard payloads fail without mutating the document; partial native enumeration must not fabricate quality or source metadata.

## 11. Automated tests

Shared tests cover PNG, JPEG, and SVG paste; format-priority selection; vector over TIFF; TIFF over PNG when both are raster sources; physical-size preservation and fallback; deterministic 3 mm cascade/reset; active-page ownership; safe-region placement; zoom independence; canonical/preview separation; PNG/JPEG byte preservation; effective DPI; one-entry Undo/Redo; and save/load persistence.

Windows/Tauri tests additionally cover EMF, WMF, TIFF when PowerPoint exposes it, full format enumeration, highest-fidelity selection, session preview cleanup, and canonical-byte survival. Export tests verify that canonical data, not preview data, is consumed.

## 12. Manual Windows verification

Before desktop release, paste and inspect: a vector Prism/R graph copied through PowerPoint; a high-resolution TIFF microscopy image; a high-resolution PNG; and a forced bitmap-only fallback. Verify quality metadata, deep zoom, physical size, effective DPI, and exported PPTX fidelity. PNG must not become JPEG; bitmap fallback must be labeled honestly.

## 13. Acceptance criteria

- Ctrl/Cmd+V creates one active-page panel as one undoable transaction.
- The best supported clipboard representation becomes canonical and its bytes are not destructively recompressed.
- Reliable PowerPoint physical size is preserved; fallback sizing is explicit.
- Initial placement stays inside the active page's safe region and repeated paste cascades by 3 mm deterministically.
- Canonical and preview representations are distinct through persistence, Review, and export.
- Browser mode clearly reports its fidelity limitation; native Windows verification covers Office formats.
- Clipboard content stays local and survives project reopen in the portable project format.

## 14. Known limitations and phasing

The web provider, one-panel paste transaction, Other-by-default typing, reliable HTML physical-size parsing, 3 mm safe-region cascade, compact quality indicator, and portable embedding of the browser-selected canonical file are implemented. Browser clipboard access still varies by browser and permission state. Native EMF/WMF enumeration, rendering, and canonical-source PPTX export require implementation and Windows/PowerPoint verification. Splitting arbitrary Office selections into separate panels is deferred.

## 15. Changelog

- 0.1.0: Added the source-fidelity-first PowerPoint clipboard roadmap, provider boundary, canonical/preview split, size and placement rules, quality metadata, persistence/export contracts, TEMP ownership, and verification matrix.
- 0.2.0: Implemented the web provider for exposed SVG/TIFF/PNG/JPEG payloads, one-transaction active-page paste, Other typing, physical-size parsing, safe-region cascade, and quality display.
- 0.3.0: Added persistent Clipboard Source Diagnostics, live displayed-size DPI, available-format debugging, canonical/preview distinction, and non-blocking bitmap-fallback guidance.
- 0.4.0: Embedded the web provider's exact selected canonical clipboard file in portable `.figproj` saves and restored it as a live source on Import Figure.
