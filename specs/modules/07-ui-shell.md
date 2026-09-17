# UI Shell

Module: UI Shell  
Spec version: 1.4.0  
Implementation status: Milestones 11 and 12 implemented  
Last updated: 2026-09-18  
Depends on: Canvas Preview

## 1. Responsibility

Compose the top bar, functional left sidebar, dominant canvas, contextual inspector, and compact status controls while preventing feature clutter.

## 2. User-facing behavior

The top bar visibly identifies Figure Composer `v1.0` and exposes compact New/Open/Save/history actions plus `Page n / total`, Previous, Next, Add Page, and Export PPTX. The canvas remains the visual focus. Review is one existing sidebar tab with severity counts, focusable findings, and safe explicit fixes. Export shows the current review state, blocks errors, and allows warnings only through Export Anyway. Empty projects show a three-step onboarding cue and bundled three-page demo instead of another permanent toolbar.

## 3. Data model

Shell state includes stable active page ID, selection, pending populated-page deletion, pending source action/change, source-check results, source-action error, file/recovery state, and existing editing/viewport state. Ordered pages and every committed source result remain inside the immutable history-owned `EditorDocument`; source bindings, staged files, active page, selection, and check results remain session state.

## 4. Public interfaces

The React `App` delegates geometry/import/persistence/source/review behavior to domain and service modules. Browser inputs remain the fallback. In Tauri, the same actions use native Open/Save/Import/Replace/Export dialogs and preserve user-selected paths behind the platform adapter.

## 5. State transitions

Replace/Refresh choose and decode a supported source before presenting a sizing decision; Cancel revokes the staged preview. Apply commits one history transaction. Relink commits the chosen source while keeping exact panel bounds. Check Sources never modifies canonical data. Refresh Changed requires an explicit click and commits all detected changes as one Preserve Width transaction. Page lifecycle and movement behavior remains unchanged.

## 6. Edge cases

The MVP supports desktop-sized windows with a 900 px minimum shell width. Narrow-window optimization is deferred to polish.

## 7. Error handling

Unsupported or unreadable replacement files leave the project unchanged and show one dismissible banner. Picker cancellation is not an error. Source snapshots without refresh capability report unavailable rather than unchanged. Previous/Next and reorder controls disable at array ends; Delete disables for the only page.

## 8. Persistence requirements

Ctrl/Cmd+N creates a project; O opens; S saves; Shift+S saves as; Z undoes; Shift+Z or Y redoes; A selects all; D duplicates the selection. Delete removes selected panels and arrows nudge by 1 mm or 5 mm with Shift. Canonical edits schedule a 750 ms recovery write; pointer preview frames do not create history entries or recovery writes. Native dirty close opens Save / Discard / Cancel; export-in-progress prevents shutdown until export finishes.

## 9. Testing requirements

Interaction checks additionally cover the export scope dialog, busy state, download, missing-source error, source action visibility, missing Relink state, replacement sizing dialog, explicit Check Sources summary, Refresh Changed enablement, preview update, Undo/Redo, page actions, and accessible names.

## 10. Acceptance criteria

- Three-region layout is present.
- Canvas remains the largest visual region.
- Inspector is contextual to the unselected Page state.
- Inspector changes to selected-panel geometry when a panel is selected.
- Import remains one compact Assets action and canvas drop target.
- Delete is available contextually and through the standard Delete key.
- Preset management stays inside the existing Presets sidebar tab.
- Existing-panel resize decisions use an inline contextual confirmation, not a global modal.
- Advanced page options are collapsed by default.
- The compact page summary does not compete with the figure canvas.
- Page controls use compact `Page n / total`, previous/next, and Add Page actions without a permanent document-management sidebar.
- Layout commands remain contextual to a 2+ panel selection and do not add a permanent toolbar.
- Auto Layout lives in the existing Layout tab, with advanced options collapsed by default.
- The top page count reflects auto-created overflow pages without introducing a page-management sidebar.
- Label commands remain contextual; advanced project typography and sequencing stay collapsed.
- Source lifecycle actions stay inside the existing Assets tab and selected-panel inspector.
- Detected changes require an explicit Refresh command.
- PPTX scope is chosen in a temporary dialog; export never creates a permanent settings panel.

## 11. Known limitations

Thumbnails and cross-page drag are deferred; target-page collision avoidance is manual. Browser snapshot imports cannot be polled for later disk changes and folder relinking is not implemented. Native packages require platform toolchains and signing outside the source tree. Responsive small-window behavior is limited.

## 12. Changelog

- 0.1.0: Implemented Milestone 1 shell and page inspector.
- 0.2.0: Added compact asset import/list UI and contextual single-panel inspector with deletion.
- 0.3.0: Added preset manager, inline update decision, type assignment, manual scale, and preset-status inspector states.
- 0.4.0: Bound shell state and panel surfaces to a stable active page and added a compact page-count summary.
- 0.5.0: Added multi-selection gestures and a compact contextual layout inspector with keyboard nudging.
- 0.6.0: Added contextual page/selection relabel actions, concise panel label controls, a manual-label decision dialog, and collapsed project label settings.
- 0.6.1: Added an inline decision for applying changed default offsets to existing automatic positions or future automatic labels only.
- 0.6.2: Changed the project label font control to an Arial / Times New Roman dropdown.
- 0.7.0: Added a compact Auto Layout tab for three deterministic modes, exact gap control, Selection/Page/Project scopes, collapsed Auto Pagination/minor-scaling options, and fit/result feedback.
- 0.8.0: Added compact file/history controls, dirty status, recovery prompt, missing-source previews, load errors, and keyboard save/open/undo/redo shortcuts.
- 0.9.0: Added compact page navigation, lifecycle/reorder actions, populated-page confirmation, explicit cross-page selection movement, and page-action feedback.
- 1.0.0: Added contextual Replace/Refresh/Relink actions, sizing confirmation, Check Sources/Refresh Changed controls, capability-aware summaries, and source-action errors.
- 1.1.0: Enabled the top-bar PPTX action with a compact All pages/Current page dialog, busy/error states, and download confirmation.
- 1.2.0: Added compact Review findings, focus, safe fixes, status summary, and export gating.
- 1.3.0: Added New/Duplicate shortcuts, native-dialog routing, three-step onboarding, and the bundled three-page demo.
- 1.4.0: Added visible v1.0 identity, dirty-close protection, active-export shutdown gating, and persistent user-setting flush before native exit.
