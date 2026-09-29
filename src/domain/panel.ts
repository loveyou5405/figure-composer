import { getPageMargins, type PageDefinition } from "./page";
import type { PanelLabel } from "./labels";
import { createStableId } from "./id";

export interface PointMm {
  readonly xMm: number;
  readonly yMm: number;
}

export interface SizeMm {
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface PanelGeometry extends PointMm, SizeMm {}

export interface Panel {
  readonly id: string;
  readonly pageId: string;
  readonly assetId: string;
  readonly typeId: string;
  readonly presetId: string;
  readonly baseSizeMm: SizeMm;
  readonly geometry: PanelGeometry;
  readonly aspectRatioLocked: boolean;
  readonly manualScaleOverride: boolean;
  /** Set only when Auto Layout applied its optional bounded size adjustment. */
  readonly layoutScaleFactor?: number;
  /** Optional Auto Layout grouping; it does not affect label rendering or numbering. */
  readonly layoutGroupId?: string;
  readonly label: PanelLabel;
}

export const MAX_INITIAL_PANEL_SIDE_MM = 64;
export const MIN_PANEL_SIDE_MM = 8;
/** PowerPoint and DrawingML use 96 px/in as the default image-size reference. */
export const POWERPOINT_REFERENCE_DPI = 96;

export function roundMm(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function snapMm(value: number, gridMm: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(gridMm) || gridMm <= 0) {
    throw new Error("Millimeter values and grid size must be finite and the grid must be positive.");
  }
  return roundMm(Math.round(value / gridMm) * gridMm);
}

export function getInitialPanelSizeMm(
  intrinsicWidth: number,
  intrinsicHeight: number,
  maxSideMm = MAX_INITIAL_PANEL_SIDE_MM,
): SizeMm {
  if (
    !Number.isFinite(intrinsicWidth) ||
    !Number.isFinite(intrinsicHeight) ||
    intrinsicWidth <= 0 ||
    intrinsicHeight <= 0
  ) {
    throw new Error("Imported images must have positive intrinsic dimensions.");
  }

  const scale = maxSideMm / Math.max(intrinsicWidth, intrinsicHeight);
  return {
    widthMm: roundMm(intrinsicWidth * scale),
    heightMm: roundMm(intrinsicHeight * scale),
  };
}

export function getPowerPointReferenceSizeMm(
  intrinsicWidthPx: number,
  intrinsicHeightPx: number,
): SizeMm {
  if (
    !Number.isFinite(intrinsicWidthPx)
    || !Number.isFinite(intrinsicHeightPx)
    || intrinsicWidthPx <= 0
    || intrinsicHeightPx <= 0
  ) {
    throw new Error("PowerPoint scale references require positive intrinsic dimensions.");
  }
  return {
    widthMm: roundMm(intrinsicWidthPx / POWERPOINT_REFERENCE_DPI * 25.4),
    heightMm: roundMm(intrinsicHeightPx / POWERPOINT_REFERENCE_DPI * 25.4),
  };
}

export function getDefaultImportAnchor(
  page: PageDefinition,
  panelIndex: number,
): PointMm {
  const margins = getPageMargins(page);
  const offset = (panelIndex % 8) * 5;
  return {
    xMm: margins.leftMm + MAX_INITIAL_PANEL_SIDE_MM / 2 + offset,
    yMm: margins.topMm + MAX_INITIAL_PANEL_SIDE_MM / 2 + offset,
  };
}

export function placePanelGeometry(
  size: SizeMm,
  page: PageDefinition,
  anchor: PointMm,
  cascadeIndex = 0,
): PanelGeometry {
  const cascadeMm = cascadeIndex * 4;
  const maxX = Math.max(0, page.widthMm - size.widthMm);
  const maxY = Math.max(0, page.heightMm - size.heightMm);

  return {
    xMm: clamp(snapMm(anchor.xMm - size.widthMm / 2 + cascadeMm, page.gridMm), 0, maxX),
    yMm: clamp(snapMm(anchor.yMm - size.heightMm / 2 + cascadeMm, page.gridMm), 0, maxY),
    widthMm: size.widthMm,
    heightMm: size.heightMm,
  };
}

export function movePanelGeometry(
  origin: PanelGeometry,
  deltaXMm: number,
  deltaYMm: number,
  page: PageDefinition,
): PanelGeometry {
  return {
    ...origin,
    xMm: clamp(snapMm(origin.xMm + deltaXMm, page.gridMm), 0, page.widthMm - origin.widthMm),
    yMm: clamp(snapMm(origin.yMm + deltaYMm, page.gridMm), 0, page.heightMm - origin.heightMm),
  };
}

export function resizePanelGeometry(
  origin: PanelGeometry,
  deltaXMm: number,
  deltaYMm: number,
  page: PageDefinition,
  preserveAspectRatio = true,
): PanelGeometry {
  if (!preserveAspectRatio) {
    const maxWidth = Math.max(MIN_PANEL_SIDE_MM, page.widthMm - origin.xMm);
    const maxHeight = Math.max(MIN_PANEL_SIDE_MM, page.heightMm - origin.yMm);
    return {
      ...origin,
      widthMm: clamp(
        snapMm(origin.widthMm + deltaXMm, page.gridMm),
        Math.min(MIN_PANEL_SIDE_MM, maxWidth),
        maxWidth,
      ),
      heightMm: clamp(
        snapMm(origin.heightMm + deltaYMm, page.gridMm),
        Math.min(MIN_PANEL_SIDE_MM, maxHeight),
        maxHeight,
      ),
    };
  }

  const aspectRatio = origin.widthMm / origin.heightMm;
  const widthEquivalentFromY = deltaYMm * aspectRatio;
  const widthDelta =
    Math.abs(deltaXMm) >= Math.abs(widthEquivalentFromY)
      ? deltaXMm
      : widthEquivalentFromY;
  const maxWidth = Math.min(
    page.widthMm - origin.xMm,
    (page.heightMm - origin.yMm) * aspectRatio,
  );
  const minimumWidth = Math.min(
    Math.max(MIN_PANEL_SIDE_MM * aspectRatio, MIN_PANEL_SIDE_MM),
    maxWidth,
  );
  const widthMm = clamp(
    snapMm(origin.widthMm + widthDelta, page.gridMm),
    minimumWidth,
    maxWidth,
  );

  return {
    ...origin,
    widthMm: roundMm(widthMm),
    heightMm: roundMm(widthMm / aspectRatio),
  };
}

export function removePanelById(
  panels: readonly Panel[],
  panelId: string,
): Panel[] {
  return panels.filter((panel) => panel.id !== panelId);
}

export function setPanelLayoutGroup(
  panels: readonly Panel[],
  panelIds: ReadonlySet<string>,
  layoutGroupId: string | null,
): Panel[] {
  if (panelIds.size === 0) return [...panels];
  return panels.map((panel) => {
    if (!panelIds.has(panel.id)) return panel;
    if (layoutGroupId) return { ...panel, layoutGroupId };
    const { layoutGroupId: _layoutGroupId, ...ungrouped } = panel;
    return ungrouped;
  });
}

export function duplicateSelectedPanels(
  panels: readonly Panel[],
  panelIds: ReadonlySet<string>,
  page: PageDefinition,
  idFactory: () => string,
  offsetMm = 4,
  groupIdFactory: () => string = () => createStableId("panel-group"),
): { panels: Panel[]; duplicatedIds: string[] } {
  if (panelIds.size === 0) return { panels: [...panels], duplicatedIds: [] };
  const existingIds = new Set(panels.map((panel) => panel.id));
  const duplicatedIds: string[] = [];
  const duplicatedGroupIds = new Map<string, string>();
  const selected = panels.filter((panel) => panelIds.has(panel.id));
  const selectedGroupCounts = selected.reduce((counts, panel) => {
    if (panel.layoutGroupId) counts.set(panel.layoutGroupId, (counts.get(panel.layoutGroupId) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const duplicates = selected.map((panel) => {
    const id = idFactory();
    if (!id || existingIds.has(id) || duplicatedIds.includes(id)) {
      throw new Error("Duplicated panels must receive new unique IDs.");
    }
    duplicatedIds.push(id);
    const layoutGroupId = panel.layoutGroupId && (selectedGroupCounts.get(panel.layoutGroupId) ?? 0) > 1
      ? duplicatedGroupIds.get(panel.layoutGroupId) ?? groupIdFactory()
      : undefined;
    if (panel.layoutGroupId && layoutGroupId) duplicatedGroupIds.set(panel.layoutGroupId, layoutGroupId);
    const maxX = Math.max(0, page.widthMm - panel.geometry.widthMm);
    const maxY = Math.max(0, page.heightMm - panel.geometry.heightMm);
    const { layoutGroupId: _sourceLayoutGroupId, ...duplicatedPanel } = panel;
    return {
      ...duplicatedPanel,
      id,
      ...(layoutGroupId ? { layoutGroupId } : {}),
      geometry: {
        ...panel.geometry,
        xMm: clamp(snapMm(panel.geometry.xMm + offsetMm, page.gridMm), 0, maxX),
        yMm: clamp(snapMm(panel.geometry.yMm + offsetMm, page.gridMm), 0, maxY),
      },
    };
  });
  return { panels: [...panels, ...duplicates], duplicatedIds };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return roundMm(Math.min(Math.max(value, minimum), Math.max(minimum, maximum)));
}
