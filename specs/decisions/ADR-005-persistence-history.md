# ADR-005: Versioned JSON persistence and snapshot transactions

Status: Accepted  
Date: 2026-09-17

## Context

Figure Composer must preserve multi-page millimeter geometry and compound editing operations without mutating source images. Browser file access cannot reliably retain local paths or reopen arbitrary files after refresh.

## Decision

Use human-readable `.figproj` JSON with schema version `0.1.0`. Serialize canonical editor data and source fingerprints, but exclude original image bytes, object URLs, and viewport state. Represent unavailable sources explicitly instead of removing their panels.

Use immutable full editor-document snapshots for history, capped at 200 committed operations. Pointer gestures use transient preview state and commit once on pointer-up. Auto Layout commits its entire cross-page result as one transaction.

Use a 750 ms local-storage recovery debounce. Prefer the File System Access API for writable Save/Save As handles and use download fallback otherwise.

## Consequences

The approach is deterministic, straightforward to validate/migrate, and makes compound Undo/Redo reliable. Snapshot storage is acceptable for the intended 10–40 panel workload because original image bytes are not stored in snapshots. Browser-reopened projects can preserve all layout metadata but cannot restore image previews without a still-live session asset or later relinking.

## Alternatives considered

- Operation-only inverse commands: more memory efficient but substantially more complex for evolving multi-page compound operations.
- Embed original assets as base64: self-contained but produces large JSON, duplicates scientific data, and conflicts with source-reference workflows.
- Persist DOM or canvas state: rejected because viewport pixels are not canonical document geometry.

## Revisit when

Milestone 12 desktop packaging provides native paths, or common projects exceed the snapshot memory target.
