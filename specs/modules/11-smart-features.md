# Smart Features

Module: Smart Features  
Spec version: 0.2.0  
Implementation status: Deterministic filename inference and scored Auto Layout implemented  
Last updated: 2026-09-17  
Depends on: Asset Import, Panel Presets, Layout Engine, Validation

## 1. Responsibility

Reduce repetition through transparent deterministic rules while preserving explicit user intent.

## 2. User-facing behavior

MVP infers panel type from known filename tokens and offers explicit Balanced, Compact, and Equal Rows automatic arrangement. Candidate scores are explainable, repeatable, and never use opaque AI to redesign a figure.

## 3. Data model

Filename rules are ordered token-to-type mappings. Suggestions include reason, proposed deterministic command, and dismissed or accepted state where persistence is useful.

## 4. Public interfaces

Pure functions classify filenames, detect deviations from presets, generate scored contiguous-row candidates, and arrange Selection/Page/Project scopes with explicit millimeter gaps and optional pagination.

## 5. State transitions

Classification creates a suggested or initial type that users can override. Suggestions mutate the project only after explicit user action.

## 6. Edge cases

Handle multiple matching tokens, case differences, filenames without tokens, custom types, manual overrides, and layouts that cannot fit inside safe margins.

## 7. Error handling

Ambiguous classification falls back to Other or requests user choice; it never invents confidence. Failed auto-arrange leaves geometry unchanged.

## 8. Persistence requirements

Final types and accepted geometry are persisted. Derived suggestions need not be persisted unless dismissal would otherwise repeat annoyingly.

## 9. Testing requirements

Test every default token mapping, precedence and ambiguity, override preservation, scale-deviation tolerance, and repeatable arrangement.

## 10. Acceptance criteria

Filename rules are explainable and overrideable, manual scale changes are never auto-reset, and automatic layout is deterministic and conservative.

## 11. Known limitations

Natural-language commands, AI classification, candidate-gallery UI, and style profiles are post-v1. The engine already retains deterministic top-N scored candidates.

## 12. Changelog

- 0.1.0: Initial deterministic smart-feature boundaries.
- 0.2.0: Added deterministic scored Auto Layout modes, top-N candidate foundations, and safe multi-page overflow.
