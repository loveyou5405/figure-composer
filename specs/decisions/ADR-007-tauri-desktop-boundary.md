# ADR-007: Tauri Desktop Boundary

- Status: Accepted
- Date: 2026-09-17

## Context

Figure Composer needs native Windows/macOS dialogs, persistent user-selected paths, OS drag/drop, and distributable desktop packages while retaining the deterministic and browser-testable React domain implementation.

## Decision

Use Tauri 2 as a thin outer shell. Keep project, geometry, review, history, source replacement, and PPTX planning in TypeScript. A small platform adapter dynamically invokes dialog and filesystem plugins only when the Tauri bridge exists; browser inputs and downloads remain fallbacks. Grant only dialog open/save and selected-file read/write/stat capabilities.

## Consequences

One frontend continues to serve browser development and desktop builds. Native path persistence is available without putting Rust logic in the scientific document model. Building Windows/macOS packages requires each platform's supported Rust and OS toolchain; signing, notarization, installation, and native PowerPoint checks remain release-environment responsibilities.
