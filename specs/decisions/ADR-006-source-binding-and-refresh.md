# ADR-006: Non-destructive Source Binding and Explicit Refresh

Status: Accepted  
Date: 2026-09-17

## Context

Scientific panels are revised outside Figure Composer, but browser file inputs expose immutable `File` snapshots rather than durable filesystem paths. A saved `.figproj` must remain portable and must not embed image bytes, object URLs, or non-serializable handles. Source updates must also preserve panel identity, scientific metadata, and deterministic millimeter geometry.

## Decision

- Persist a source fingerprint consisting of filename, byte size, and modified time with existing intrinsic metadata.
- Keep runtime source bindings outside `EditorDocument`. Each binding declares either `snapshot` or `refreshable` capability.
- Report snapshot-only checks as `unavailable`; never claim that an immutable browser snapshot proves the disk source is unchanged.
- Never apply a detected change automatically. `Refresh Source` and `Refresh Changed` require explicit user actions.
- `Replace Source` is panel-specific and creates a new asset identity, preserving panel identity and metadata.
- `Refresh Source` keeps the logical asset identity and updates every panel referencing it.
- `Relink Source` keeps the logical asset identity and exact panel layout.
- Default changed-aspect sizing preserves displayed width and panel center while recalculating height. Reapply Preset is the explicit alternative.
- Source operations are immutable one-entry history transactions. Staged or failed preview URLs are revoked; committed URLs remain available while Undo can restore them.

## Consequences

The browser implementation is honest about capability and remains local/non-destructive. Explicit reselection provides complete Replace, Refresh, and Relink workflows even without persistent handles. Native desktop packaging may later provide refreshable handles and folder relinking without changing the domain contract. Source bytes remain outside `.figproj`, so schema `0.1.0` does not change.
