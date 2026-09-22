# Project Persistence, Recovery, and History

Module: Project Save and Load  
Spec version: 2.0.0
Implementation status: Portable project Save/Import, legacy JSON loading, recovery, and history implemented
Last updated: 2026-09-22
Depends on: Project Model, Layout Engine, Clipboard Import, ADR-001 Tech Stack, ADR-004 Multi-page Document Ownership, ADR-005 Persistence and History, ADR-006 Source Binding and Refresh

## 1. Responsibility

Save and restore single-file portable `.figproj` projects containing complete editable state plus exact image sources, validate container integrity and project schemas, preserve legacy JSON compatibility, maintain debounced local recovery, expose dirty state, and provide bounded transaction-based Undo/Redo.

## 2. User-facing behavior

The top bar exposes Import Figure, Save, Save As, Undo, and Redo without adding a permanent document sidebar. Save and Save As write one portable `.figproj`; Import Figure opens that file on another computer without needing the original image paths. Ctrl/Cmd+S saves; Ctrl/Cmd+Shift+S invokes Save As; Ctrl/Cmd+O imports a Figure project; Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z invoke history. Status reports portable packing/opening, Saved, Unsaved changes, recovery, or a concise failure. On startup, a valid metadata-only recovery snapshot offers Restore or Discard.

## 3. File model

Portable container version `1.0.0` is ZIP-compatible and stores:

- `project.json`, containing project schema `0.1.0` and the complete editable document model;
- `assets/<stable-entry>.<original-extension>`, containing the exact imported PNG, JPEG, SVG, or TIFF bytes;
- an asset manifest containing stable asset ID, internal path, original filename, MIME/kind, byte size, last-modified timestamp, and SHA-256.

Project schema `0.1.0` stores:

- schema version and saved timestamp;
- project ID/title, ordered pages with Figure IDs, immutable A4 definitions, page-owned panels, labels, and project label settings;
- project-scoped asset metadata, source fingerprint fields, and available clipboard source diagnostics;
- panel types and presets;
- Auto Layout settings.

Session-only object URLs, selection, active page, zoom, guides, history, and pending UI dialogs are never serialized. Exact source `File` bytes are embedded as separate archive entries without image decoding, resizing, rasterization, or lossy recompression. ZIP storage itself is lossless; image entries use STORE mode.

## 4. Missing sources

Portable projects do not depend on arbitrary local paths. Import Figure extracts each embedded asset in memory, verifies byte size and SHA-256, decodes a fresh preview, and retains the exact extracted file as the session source for future Save and export. Portable Save is blocked if any asset lacks exact source bytes; generated previews are never substituted. Legacy JSON projects preserve missing metadata and can be opened, but every missing source must be relinked before a complete portable Save.

## 5. Schema and migrations

`deserializeProjectFile` parses, migrates, normalizes legacy pages without Figure IDs into one continuous Figure, validates, and only then returns a replacement editor document. The migration runner accepts an explicit ordered migration chain and rejects missing steps, cycles, excessive chains, and unsupported versions. Structural validation covers Figure/page ownership, stable unique IDs, finite millimeter geometry, positive sizes, asset/type/preset references, label shape, A4 definitions, and Auto Layout settings.

## 6. History model

History stores immutable editor-document snapshots with transaction labels and a capacity of 200 committed operations. Commit clears redo after divergent edits. Undo and Redo exchange complete canonical editor states, including assets/types/presets/project settings, so compound operations remain coherent.

Pointer move and resize are previewed without appending history; pointer-up promotes the gesture's starting snapshot and final state into one entry. Import, multi-delete, layout, presets, labels, Auto Layout, page operations, Replace Source, Refresh Source, Relink Source, and batch Refresh Changed each commit atomically. Check Sources is read-only session state and creates no history or recovery write.

## 7. Save and load I/O

Where the File System Access API is available, browser Save reuses the current writable handle; its fallback downloads the portable `.figproj` Blob. In Tauri, native dialogs and binary filesystem APIs retain the selected project path for later Save. Desktop Import Figure reads the container as binary data. Legacy desktop JSON assets may still rehydrate from source paths, after which the next Save packages those exact bytes.

## 8. Autosave and crash recovery

Meaningful canonical edits schedule a recovery write 750 ms after the last edit. Pointer preview frames are not individually persisted. A successful explicit save or explicit Discard removes recovery state. Recovery data is local browser storage and contains the same validated serializable project model, not source image bytes.

Recovery uses the dedicated persistent key `figure-composer:recovery:v1` and never lives under disposable native session TEMP. Application preferences, reusable panel types/presets, label/manuscript style profiles, and recent layout/zoom settings use the separate persistent key `figure-composer:settings:v1`. TEMP cleanup never clears either store. Dirty desktop shutdown closes only after Save succeeds or Discard is explicit; Cancel and failed/cancelled Save leave the application open.

## 9. Errors

Malformed JSON, unsupported schema, invalid ownership/references, storage failures, and file-write failures leave the active project unchanged and show a concise actionable message. Canceling a picker is not an error.

## 10. Testing requirements

Test project round-trip, source fingerprints, missing assets, Relink preservation, Replace/Refresh history, multi-page ownership, presets, labels, invalid references, schema rejection, migrations, Undo/Redo, pointer grouping, history bounds, autosave debounce, recovery, and Auto Layout as one entry.

## 11. Acceptance criteria

- Save/Import Figure restores canonical project state and exact original image bytes from one file.
- Moving the `.figproj` to another computer does not require original image paths.
- Reopened embedded assets remain available for later editing, Save, and export.
- Byte-size or SHA-256 mismatch blocks opening instead of accepting damaged content.
- Missing sources never destroy panel metadata.
- Undo/Redo covers all implemented meaningful edits.
- One drag, resize, or Auto Layout action equals one history entry.
- Autosave is debounced and recovery is explicitly offered.
- Original sources remain untouched.

## 12. Known limitations

Browser fallback Save cannot overwrite a previously downloaded file. Creating and opening very large projects currently buffers the ZIP and source entries in memory; no arbitrary project-size limit is imposed, but available system memory remains a practical boundary. Recovery is metadata-only, local, and not a cross-device replacement for portable Save. Cloud sync and collaboration are outside scope.

## 13. Portable project container

Portable single-file `.figproj` is the default implemented Save format. Container version `1.0.0` is independent of project JSON schema `0.1.0`, allowing future container and document migrations to evolve separately.

### 13.1 Container structure and source fidelity

The portable `.figproj` uses a ZIP-compatible container with a deterministic internal layout:

```text
project.figproj
├─ project.json
├─ assets/
│  ├─ <asset-id>.<original-extension>
│  └─ ...
└─ previews/                 optional and always rebuildable
```

`project.json` remains the canonical document manifest. Every packaged asset record stores its stable asset ID, original filename, MIME type, byte size, package-relative path, and a cryptographic content hash. The bytes under `assets/` must be the exact imported PNG, JPEG, SVG, or TIFF bytes; packaging or ZIP compression must not rasterize, resize, recompress, or otherwise modify scientific source images. Preview derivatives are never authoritative and may be discarded and regenerated.

Pathless clipboard assets follow the same rule and must embed their exact canonical SVG/EMF/WMF/TIFF/PNG/JPEG representation in `assets/`. Generated EMF/WMF/TIFF/DIB previews belong only in optional `previews/` or session TEMP. The manifest records clipboard provenance, canonical format, quality class, vector/lossless flags, physical-size source, and pixel dimensions when known. A portable save is incomplete if it retains only a preview for a pathless clipboard asset.

Assets with identical verified content hashes may share one packaged payload while retaining separate logical asset records when required by document ownership. Original external source paths may be retained as optional provenance, but packaged content is the primary source when present.

### 13.2 Portable and linked modes

Portable project is the Save/Save As mode and requires every original source byte. It is optimized for reliable transfer, archival, and opening on another computer without Relink.

Linked project mode remains deferred. The application does not silently create a sibling `raw/` directory because the project file and directory could be separated accidentally.

An explicit `Collect assets` operation should convert a linked or legacy project into a portable container after all missing sources have been resolved. A future size estimate should be shown before collecting or saving unusually large projects.

### 13.3 Compatibility and migration

Import Figure detects ZIP versus legacy JSON by content rather than extension. Legacy JSON `.figproj` files continue through the existing schema migration and validation path, while portable containers load `project.json` and then resolve packaged assets by stable ID and verified hash. Opening an old JSON project never rewrites it automatically; its next explicit Save/Save As creates a portable project only when all exact sources are available.

The container format version and the JSON document schema version are separate. A container reader may support several document schema versions, and document migrations must remain deterministic and non-destructive. Missing or corrupt packaged assets preserve panel geometry and metadata using the existing missing-source behavior.

### 13.4 Save integrity, performance, and security

Portable saves build a complete container before writing the selected destination. Cancellation, quota exhaustion, disk-full conditions, or write failures are reported as Save failures. The UI reports packing status; streaming progress/cancellation for large TIFF-heavy projects remains future work.

The loader must reject unsafe archive paths, duplicate manifest paths, unsupported compression methods, unreasonable file counts or expansion ratios, declared-size mismatches, and asset hashes that do not verify. MIME and extension disagreement is reported without modifying the original bytes. Archive extraction must never write outside a runtime-owned temporary or destination directory.

Autosave recovery remains distinct from portable Save. Recovery may retain the current metadata-only behavior and must not be presented as a durable or cross-device backup of source images.

### 13.5 Deferred implementation and acceptance tests

Automated tests cover byte-for-byte source preservation, SHA-256 rejection, legacy JSON opening, exact-source requirements, and browser writable-handle output. Remaining release-environment checks include very large TIFF projects, disk-full/interrupted writes, malformed archive stress cases, and cross-device opening in packaged Windows/macOS builds.

## 14. Changelog

- 0.1.0: Initial planned contract.
- 0.2.0: Replaced the singular page root with ordered page-owned panels.
- 0.3.0: Added schema `0.1.0`, validated round-trip persistence, missing-source preservation, browser save/open, 750 ms recovery, 200-entry atomic history, and restore/discard behavior.
- 0.4.0: Added atomic history and recovery coverage for page lifecycle, page order, duplication, and explicit cross-page selection movement without changing schema `0.1.0`.
- 0.5.0: Added atomic Replace/Refresh/Relink history, persisted source fingerprints, and exact-layout missing-source recovery without changing schema `0.1.0`.
- 0.6.0: Added Tauri native Open/Save routing and best-effort persistent desktop source-path rehydration without changing schema `0.1.0`.
- 0.7.0: Separated persistent settings and recovery from session TEMP and added explicit dirty-close save outcome coordination.
- 0.8.0: Recorded the deferred portable-container direction: exact original image bytes in a single `.figproj`, optional linked mode for unusually large projects, legacy JSON compatibility, safe collection, and archive integrity requirements.
- 0.9.0: Extended the deferred container contract to embed exact canonical bytes and quality metadata for pathless clipboard assets while keeping previews rebuildable.
- 1.0.0: Persisted available browser clipboard formats, selected/canonical/preview formats, quality class, conversion state, and known dimensions; effective DPI remains derived from current panel geometry.
- 1.1.0: Normalized legacy fixed panel bases to the PowerPoint 96 DPI reference during load while preserving exact saved geometry and schema `0.1.0`.
- 1.2.0: Persisted page Figure IDs and normalized older schema-compatible files without them into Figure 1.
- 2.0.0: Implemented single-file portable `.figproj` Save/Import with exact asset bytes, STORE-mode image entries, SHA-256/size verification, restored source bindings, and legacy JSON compatibility.
