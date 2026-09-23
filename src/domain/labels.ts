import type { PageDefinition } from "./page";
import { roundMm, type Panel, type PanelGeometry } from "./panel";

export type PanelLabelMode = "auto" | "manual";
export type LabelOffsetMode = "automatic" | "manual";
export type LabelSequenceMode = "continuous" | "restart-per-page";
export type LabelLetterCase = "uppercase" | "lowercase";
export type ManualLabelPolicy = "preserve" | "replace";

export interface PanelLabel {
  readonly text: string;
  readonly mode: PanelLabelMode;
  readonly visible: boolean;
  readonly offsetXmm: number;
  readonly offsetYmm: number;
  readonly offsetMode: LabelOffsetMode;
}

export interface ProjectLabelSettings {
  readonly fontFamily: string;
  readonly fontSizePt: number;
  readonly bold: boolean;
  readonly color: string;
  readonly defaultOffsetXmm: number;
  readonly defaultOffsetYmm: number;
  readonly rowToleranceMm: number;
  readonly sequenceMode: LabelSequenceMode;
  readonly letterCase: LabelLetterCase;
}

export interface PanelLayoutFootprint {
  /** Extents relative to the panel image's top-left corner. */
  readonly leftMm: number;
  readonly topMm: number;
  readonly rightMm: number;
  readonly bottomMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface LabelPageLike {
  readonly id: string;
  readonly figureId?: string;
  readonly definition: PageDefinition;
  readonly panels: readonly Panel[];
}

export type LabelValidationCode =
  | "duplicate-visible-label"
  | "missing-visible-label"
  | "label-outside-page"
  | "manual-override";

export interface LabelValidationWarning {
  readonly code: LabelValidationCode;
  readonly pageId: string;
  readonly panelId: string;
  readonly message: string;
}

export const DEFAULT_LABEL_SETTINGS: ProjectLabelSettings = {
  fontFamily: "Arial",
  fontSizePt: 10,
  bold: true,
  color: "#000000",
  defaultOffsetXmm: -2,
  defaultOffsetYmm: -2,
  rowToleranceMm: 5,
  sequenceMode: "continuous",
  letterCase: "uppercase",
};

export function createDefaultPanelLabel(
  settings: ProjectLabelSettings = DEFAULT_LABEL_SETTINGS,
): PanelLabel {
  return {
    text: "",
    mode: "auto",
    visible: true,
    offsetXmm: settings.defaultOffsetXmm,
    offsetYmm: settings.defaultOffsetYmm,
    offsetMode: "automatic",
  };
}

export function alphabeticLabel(
  index: number,
  letterCase: LabelLetterCase = "uppercase",
): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Label index must be a non-negative integer.");
  }
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return letterCase === "lowercase" ? result.toLowerCase() : result;
}

export function getPanelReadingOrder(
  panels: readonly Panel[],
  rowToleranceMm = DEFAULT_LABEL_SETTINGS.rowToleranceMm,
): Panel[] {
  if (!Number.isFinite(rowToleranceMm) || rowToleranceMm < 0) {
    throw new Error("Row tolerance must be a non-negative millimeter value.");
  }
  const candidates = panels.filter((panel) => panel.label.visible);
  const byTop = [...candidates].sort(compareGeometryTopFirst);
  const rows: Array<{ topY: number; centerY: number; labelY: number; panels: Panel[] }> = [];

  byTop.forEach((panel) => {
    const topY = panel.geometry.yMm;
    const centerY = panel.geometry.yMm + panel.geometry.heightMm / 2;
    const labelY = panel.geometry.yMm + panel.label.offsetYmm;
    const row = rows.find((candidate) => (
      Math.abs(topY - candidate.topY) <= rowToleranceMm
      || Math.abs(centerY - candidate.centerY) <= rowToleranceMm
      || Math.abs(labelY - candidate.labelY) <= rowToleranceMm
    ));
    if (row) row.panels.push(panel);
    else rows.push({ topY, centerY, labelY, panels: [panel] });
  });

  return rows
    .sort((a, b) => a.topY - b.topY)
    .flatMap((row) => row.panels.sort(compareGeometryLeftFirst));
}

export function autoLabelPanels(
  panels: readonly Panel[],
  options: {
    readonly rowToleranceMm?: number;
    readonly startIndex?: number;
    readonly panelIds?: ReadonlySet<string>;
    readonly manualPolicy?: ManualLabelPolicy;
    readonly letterCase?: LabelLetterCase;
  } = {},
): Panel[] {
  const {
    rowToleranceMm = DEFAULT_LABEL_SETTINGS.rowToleranceMm,
    startIndex = 0,
    panelIds,
    manualPolicy = "preserve",
    letterCase = "uppercase",
  } = options;
  if (!Number.isInteger(startIndex) || startIndex < 0) {
    throw new Error("Start index must be a non-negative integer.");
  }
  const eligible = panels.filter((panel) => !panelIds || panelIds.has(panel.id));
  const order = getPanelReadingOrder(eligible, rowToleranceMm);
  const assignments = new Map(order.map((panel, index) => [
    panel.id,
    alphabeticLabel(startIndex + index, letterCase),
  ]));

  return panels.map((panel) => {
    const text = assignments.get(panel.id);
    if (text === undefined) return panel;
    if (manualPolicy === "preserve" && panel.label.mode === "manual") return panel;
    return { ...panel, label: { ...panel.label, text, mode: "auto" } };
  });
}

export function getPageLabelStartIndex(
  pages: readonly LabelPageLike[],
  pageId: string,
  settings: Pick<ProjectLabelSettings, "rowToleranceMm" | "sequenceMode">,
): number {
  if (settings.sequenceMode === "restart-per-page") return 0;
  const pageIndex = pages.findIndex((page) => page.id === pageId);
  if (pageIndex < 0) throw new Error(`Unknown page: ${pageId}`);
  const figureId = pages[pageIndex].figureId ?? "legacy-figure";
  return pages.slice(0, pageIndex)
    .filter((page) => (page.figureId ?? "legacy-figure") === figureId)
    .reduce((count, page) => count + getPanelReadingOrder(page.panels, settings.rowToleranceMm).length, 0);
}

export function autoLabelOrderedPages<TPage extends LabelPageLike>(
  pages: readonly TPage[],
  settings: ProjectLabelSettings,
  manualPolicy: ManualLabelPolicy = "preserve",
): TPage[] {
  let startIndex = 0;
  let currentFigureId: string | undefined;
  return pages.map((page, pageIndex) => {
    const figureId = page.figureId ?? "legacy-figure";
    if (pageIndex > 0 && figureId !== currentFigureId) startIndex = 0;
    const panels = autoLabelPanels(page.panels, {
      rowToleranceMm: settings.rowToleranceMm,
      startIndex: settings.sequenceMode === "continuous" ? startIndex : 0,
      manualPolicy,
      letterCase: settings.letterCase,
    });
    if (settings.sequenceMode === "continuous") {
      startIndex += getPanelReadingOrder(page.panels, settings.rowToleranceMm).length;
    }
    currentFigureId = figureId;
    return { ...page, panels };
  });
}

export function applyLabelLetterCaseToAutomaticLabels(
  panels: readonly Panel[],
  letterCase: LabelLetterCase,
): Panel[] {
  return panels.map((panel) => panel.label.mode === "auto" && panel.label.text
    ? {
        ...panel,
        label: {
          ...panel.label,
          text: letterCase === "lowercase"
            ? panel.label.text.toLowerCase()
            : panel.label.text.toUpperCase(),
        },
      }
    : panel);
}

export function updatePanelLabelText(panel: Panel, text: string): Panel {
  return {
    ...panel,
    label: { ...panel.label, text: text.slice(0, 24), mode: "manual" },
  };
}

export function updatePanelLabelVisibility(panel: Panel, visible: boolean): Panel {
  return { ...panel, label: { ...panel.label, visible } };
}

export function updatePanelLabelOffset(panel: Panel, offsetXmm: number, offsetYmm: number): Panel {
  if (![offsetXmm, offsetYmm].every(Number.isFinite)) return panel;
  return {
    ...panel,
    label: { ...panel.label, offsetXmm, offsetYmm, offsetMode: "manual" },
  };
}

export function resetPanelLabelOffset(panel: Panel, settings: ProjectLabelSettings): Panel {
  return {
    ...panel,
    label: {
      ...panel.label,
      offsetXmm: settings.defaultOffsetXmm,
      offsetYmm: settings.defaultOffsetYmm,
      offsetMode: "automatic",
    },
  };
}

export function applyDefaultOffsetsToAutomaticLabels(
  panels: readonly Panel[],
  settings: ProjectLabelSettings,
): Panel[] {
  return panels.map((panel) => panel.label.offsetMode === "automatic"
    ? resetPanelLabelOffset(panel, settings)
    : panel);
}

export function getPanelLabelBoundsMm(
  panel: Panel,
  settings: ProjectLabelSettings,
): PanelGeometry {
  const heightMm = settings.fontSizePt * 25.4 / 72;
  // One em per character is a conservative cross-font bound (including wide Latin/CJK glyphs).
  const widthMm = Math.max(heightMm * 0.6, panel.label.text.length * heightMm);
  return {
    xMm: panel.geometry.xMm + panel.label.offsetXmm,
    yMm: panel.geometry.yMm + panel.label.offsetYmm - heightMm,
    widthMm,
    heightMm,
  };
}

export function getPanelLayoutFootprintMm(
  panel: Panel,
  settings: ProjectLabelSettings,
  scaleFactor = 1,
): PanelLayoutFootprint {
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
    throw new Error("Panel layout scale must be a positive finite value.");
  }
  const imageWidthMm = roundMm(panel.geometry.widthMm * scaleFactor);
  const imageHeightMm = roundMm(panel.geometry.heightMm * scaleFactor);
  if (!panel.label.visible || !panel.label.text.trim()) {
    return {
      leftMm: 0,
      topMm: 0,
      rightMm: imageWidthMm,
      bottomMm: imageHeightMm,
      widthMm: imageWidthMm,
      heightMm: imageHeightMm,
    };
  }
  const labelBounds = getPanelLabelBoundsMm({
    ...panel,
    geometry: { xMm: 0, yMm: 0, widthMm: imageWidthMm, heightMm: imageHeightMm },
  }, settings);
  const leftMm = Math.min(0, labelBounds.xMm);
  const topMm = Math.min(0, labelBounds.yMm);
  const rightMm = Math.max(imageWidthMm, labelBounds.xMm + labelBounds.widthMm);
  const bottomMm = Math.max(imageHeightMm, labelBounds.yMm + labelBounds.heightMm);
  return {
    leftMm: roundMm(leftMm),
    topMm: roundMm(topMm),
    rightMm: roundMm(rightMm),
    bottomMm: roundMm(bottomMm),
    widthMm: roundMm(rightMm - leftMm),
    heightMm: roundMm(bottomMm - topMm),
  };
}

export function getPanelVisualBoundsMm(
  panel: Panel,
  settings: ProjectLabelSettings,
): PanelGeometry {
  const footprint = getPanelLayoutFootprintMm(panel, settings);
  return {
    xMm: roundMm(panel.geometry.xMm + footprint.leftMm),
    yMm: roundMm(panel.geometry.yMm + footprint.topMm),
    widthMm: footprint.widthMm,
    heightMm: footprint.heightMm,
  };
}

export function getLabelValidationWarnings(
  pages: readonly LabelPageLike[],
  settings: ProjectLabelSettings,
): LabelValidationWarning[] {
  const warnings: LabelValidationWarning[] = [];
  pages.forEach((page) => {
    const labels = new Map<string, Panel[]>();
    page.panels.forEach((panel) => {
      if (!panel.label.visible) return;
      const text = panel.label.text.trim();
      if (!text) {
        warnings.push({
          code: "missing-visible-label",
          pageId: page.id,
          panelId: panel.id,
          message: "Visible panel label is empty.",
        });
      } else {
        labels.set(text, [...(labels.get(text) ?? []), panel]);
      }
      if (panel.label.mode === "manual") {
        warnings.push({
          code: "manual-override",
          pageId: page.id,
          panelId: panel.id,
          message: `Label ${text || "(empty)"} is manually overridden.`,
        });
      }
      const bounds = getPanelLabelBoundsMm(panel, settings);
      if (
        bounds.xMm < 0
        || bounds.yMm < 0
        || bounds.xMm + bounds.widthMm > page.definition.widthMm
        || bounds.yMm + bounds.heightMm > page.definition.heightMm
      ) {
        warnings.push({
          code: "label-outside-page",
          pageId: page.id,
          panelId: panel.id,
          message: `Label ${text || "(empty)"} extends outside the page.`,
        });
      }
    });
    labels.forEach((duplicates, text) => {
      if (duplicates.length < 2) return;
      duplicates.forEach((panel) => warnings.push({
        code: "duplicate-visible-label",
        pageId: page.id,
        panelId: panel.id,
        message: `Visible label ${text} is duplicated on this page.`,
      }));
    });
  });
  return warnings;
}

function compareGeometryTopFirst(a: Panel, b: Panel): number {
  return a.geometry.yMm - b.geometry.yMm
    || a.geometry.xMm - b.geometry.xMm
    || a.geometry.widthMm - b.geometry.widthMm
    || a.geometry.heightMm - b.geometry.heightMm;
}

function compareGeometryLeftFirst(a: Panel, b: Panel): number {
  return a.geometry.xMm - b.geometry.xMm
    || a.geometry.yMm - b.geometry.yMm
    || a.geometry.widthMm - b.geometry.widthMm
    || a.geometry.heightMm - b.geometry.heightMm;
}
