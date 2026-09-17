import type { Panel, PanelGeometry } from "./panel";

export interface PanelSelection {
  readonly selectedPanelIds: readonly string[];
  readonly anchorPanelId: string | null;
}

export const EMPTY_SELECTION: PanelSelection = Object.freeze({
  selectedPanelIds: Object.freeze([]),
  anchorPanelId: null,
});

export function selectOnlyPanel(panelId: string): PanelSelection {
  return { selectedPanelIds: [panelId], anchorPanelId: panelId };
}

export function togglePanelSelection(
  selection: PanelSelection,
  panelId: string,
): PanelSelection {
  const selected = selection.selectedPanelIds.includes(panelId);
  if (!selected) {
    return {
      selectedPanelIds: [...selection.selectedPanelIds, panelId],
      anchorPanelId: panelId,
    };
  }

  const selectedPanelIds = selection.selectedPanelIds.filter((id) => id !== panelId);
  return {
    selectedPanelIds,
    anchorPanelId: selectedPanelIds.at(-1) ?? null,
  };
}

export function selectAllPanels(panels: readonly Panel[]): PanelSelection {
  const selectedPanelIds = panels.map((panel) => panel.id);
  return {
    selectedPanelIds,
    anchorPanelId: selectedPanelIds.at(-1) ?? null,
  };
}

export function clearPanelSelection(): PanelSelection {
  return { selectedPanelIds: [], anchorPanelId: null };
}

export function selectPanelsIntersectingMarquee(
  panels: readonly Panel[],
  marquee: PanelGeometry,
  initial: PanelSelection = EMPTY_SELECTION,
): PanelSelection {
  const selectedPanelIds = [...initial.selectedPanelIds];
  for (const panel of panels) {
    if (!rectanglesIntersect(panel.geometry, marquee)) continue;
    if (!selectedPanelIds.includes(panel.id)) selectedPanelIds.push(panel.id);
  }
  return {
    selectedPanelIds,
    anchorPanelId: selectedPanelIds.at(-1) ?? null,
  };
}

export function normalizeMarqueeGeometry(
  startXmm: number,
  startYmm: number,
  endXmm: number,
  endYmm: number,
): PanelGeometry {
  return {
    xMm: Math.min(startXmm, endXmm),
    yMm: Math.min(startYmm, endYmm),
    widthMm: Math.abs(endXmm - startXmm),
    heightMm: Math.abs(endYmm - startYmm),
  };
}

function rectanglesIntersect(a: PanelGeometry, b: PanelGeometry): boolean {
  return a.xMm <= b.xMm + b.widthMm
    && a.xMm + a.widthMm >= b.xMm
    && a.yMm <= b.yMm + b.heightMm
    && a.yMm + a.heightMm >= b.yMm;
}
