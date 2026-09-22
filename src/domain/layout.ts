import { getPageMargins, type PageDefinition } from "./page";
import { roundMm, snapMm, type Panel, type PanelGeometry } from "./panel";

export type AlignmentOperation = "left" | "horizontal-center" | "right" | "top" | "vertical-center" | "bottom";
export type AlignmentTarget = "selection" | "page";
export type DistributionAxis = "horizontal" | "vertical";
export type EqualSizeOperation = "width" | "height";

export interface AlignmentGuide {
  readonly axis: "vertical" | "horizontal";
  readonly positionMm: number;
  readonly source: "page" | "panel";
}

export interface MovePanelsOptions {
  readonly snapping?: boolean;
  readonly toleranceMm?: number;
}

export interface MovePanelsResult {
  readonly panels: Panel[];
  readonly deltaXMm: number;
  readonly deltaYMm: number;
  readonly guides: readonly AlignmentGuide[];
}

interface Bounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
}

interface SnapCandidate {
  readonly adjustment: number;
  readonly positionMm: number;
  readonly source: AlignmentGuide["source"];
}

export function getCollectiveBounds(panels: readonly Panel[]): Bounds {
  if (panels.length === 0) throw new Error("At least one panel is required.");
  const left = Math.min(...panels.map((panel) => panel.geometry.xMm));
  const right = Math.max(...panels.map((panel) => panel.geometry.xMm + panel.geometry.widthMm));
  const top = Math.min(...panels.map((panel) => panel.geometry.yMm));
  const bottom = Math.max(...panels.map((panel) => panel.geometry.yMm + panel.geometry.heightMm));
  return {
    left,
    right,
    top,
    bottom,
    centerX: roundMm((left + right) / 2),
    centerY: roundMm((top + bottom) / 2),
    width: roundMm(right - left),
    height: roundMm(bottom - top),
  };
}

export function moveSelectedPanels(
  panels: readonly Panel[],
  selectedPanelIds: ReadonlySet<string>,
  desiredDeltaXMm: number,
  desiredDeltaYMm: number,
  page: PageDefinition,
  options: MovePanelsOptions = {},
): MovePanelsResult {
  const selected = panels.filter((panel) => selectedPanelIds.has(panel.id));
  if (selected.length === 0) {
    return { panels: [...panels], deltaXMm: 0, deltaYMm: 0, guides: [] };
  }
  const bounds = getCollectiveBounds(selected);
  let deltaXMm = clamp(desiredDeltaXMm, -bounds.left, page.widthMm - bounds.right);
  let deltaYMm = clamp(desiredDeltaYMm, -bounds.top, page.heightMm - bounds.bottom);
  const guides: AlignmentGuide[] = [];

  if (options.snapping !== false) {
    const toleranceMm = Math.max(0, options.toleranceMm ?? 2);
    const others = panels.filter((panel) => !selectedPanelIds.has(panel.id));
    const xSnap = findAxisSnap(bounds, others, page, deltaXMm, toleranceMm, "x");
    const ySnap = findAxisSnap(bounds, others, page, deltaYMm, toleranceMm, "y");
    if (xSnap) {
      deltaXMm += xSnap.adjustment;
      guides.push({ axis: "vertical", positionMm: xSnap.positionMm, source: xSnap.source });
    } else {
      deltaXMm = snapMm(bounds.left + deltaXMm, page.gridMm) - bounds.left;
    }
    if (ySnap) {
      deltaYMm += ySnap.adjustment;
      guides.push({ axis: "horizontal", positionMm: ySnap.positionMm, source: ySnap.source });
    } else {
      deltaYMm = snapMm(bounds.top + deltaYMm, page.gridMm) - bounds.top;
    }
  }

  const clampedX = clamp(deltaXMm, -bounds.left, page.widthMm - bounds.right);
  const clampedY = clamp(deltaYMm, -bounds.top, page.heightMm - bounds.bottom);
  const finalGuides = guides.filter((guide) => guide.axis === "vertical"
    ? nearlyEqual(clampedX, deltaXMm)
    : nearlyEqual(clampedY, deltaYMm));
  deltaXMm = roundMm(clampedX);
  deltaYMm = roundMm(clampedY);

  return {
    panels: panels.map((panel) => selectedPanelIds.has(panel.id)
      ? {
          ...panel,
          geometry: {
            ...panel.geometry,
            xMm: roundMm(panel.geometry.xMm + deltaXMm),
            yMm: roundMm(panel.geometry.yMm + deltaYMm),
          },
        }
      : panel),
    deltaXMm,
    deltaYMm,
    guides: finalGuides,
  };
}

export function alignSelectedPanels(
  panels: readonly Panel[],
  selectedPanelIds: ReadonlySet<string>,
  anchorPanelId: string,
  operation: AlignmentOperation,
  target: AlignmentTarget,
  page: PageDefinition,
): Panel[] {
  const selected = panels.filter((panel) => selectedPanelIds.has(panel.id));
  if (selected.length < 2) return [...panels];

  if (target === "page") {
    const margins = getPageMargins(page);
    const bounds = getCollectiveBounds(selected);
    let deltaX = 0;
    let deltaY = 0;
    if (operation === "left") deltaX = margins.leftMm - bounds.left;
    if (operation === "horizontal-center") deltaX = page.widthMm / 2 - bounds.centerX;
    if (operation === "right") deltaX = page.widthMm - margins.rightMm - bounds.right;
    if (operation === "top") deltaY = margins.topMm - bounds.top;
    if (operation === "vertical-center") deltaY = page.heightMm / 2 - bounds.centerY;
    if (operation === "bottom") deltaY = page.heightMm - margins.bottomMm - bounds.bottom;
    return moveSelectedPanels(panels, selectedPanelIds, deltaX, deltaY, page, { snapping: false }).panels;
  }

  const anchor = selected.find((panel) => panel.id === anchorPanelId);
  if (!anchor) throw new Error("The anchor panel must be selected.");
  return panels.map((panel) => {
    if (!selectedPanelIds.has(panel.id) || panel.id === anchorPanelId) return panel;
    const geometry = { ...panel.geometry };
    if (operation === "left") geometry.xMm = anchor.geometry.xMm;
    if (operation === "horizontal-center") {
      geometry.xMm = anchor.geometry.xMm + anchor.geometry.widthMm / 2 - panel.geometry.widthMm / 2;
    }
    if (operation === "right") {
      geometry.xMm = anchor.geometry.xMm + anchor.geometry.widthMm - panel.geometry.widthMm;
    }
    if (operation === "top") geometry.yMm = anchor.geometry.yMm;
    if (operation === "vertical-center") {
      geometry.yMm = anchor.geometry.yMm + anchor.geometry.heightMm / 2 - panel.geometry.heightMm / 2;
    }
    if (operation === "bottom") {
      geometry.yMm = anchor.geometry.yMm + anchor.geometry.heightMm - panel.geometry.heightMm;
    }
    return { ...panel, geometry: clampGeometryPosition(geometry, page) };
  });
}

export function distributeSelectedPanels(
  panels: readonly Panel[],
  selectedPanelIds: ReadonlySet<string>,
  axis: DistributionAxis,
): Panel[] {
  const selected = panels
    .filter((panel) => selectedPanelIds.has(panel.id))
    .sort(geometricComparator(axis));
  if (selected.length < 3) return [...panels];
  const first = selected[0];
  const last = selected[selected.length - 1];
  const span = axis === "horizontal"
    ? last.geometry.xMm + last.geometry.widthMm - first.geometry.xMm
    : last.geometry.yMm + last.geometry.heightMm - first.geometry.yMm;
  const occupied = selected.reduce((sum, panel) => sum + (
    axis === "horizontal" ? panel.geometry.widthMm : panel.geometry.heightMm
  ), 0);
  const gap = roundMm((span - occupied) / (selected.length - 1));
  const positions = new Map<string, number>();
  let cursor = axis === "horizontal" ? first.geometry.xMm : first.geometry.yMm;
  selected.forEach((panel, index) => {
    if (index === selected.length - 1) {
      positions.set(panel.id, axis === "horizontal" ? panel.geometry.xMm : panel.geometry.yMm);
      return;
    }
    positions.set(panel.id, roundMm(cursor));
    cursor += (axis === "horizontal" ? panel.geometry.widthMm : panel.geometry.heightMm) + gap;
  });
  return panels.map((panel) => positions.has(panel.id)
    ? {
        ...panel,
        geometry: {
          ...panel.geometry,
          ...(axis === "horizontal"
            ? { xMm: positions.get(panel.id)! }
            : { yMm: positions.get(panel.id)! }),
        },
      }
    : panel);
}

export function setSelectedPanelGap(
  panels: readonly Panel[],
  selectedPanelIds: ReadonlySet<string>,
  axis: DistributionAxis,
  gapMm: number,
  page: PageDefinition,
): Panel[] {
  if (!Number.isFinite(gapMm) || gapMm < 0) throw new Error("Gap must be a non-negative finite millimeter value.");
  const selected = panels
    .filter((panel) => selectedPanelIds.has(panel.id))
    .sort(geometricComparator(axis));
  if (selected.length < 2) return [...panels];
  const limit = axis === "horizontal" ? page.widthMm : page.heightMm;
  const requiredSpan = selected.reduce((sum, panel) => sum + (
    axis === "horizontal" ? panel.geometry.widthMm : panel.geometry.heightMm
  ), 0) + gapMm * (selected.length - 1);
  if (requiredSpan > limit) return [...panels];
  const positions = new Map<string, number>();
  let cursor = axis === "horizontal" ? selected[0].geometry.xMm : selected[0].geometry.yMm;
  selected.forEach((panel) => {
    positions.set(panel.id, roundMm(cursor));
    cursor += (axis === "horizontal" ? panel.geometry.widthMm : panel.geometry.heightMm) + gapMm;
  });

  const extent = cursor - gapMm;
  const firstPosition = positions.get(selected[0].id)!;
  const shift = extent > limit ? limit - extent : firstPosition < 0 ? -firstPosition : 0;
  return panels.map((panel) => positions.has(panel.id)
    ? {
        ...panel,
        geometry: {
          ...panel.geometry,
          ...(axis === "horizontal"
            ? { xMm: roundMm(positions.get(panel.id)! + shift) }
            : { yMm: roundMm(positions.get(panel.id)! + shift) }),
        },
      }
    : panel);
}

export function equalizeSelectedPanelSize(
  panels: readonly Panel[],
  selectedPanelIds: ReadonlySet<string>,
  anchorPanelId: string,
  operation: EqualSizeOperation,
  page: PageDefinition,
): Panel[] {
  const anchor = panels.find((panel) => panel.id === anchorPanelId && selectedPanelIds.has(panel.id));
  if (!anchor) throw new Error("The anchor panel must be selected.");
  return panels.map((panel) => {
    if (!selectedPanelIds.has(panel.id) || panel.id === anchorPanelId) return panel;
    const ratio = panel.geometry.widthMm / panel.geometry.heightMm;
    const widthMm = operation === "width"
      ? anchor.geometry.widthMm
      : anchor.geometry.heightMm * ratio;
    const heightMm = operation === "height"
      ? anchor.geometry.heightMm
      : anchor.geometry.widthMm / ratio;
    const geometry = resizeAroundCenter(panel.geometry, roundMm(widthMm), roundMm(heightMm), page);
    return { ...panel, geometry, manualScaleOverride: true };
  });
}

function findAxisSnap(
  bounds: Bounds,
  others: readonly Panel[],
  page: PageDefinition,
  delta: number,
  toleranceMm: number,
  axis: "x" | "y",
): SnapCandidate | null {
  const margins = getPageMargins(page);
  const moving = axis === "x"
    ? [bounds.left + delta, bounds.centerX + delta, bounds.right + delta]
    : [bounds.top + delta, bounds.centerY + delta, bounds.bottom + delta];
  const pagePairs = axis === "x"
    ? [[moving[0], margins.leftMm], [moving[1], page.widthMm / 2], [moving[2], page.widthMm - margins.rightMm]]
    : [[moving[0], margins.topMm], [moving[1], page.heightMm / 2], [moving[2], page.heightMm - margins.bottomMm]];
  const candidates: SnapCandidate[] = pagePairs.map(([movingPosition, target]) => ({
    adjustment: target - movingPosition,
    positionMm: target,
    source: "page",
  }));
  for (const panel of others) {
    const target = axis === "x"
      ? [panel.geometry.xMm, panel.geometry.xMm + panel.geometry.widthMm / 2, panel.geometry.xMm + panel.geometry.widthMm]
      : [panel.geometry.yMm, panel.geometry.yMm + panel.geometry.heightMm / 2, panel.geometry.yMm + panel.geometry.heightMm];
    for (let index = 0; index < moving.length; index += 1) {
      candidates.push({
        adjustment: target[index] - moving[index],
        positionMm: target[index],
        source: "panel",
      });
    }
  }
  let best: SnapCandidate | null = null;
  for (const candidate of candidates) {
    if (Math.abs(candidate.adjustment) > toleranceMm) continue;
    if (!best || Math.abs(candidate.adjustment) < Math.abs(best.adjustment)) best = candidate;
  }
  return best;
}

function geometricComparator(axis: DistributionAxis) {
  return (a: Panel, b: Panel): number => {
    const primary = axis === "horizontal"
      ? a.geometry.xMm - b.geometry.xMm
      : a.geometry.yMm - b.geometry.yMm;
    if (!nearlyEqual(primary, 0)) return primary;
    const secondary = axis === "horizontal"
      ? a.geometry.yMm - b.geometry.yMm
      : a.geometry.xMm - b.geometry.xMm;
    return !nearlyEqual(secondary, 0) ? secondary : a.id.localeCompare(b.id);
  };
}

function resizeAroundCenter(
  geometry: PanelGeometry,
  widthMm: number,
  heightMm: number,
  page: PageDefinition,
): PanelGeometry {
  const centerX = geometry.xMm + geometry.widthMm / 2;
  const centerY = geometry.yMm + geometry.heightMm / 2;
  return {
    xMm: roundMm(clamp(centerX - widthMm / 2, 0, Math.max(0, page.widthMm - widthMm))),
    yMm: roundMm(clamp(centerY - heightMm / 2, 0, Math.max(0, page.heightMm - heightMm))),
    widthMm,
    heightMm,
  };
}

function clampGeometryPosition(geometry: PanelGeometry, page: PageDefinition): PanelGeometry {
  return {
    ...geometry,
    xMm: roundMm(clamp(geometry.xMm, 0, Math.max(0, page.widthMm - geometry.widthMm))),
    yMm: roundMm(clamp(geometry.yMm, 0, Math.max(0, page.heightMm - geometry.heightMm))),
  };
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.0005;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
