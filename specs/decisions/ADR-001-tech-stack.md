# ADR-001: TypeScript-first local application stack

Status: Accepted  
Date: 2026-09-16

## Context

The product needs a responsive cross-platform UI, deterministic layout logic, strong tests, and later desktop filesystem access. Early milestones should avoid desktop-packaging complexity while retaining a direct migration path.

## Decision

Use React 18, TypeScript 5, Vite 8, and Vitest 4 for the frontend and tests. Keep domain code independent of React. Tauri 2 is the thin desktop shell for bundled production assets and native filesystem integration. PptxGenJS remains behind an export-service boundary. Pin exact dependency versions so the scaffold remains reproducible, and enforce synchronized npm/Cargo/Tauri application versions before production builds.

## Alternatives considered

- Tauri immediately: aligned with the target architecture, but adds Rust/toolchain and permission-surface work before the canvas foundation is proven.
- Electron: mature, but larger runtime and memory footprint conflict with the lightweight goal.
- Python desktop UI: capable export ecosystem, but weaker fit for the browser-like interaction model and later canvas tooling.

## Consequences

Milestone 1 runs in a local browser, not as an installed desktop application. Geometry and project-domain modules remain reusable when Tauri is introduced. Local-only guarantees must be preserved when adding the shell.

## Revisit when

Milestone 7 implements browser project persistence; Milestone 12 still owns desktop packaging and native path integration. Revisit earlier only if browser constraints block a required interaction.
