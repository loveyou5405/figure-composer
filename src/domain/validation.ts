import type { EditorDocument } from "./editorDocument";
import { getPanelLabelBoundsMm } from "./labels";
import type { PageDefinition } from "./page";
import type { Panel, PanelGeometry } from "./panel";
import { roundMm } from "./panel";
import { getProjectOwnershipErrors } from "./project";
import { getPanelScalePercent, isPanelFollowingPreset } from "./preset";

export interface ReviewSourceCheck {
  readonly assetId: string;
  readonly status: "unchanged" | "changed" | "missing" | "unavailable";
  readonly file?: File;
}

export type ReviewSeverity = "error" | "warning" | "info";
export type ReviewFixKind = "reset-preset" | "move-inside-margin" | "refresh-source" | "relabel-page";

export interface ReviewFix {
  readonly kind: ReviewFixKind;
  readonly label: string;
  readonly panelId?: string;
  readonly pageId?: string;
  readonly assetId?: string;
}

export interface ReviewFinding {
  readonly id: string;
  readonly code: string;
  readonly severity: ReviewSeverity;
  readonly message: string;
  readonly pageId?: string;
  readonly panelIds: readonly string[];
  readonly assetId?: string;
  readonly fix?: ReviewFix;
}

export interface ReviewSummary {
  readonly errors: number;
  readonly warnings: number;
  readonly info: number;
}

export const GEOMETRY_EPSILON_MM = 0.001;
export const PAGE_EDGE_PROXIMITY_MM = 2;
export const SCALE_CONSISTENCY_TOLERANCE_PERCENT = 0.5;
export const DPI_OK_THRESHOLD = 300;
export const DPI_STRONG_WARNING_THRESHOLD = 200;

export function reviewDocument(
  editor: EditorDocument,
  sourceChecks: readonly ReviewSourceCheck[] = [],
): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const assets = new Map(editor.assets.map((asset) => [asset.id, asset]));
  const presets = new Map(editor.presets.map((preset) => [preset.id, preset]));
  const types = new Map(editor.types.map((type) => [type.id, type]));
  const checks = new Map(sourceChecks.map((result) => [result.assetId, result]));
  const pageOrder = new Map(editor.project.pages.map((page, index) => [page.id, index]));

  getProjectOwnershipErrors(editor.project).forEach((message, index) => findings.push({
    id: `structural:${index}:${stableToken(message)}`,
    code: "structural-project-error",
    severity: "error",
    message,
    panelIds: [],
  }));

  editor.project.pages.forEach((page) => {
    const labels = page.panels
      .filter((panel) => panel.label.visible && panel.label.text.trim())
      .map((panel) => ({ panel, bounds: getPanelLabelBoundsMm(panel, editor.project.labelSettings) }));

    page.panels.forEach((panel) => {
      const asset = assets.get(panel.assetId);
      const type = types.get(panel.typeId);
      const preset = presets.get(panel.presetId);
      const geometry = panel.geometry;
      const name = panelName(panel, type?.name);

      if (outsideBounds(geometry, page.definition)) {
        findings.push(finding("panel-outside-page", "warning", page.id, [panel.id], `${name} extends outside ${page.name}.`));
      }

      const safeIntrusion = safeMarginIntrusion(geometry, page.definition);
      if (safeIntrusion > GEOMETRY_EPSILON_MM) {
        const fitsSafeArea = geometry.widthMm <= page.definition.widthMm - page.definition.marginMm * 2
          && geometry.heightMm <= page.definition.heightMm - page.definition.marginMm * 2;
        findings.push({
          ...finding("panel-outside-safe-margin", "warning", page.id, [panel.id], `${name} is outside the safe margin by ${formatNumber(safeIntrusion)} mm.`),
          fix: fitsSafeArea ? { kind: "move-inside-margin", label: "Move inside margin", panelId: panel.id, pageId: page.id } : undefined,
        });
      }

      const edgeDistance = minimumEdgeDistance(geometry, page.definition);
      if (edgeDistance >= -GEOMETRY_EPSILON_MM && edgeDistance < PAGE_EDGE_PROXIMITY_MM - GEOMETRY_EPSILON_MM) {
        findings.push(finding("panel-near-page-edge", "info", page.id, [panel.id], `${name} is only ${formatNumber(Math.max(0, edgeDistance))} mm from the page edge.`));
      }

      if (!panel.label.visible || !panel.label.text.trim()) {
        findings.push({
          ...finding("missing-visible-label", "warning", page.id, [panel.id], `${name} is missing an expected visible label.`),
          fix: { kind: "relabel-page", label: "Relabel page", pageId: page.id },
        });
      }
      if (panel.label.mode === "manual") {
        findings.push(finding("manual-label-override", "info", page.id, [panel.id], `${name} uses a manual label override.`));
      }

      if (preset && !isPanelFollowingPreset(panel, preset)) {
        const actual = getPanelScalePercent(panel);
        findings.push({
          ...finding("preset-deviation", "warning", page.id, [panel.id], `${name} is ${formatNumber(actual)}% while its preset is ${preset.scalePercent}%.`),
          fix: { kind: "reset-preset", label: "Reset to preset", panelId: panel.id, pageId: page.id },
        });
      }
      if (panel.manualScaleOverride) {
        findings.push(finding("manual-scale-override", "info", page.id, [panel.id], `${name} has a manual size override.`));
      }

      if (asset) {
        if (asset.missing || !asset.previewUrl) {
          findings.push({
            ...finding("missing-source", "error", page.id, [panel.id], `${asset.sourceName} is missing and must be relinked before export.`),
            assetId: asset.id,
          });
        } else if (asset.kind !== "svg") {
          const dpi = effectiveDpi(panel, asset.intrinsicWidthPx, asset.intrinsicHeightPx);
          if (dpi < DPI_STRONG_WARNING_THRESHOLD) {
            findings.push(finding("low-dpi-strong", "warning", page.id, [panel.id], `${name} has ${Math.round(dpi)} effective DPI (below 200).`));
          } else if (dpi < DPI_OK_THRESHOLD) {
            findings.push(finding("low-dpi", "warning", page.id, [panel.id], `${name} has ${Math.round(dpi)} effective DPI (recommended 300 or higher).`));
          }
        }
        const check = checks.get(asset.id);
        if (check?.status === "changed") {
          findings.push({
            ...finding("changed-source", "warning", page.id, [panel.id], `${asset.sourceName} changed since import and has not been refreshed.`),
            assetId: asset.id,
            fix: check.file ? { kind: "refresh-source", label: "Refresh source", assetId: asset.id, panelId: panel.id, pageId: page.id } : undefined,
          });
        }
        if (asset.kind === "tiff") {
          findings.push(finding("source-fallback", "info", page.id, [panel.id], `${asset.sourceName} uses a first-page PNG preview for display and PowerPoint export.`));
        }
      }
    });

    for (let left = 0; left < page.panels.length; left += 1) {
      for (let right = left + 1; right < page.panels.length; right += 1) {
        const a = page.panels[left];
        const b = page.panels[right];
        if (intersects(a.geometry, b.geometry)) {
          findings.push(finding("panel-overlap", "warning", page.id, [a.id, b.id], `${panelName(a, types.get(a.typeId)?.name)} overlaps ${panelName(b, types.get(b.typeId)?.name)}.`));
        }
      }
    }

    const labelsByText = new Map<string, Panel[]>();
    labels.forEach(({ panel, bounds }) => {
      const text = panel.label.text.trim();
      labelsByText.set(text, [...(labelsByText.get(text) ?? []), panel]);
      if (outsideBounds(bounds, page.definition)) {
        findings.push(finding("label-outside-page", "warning", page.id, [panel.id], `Label ${text} extends outside ${page.name}.`));
      }
      page.panels.forEach((candidate) => {
        if (intersects(bounds, candidate.geometry)) {
          findings.push(finding("label-panel-collision", "warning", page.id, [panel.id, candidate.id], `Label ${text} overlaps panel content.`));
        }
      });
    });
    labelsByText.forEach((duplicates, text) => {
      if (duplicates.length > 1) findings.push({
        ...finding("duplicate-visible-label", "warning", page.id, duplicates.map((panel) => panel.id), `Visible label ${text} is duplicated on ${page.name}.`),
        fix: { kind: "relabel-page", label: "Relabel page", pageId: page.id },
      });
    });
    for (let left = 0; left < labels.length; left += 1) {
      for (let right = left + 1; right < labels.length; right += 1) {
        if (intersects(labels[left].bounds, labels[right].bounds)) {
          findings.push(finding("label-label-collision", "warning", page.id, [labels[left].panel.id, labels[right].panel.id], `Labels ${labels[left].panel.label.text} and ${labels[right].panel.label.text} overlap.`));
        }
      }
    }

    const panelsByType = new Map<string, Panel[]>();
    page.panels.forEach((panel) => panelsByType.set(panel.typeId, [...(panelsByType.get(panel.typeId) ?? []), panel]));
    panelsByType.forEach((sameType, typeId) => {
      if (sameType.length < 2) return;
      const scales = sameType.map(getPanelScalePercent);
      if (Math.max(...scales) - Math.min(...scales) <= SCALE_CONSISTENCY_TOLERANCE_PERCENT) return;
      const typeName = types.get(typeId)?.name ?? typeId;
      findings.push(finding("inconsistent-type-scale", "warning", page.id, sameType.map((panel) => panel.id), `${typeName} panels use inconsistent displayed scales (${scales.map((scale) => `${formatNumber(scale)}%`).join(", ")}).`));
    });
  });

  return findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)
    || (pageOrder.get(a.pageId ?? "") ?? Number.MAX_SAFE_INTEGER) - (pageOrder.get(b.pageId ?? "") ?? Number.MAX_SAFE_INTEGER)
    || a.id.localeCompare(b.id));
}

export function summarizeReview(findings: readonly ReviewFinding[]): ReviewSummary {
  return findings.reduce<ReviewSummary>((summary, finding) => ({
    ...summary,
    [finding.severity === "error" ? "errors" : finding.severity === "warning" ? "warnings" : "info"]:
      summary[finding.severity === "error" ? "errors" : finding.severity === "warning" ? "warnings" : "info"] + 1,
  }), { errors: 0, warnings: 0, info: 0 });
}

export function effectiveDpi(panel: Panel, intrinsicWidthPx: number, intrinsicHeightPx: number): number {
  if (intrinsicWidthPx <= 0 || intrinsicHeightPx <= 0 || panel.geometry.widthMm <= 0 || panel.geometry.heightMm <= 0) return 0;
  return Math.min(
    intrinsicWidthPx / (panel.geometry.widthMm / 25.4),
    intrinsicHeightPx / (panel.geometry.heightMm / 25.4),
  );
}

export function movePanelInsideSafeMargin(panel: Panel, page: PageDefinition): Panel {
  const maxX = page.widthMm - page.marginMm - panel.geometry.widthMm;
  const maxY = page.heightMm - page.marginMm - panel.geometry.heightMm;
  if (maxX < page.marginMm || maxY < page.marginMm) return panel;
  return {
    ...panel,
    geometry: {
      ...panel.geometry,
      xMm: roundMm(Math.min(Math.max(panel.geometry.xMm, page.marginMm), maxX)),
      yMm: roundMm(Math.min(Math.max(panel.geometry.yMm, page.marginMm), maxY)),
    },
  };
}

function finding(code: string, severity: ReviewSeverity, pageId: string, panelIds: readonly string[], message: string): ReviewFinding {
  const ids = [...new Set(panelIds)].sort();
  return { id: `${code}:${pageId}:${ids.join("+")}`, code, severity, pageId, panelIds: ids, message };
}

function panelName(panel: Panel, typeName?: string): string {
  return panel.label.visible && panel.label.text.trim() ? `Panel ${panel.label.text.trim()}` : `${typeName ?? "Panel"} panel`;
}

function outsideBounds(bounds: PanelGeometry, page: PageDefinition): boolean {
  return bounds.xMm < -GEOMETRY_EPSILON_MM || bounds.yMm < -GEOMETRY_EPSILON_MM
    || bounds.xMm + bounds.widthMm > page.widthMm + GEOMETRY_EPSILON_MM
    || bounds.yMm + bounds.heightMm > page.heightMm + GEOMETRY_EPSILON_MM;
}

function safeMarginIntrusion(bounds: PanelGeometry, page: PageDefinition): number {
  return Math.max(
    0,
    page.marginMm - bounds.xMm,
    page.marginMm - bounds.yMm,
    bounds.xMm + bounds.widthMm - (page.widthMm - page.marginMm),
    bounds.yMm + bounds.heightMm - (page.heightMm - page.marginMm),
  );
}

function minimumEdgeDistance(bounds: PanelGeometry, page: PageDefinition): number {
  return Math.min(bounds.xMm, bounds.yMm, page.widthMm - bounds.xMm - bounds.widthMm, page.heightMm - bounds.yMm - bounds.heightMm);
}

function intersects(a: PanelGeometry, b: PanelGeometry): boolean {
  return Math.min(a.xMm + a.widthMm, b.xMm + b.widthMm) - Math.max(a.xMm, b.xMm) > GEOMETRY_EPSILON_MM
    && Math.min(a.yMm + a.heightMm, b.yMm + b.heightMm) - Math.max(a.yMm, b.yMm) > GEOMETRY_EPSILON_MM;
}

function severityRank(severity: ReviewSeverity): number {
  return severity === "error" ? 0 : severity === "warning" ? 1 : 2;
}

function stableToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function formatNumber(value: number): string {
  return roundMm(value).toFixed(1).replace(/\.0$/, "");
}
