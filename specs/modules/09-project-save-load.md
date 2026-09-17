# Project Persistence, Recovery, and History

Module: Project Save and Load  
Spec version: 0.7.0  
Implementation status: Milestones 9 and 12 implemented  
Last updated: 2026-09-18  
Depends on: Project Model, Layout Engine, ADR-001 Tech Stack, ADR-004 Multi-page Document Ownership, ADR-005 Persistence and History, ADR-006 Source Binding and Refresh

## 1. Responsibility

Save and restore human-readable `.figproj` projects, validate and migrate schema versions, preserve missing asset metadata, maintain debounced local recovery, expose dirty state, and provide bounded transaction-based Undo/Redo.

## 2. User-facing behavior

The top bar exposes Open, Save, Save As, Undo, and Redo without adding a permanent document sidebar. Ctrl/Cmd+S saves; Ctrl/Cmd+Shift+S invokes Save As; Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z invoke history. Status is subtle: Saved, Unsaved changes, Saving recovery…, or a concise failure. On startup, a valid recovery snapshot offers Restore or Discard.

## 3. File model

Schema `0.1.0` stores:

- schema version and saved timestamp;
- project ID/title, ordered pages, immutable A4 definitions, page-owned panels, labels, and project label settings;
- project-scoped asset metadata and source fingerprint fields;
- panel types and presets;
- Auto Layout settings.

Session-only `File` objects, object URLs, selection, active page, zoom, guides, history, and pending UI dialogs are never serialized. Original scientific image bytes are never modified or embedded into JSON.

## 4. Missing sources

Browser security does not permit reopening arbitrary local paths. A loaded asset is matched to an already available session asset by stable asset ID and source fingerprint. If unavailable, it becomes an explicit missing asset reference with filename, dimensions, MIME type, size, and modified time intact. Its panel remains selectable and keeps exact geometry/type/preset/label metadata. Relink replaces only the session source record under the same asset ID and leaves the project/page/panel model untouched.

## 5. Schema and migrations

`deserializeProjectFile` parses, migrates, validates, and only then returns a replacement editor document. The migration runner accepts an explicit ordered migration chain and rejects missing steps, cycles, excessive chains, and unsupported versions. Structural validation covers page ownership, stable unique IDs, finite millimeter geometry, positive sizes, asset/type/preset references, label shape, A4 definitions, and Auto Layout settings.

## 6. History model

History stores immutable editor-document snapshots with transaction labels and a capacity of 200 committed operations. Commit clears redo after divergent edits. Undo and Redo exchange complete canonical editor states, including assets/types/presets/project settings, so compound operations remain coherent.

Pointer move and resize are previewed without appending history; pointer-up promotes the gesture's starting snapshot and final state into one entry. Import, multi-delete, layout, presets, labels, Auto Layout, page operations, Replace Source, Refresh Source, Relink Source, and batch Refresh Changed each commit atomically. Check Sources is read-only session state and creates no history or recovery write.

## 7. Save and load I/O

Where the File System Access API is available, browser Save reuses the current writable handle; its fallback downloads a `.figproj`. In Tauri, native dialogs and filesystem APIs retain the selected project path for later Save. Desktop asset imports persist user-selected source paths and attempt to rehydrate them on Open; an unavailable path remains an explicit missing source without changing geometry.

## 8. Autosave and crash recovery

Meaningful canonical edits schedule a recovery write 750 ms after the last edit. Pointer preview frames are not individually persisted. A successful explicit save or explicit Discard removes recovery state. Recovery data is local browser storage and contains the same validated serializable project model, not source image bytes.

Recovery uses the dedicated persistent key `figure-composer:recovery:v1` and never lives under disposable native session TEMP. Application preferences, reusable panel types/presets, label/manuscript style profiles, and recent layout/zoom settings use the separate persistent key `figure-composer:settings:v1`. TEMP cleanup never clears either store. Dirty desktop shutdown closes only after Save succeeds or Discard is explicit; Cancel and failed/cancelled Save leave the application open.

## 9. Errors

Malformed JSON, unsupported schema, invalid ownership/references, storage failures, and file-write failures leave the active project unchanged and show a concise actionable message. Canceling a picker is not an error.

## 10. Testing requirements

Test project round-trip, source fingerprints, missing assets, Relink preservation, Replace/Refresh history, multi-page ownership, presets, labels, invalid references, schema rejection, migrations, Undo/Redo, pointer grouping, history bounds, autosave debounce, recovery, and Auto Layout as one entry.

## 11. Acceptance criteria

- Save/Open restores canonical project state exactly.
- Missing sources never destroy panel metadata.
- Undo/Redo covers all implemented meaningful edits.
- One drag, resize, or Auto Layout action equals one history entry.
- Autosave is debounced and recovery is explicitly offered.
- Original sources remain untouched.

## 12. Known limitations

Browser fallback Save cannot overwrite a previously downloaded file. `.figproj` intentionally does not embed source bytes; browser sources must be relinked after reopening, while desktop paths are best-effort and may move or lose permission. Recovery is local and not cross-device. Cloud sync and collaboration are outside scope.

## 13. Changelog

- 0.1.0: Initial planned contract.
- 0.2.0: Replaced the singular page root with ordered page-owned panels.
- 0.3.0: Added schema `0.1.0`, validated round-trip persistence, missing-source preservation, browser save/open, 750 ms recovery, 200-entry atomic history, and restore/discard behavior.
- 0.4.0: Added atomic history and recovery coverage for page lifecycle, page order, duplication, and explicit cross-page selection movement without changing schema `0.1.0`.
- 0.5.0: Added atomic Replace/Refresh/Relink history, persisted source fingerprints, and exact-layout missing-source recovery without changing schema `0.1.0`.
- 0.6.0: Added Tauri native Open/Save routing and best-effort persistent desktop source-path rehydration without changing schema `0.1.0`.
- 0.7.0: Separated persistent settings and recovery from session TEMP and added explicit dirty-close save outcome coordination.
