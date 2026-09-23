# Asset Import

Module: Asset Import  
Spec version: 1.0.0
Implementation status: Source lifecycle, web clipboard provider, and portable exact-source ownership implemented; native clipboard provider deferred
Last updated: 2026-09-22
Depends on: Project Model, Canvas Preview, ADR-006 Source Binding and Refresh, Clipboard Import

## 1. Responsibility

Import, replace, refresh, check, and relink supported local visual assets without modifying or uploading their source files.

## 2. User-facing behavior

Users can choose or drop multiple PNG, JPG/JPEG, SVG, TIF, and TIFF files onto the active A4 page. A single imported or pasted image opens a compact centered preset picker by default; the Asset-sidebar toggle can disable it, while multi-file imports never open it. A selected panel exposes Replace Source and Refresh Source; a missing panel exposes Relink Source. Replace is panel-specific, Refresh updates all references to the same logical asset, and Relink preserves exact layout. Check Sources reports changed, missing, unchanged, and unavailable counts according to platform capability. No detected change is ever applied without an explicit Refresh action.

## 3. Data model

Each asset has a stable ID, source filename, browser-reported MIME type, supported kind, intrinsic width and height, last-modified timestamp, byte size, optional portable source hint, and a session-local preview URL. Filename, byte size, and modified time form the current persisted change fingerprint. Runtime source bindings declare whether they are immutable browser snapshots or refreshable handles and are never serialized. PNG/JPEG/SVG previews reference source object URLs; TIFF previews reference a locally generated PNG Blob while original TIFF bytes remain untouched.

## 4. Public interfaces

`getSupportedAssetKind`, `loadImportedAsset`, `decodeTiffFirstPage`, and `loadImportedAssetBatch` own decoding. `getAssetFingerprint`, `getFileFingerprint`, and `sourceFingerprintChanged` compare source metadata. `checkAssetSources` uses a capability-aware binding and never reports a non-refreshable browser snapshot as freshly checked. `replacePanelSource`, `refreshAssetSource`, and `relinkAssetSource` produce immutable history-ready documents. Object URLs remain alive while Undo may restore them and are revoked on cancelled/failed staging or application unmount.

## 5. State transitions

Selected files move through validating, decoded, classified, registered and placed, or rejected states. Replacement and refresh stage a decoded source, then require explicit Preserve Width or Reapply Preset confirmation. Relink commits the selected source directly while retaining exact geometry. Refresh Changed is one explicit batch/history transaction using Preserve Width. Original files remain unchanged.

## 6. Edge cases

Duplicate filenames remain separate assets with separate IDs. Malformed images and zero intrinsic dimensions are rejected. Empty selections are ignored. Batch import supports partial success. SVG is displayed directly from its SVG object URL and is not rasterized in the preview pipeline. Multi-page TIFF files use the first image directory for the panel preview. TIFF previews above 100 million pixels are rejected to avoid unsafe browser memory use.

## 7. Error handling

One invalid file must not cancel valid siblings. Report failures per file and revoke temporary object URLs on decode failure, panel deletion, and unmount.

## 8. Persistence requirements

Portable `.figproj` stores stable IDs, source fingerprint metadata, and exact original source bytes as separate verified archive entries; it never stores browser object URLs, live handles, embedded secrets, or automatic cloud copies. Import Figure rebuilds session previews from those embedded bytes. Legacy JSON projects may still use Tauri-selected local paths for best-effort source restoration; unavailable assets remain explicit missing references until relinked.

## 9. Testing requirements

Test import formats, decoding, unique IDs, order, inference, vector preview, same/different-aspect replacement, width/center preservation, preset reapplication, scientific metadata retention, shared-asset refresh, missing-source relink, source fingerprint comparison, capability-aware detection, and undo replacement.

## 10. Acceptance criteria

- PNG, JPEG, SVG, and TIFF import through picker and canvas drop.
- Multiple files import in one action.
- Every file creates an independent stable asset and panel ID.
- Every new panel is inserted into exactly one active page and records that stable page ID.
- All handling remains local, explicit, undoable, and non-destructive.
- SVG remains an SVG object URL in preview.
- TIFF source bytes remain unchanged; its first page is decoded locally into a session-only PNG preview.
- Replace preserves panel identity/type/preset/label and offers deterministic sizing choices.
- Refresh never occurs automatically; Relink preserves exact layout.
- `_WB`, `_IF`, `_IHC`, `_Graph`, `_Prism`, `_Flow`, and `_Heatmap` tokens infer the documented type case-insensitively.

## 11. Known limitations

Additional TIFF pages, PDF, EPS, folders, clipboard images, and remote URLs are unsupported in the implemented importer. TIFF previews are rasterized because browsers do not reliably render TIFF directly. Browser input/drop files are immutable snapshots and cannot observe later disk edits; Check Sources reports them as unavailable and explicit reselection remains available. Batch folder relink remains unsupported. Desktop paths are best-effort and do not follow files moved outside the application.

## 12. Clipboard integration

The implemented `WebClipboardProvider` in `13-clipboard-import.md` reuses asset registration without pretending a clipboard payload is a normal file path. It ranks browser-exposed SVG/TIFF/PNG/JPEG representations by information fidelity, records clipboard/source quality metadata, defaults scientific type to Other, and imports one paste as one panel. The future native provider extends the same boundary to EMF/WMF/DIB while keeping canonical bytes separate from disposable previews.

## 13. Changelog

- 0.1.0: Initial planned contract.
- 0.2.0: Implemented local multi-file PNG/JPEG/SVG picker and A4 drop import with partial-failure reporting.
- 0.3.0: Added deterministic filename classification and preset application during import.
- 0.4.0: Scoped imports and placement cascades to the active page and assigned explicit panel ownership.
- 0.5.0: Added local, non-destructive TIF/TIFF first-page decoding with PNG preview generation and a 100-megapixel safety limit.
- 0.6.0: Added explicit Replace/Refresh/Relink, deterministic aspect handling, source fingerprints, capability-aware checking, batch Refresh Changed, and atomic history integration.
- 0.7.0: Added native Tauri picker routing, persistent selected paths, and best-effort source restoration on project Open.
- 0.8.0: Added the planned high-fidelity clipboard provider contract and canonical-versus-preview asset rules without claiming implementation.
- 0.9.0: Implemented browser/WebView Ctrl/Cmd+V for exposed SVG/TIFF/PNG/JPEG payloads with quality metadata and active-page ownership.
- 1.0.0: Embedded exact source bytes in portable `.figproj` and rebuilt previews/source bindings from verified package entries on Import Figure.
- 1.1.0: Added the optional single-image preset picker while preserving uninterrupted batch import.
