# ADR-002: Millimeters as canonical geometry

Status: Accepted  
Date: 2026-09-16

## Context

Screen pixels vary with zoom and display density, while the target A4 page and PowerPoint output require stable physical dimensions.

## Decision

Store all authoritative page and object geometry as numeric millimeters. Convert millimeters to CSS pixels only in the preview adapter using 96 CSS pixels per inch. Zoom multiplies the viewport conversion and never changes domain geometry.

## Alternatives considered

- CSS pixels: simple for rendering, but unstable as a persisted or exported unit.
- PowerPoint EMUs: exact for export, but awkward for interaction and user-facing values.
- Points: familiar in typography, but less natural for A4 layout and laboratory workflows.

## Consequences

Preview and export can consume the same geometry. Tests can compare known physical coordinates without browser layout. Conversion rounding happens only at output boundaries.

## Revisit when

A supported import format exposes unavoidable unit ambiguity or export precision tests reveal a measurable mismatch.
