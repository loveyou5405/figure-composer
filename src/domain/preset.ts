import { createStableId } from "./id";
import type { PageDefinition } from "./page";
import {
  roundMm,
  snapMm,
  type Panel,
  type PanelGeometry,
  type SizeMm,
} from "./panel";

export interface PanelTypeDefinition {
  readonly id: string;
  readonly name: string;
  readonly presetId: string;
  readonly isCustom: boolean;
}

export interface PanelPreset {
  readonly id: string;
  readonly scalePercent: number;
  readonly lockAspectRatio: boolean;
}

export type PresetUpdateMode = "future-only" | "apply-all";

export const DEFAULT_TYPE_IDS = Object.freeze({
  WB: "wb",
  IF: "if",
  IHC: "ihc",
  GRAPH: "graph",
  FLOW: "flow",
  HEATMAP: "heatmap",
  MICROSCOPY: "microscopy",
  SCHEMATIC: "schematic",
  OTHER: "other",
});

const DEFAULT_PRESET_DATA = [
  [DEFAULT_TYPE_IDS.WB, "WB", 50],
  [DEFAULT_TYPE_IDS.IF, "IF", 40],
  [DEFAULT_TYPE_IDS.IHC, "IHC", 45],
  [DEFAULT_TYPE_IDS.GRAPH, "Graph", 60],
  [DEFAULT_TYPE_IDS.FLOW, "Flow", 60],
  [DEFAULT_TYPE_IDS.HEATMAP, "Heatmap", 60],
  [DEFAULT_TYPE_IDS.MICROSCOPY, "Microscopy", 45],
  [DEFAULT_TYPE_IDS.SCHEMATIC, "Schematic", 70],
  [DEFAULT_TYPE_IDS.OTHER, "Other", 100],
] as const;

export const DEFAULT_PANEL_TYPES: readonly PanelTypeDefinition[] = Object.freeze(
  DEFAULT_PRESET_DATA.map(([id, name]) => Object.freeze({
    id,
    name,
    presetId: `preset-${id}`,
    isCustom: false,
  })),
);

export const DEFAULT_PANEL_PRESETS: readonly PanelPreset[] = Object.freeze(
  DEFAULT_PRESET_DATA.map(([id, , scalePercent]) => Object.freeze({
    id: `preset-${id}`,
    scalePercent,
    lockAspectRatio: true,
  })),
);

export const PRESET_DIMENSION_TOLERANCE_MM = 0.02;

export function createDefaultPanelTypes(): PanelTypeDefinition[] {
  return DEFAULT_PANEL_TYPES.map((type) => ({ ...type }));
}

export function createDefaultPanelPresets(): PanelPreset[] {
  return DEFAULT_PANEL_PRESETS.map((preset) => ({ ...preset }));
}

export function inferPanelTypeIdFromFilename(filename: string): string {
  const normalized = filename.toLowerCase();
  const matchesToken = (token: string) =>
    new RegExp(`(?:^|[_\\-\\s])${token}(?=[_\\-\\s.]|$)`, "i").test(normalized);

  if (matchesToken("wb")) return DEFAULT_TYPE_IDS.WB;
  if (matchesToken("if")) return DEFAULT_TYPE_IDS.IF;
  if (matchesToken("ihc")) return DEFAULT_TYPE_IDS.IHC;
  if (matchesToken("prism") || matchesToken("graph")) return DEFAULT_TYPE_IDS.GRAPH;
  if (matchesToken("flow")) return DEFAULT_TYPE_IDS.FLOW;
  if (matchesToken("heatmap")) return DEFAULT_TYPE_IDS.HEATMAP;
  if (matchesToken("microscopy")) return DEFAULT_TYPE_IDS.MICROSCOPY;
  if (matchesToken("schematic")) return DEFAULT_TYPE_IDS.SCHEMATIC;
  return DEFAULT_TYPE_IDS.OTHER;
}

export function getPresetForType(
  types: readonly PanelTypeDefinition[],
  presets: readonly PanelPreset[],
  typeId: string,
): { type: PanelTypeDefinition; preset: PanelPreset } {
  const type = types.find((candidate) => candidate.id === typeId);
  if (!type) throw new Error(`Unknown panel type: ${typeId}`);
  const preset = presets.find((candidate) => candidate.id === type.presetId);
  if (!preset) throw new Error(`Missing preset for panel type: ${type.name}`);
  return { type, preset };
}

export function derivePresetSizeMm(
  baseSizeMm: SizeMm,
  preset: Pick<PanelPreset, "scalePercent">,
): SizeMm {
  validateScale(preset.scalePercent);
  return {
    widthMm: roundMm(baseSizeMm.widthMm * preset.scalePercent / 100),
    heightMm: roundMm(baseSizeMm.heightMm * preset.scalePercent / 100),
  };
}

export function applyTypeToPanels(
  panels: readonly Panel[],
  panelIds: ReadonlySet<string>,
  type: PanelTypeDefinition,
  preset: PanelPreset,
  page: PageDefinition,
): Panel[] {
  return panels.map((panel) => panelIds.has(panel.id)
    ? applyPresetToPanel(panel, type.id, preset, page)
    : panel);
}

export function applyPresetToPanel(
  panel: Panel,
  typeId: string,
  preset: PanelPreset,
  page: PageDefinition,
): Panel {
  return {
    ...panel,
    typeId,
    presetId: preset.id,
    geometry: geometryForSize(panel.geometry, derivePresetSizeMm(panel.baseSizeMm, preset), page),
    aspectRatioLocked: preset.lockAspectRatio,
    manualScaleOverride: false,
    layoutScaleFactor: undefined,
  };
}

export function applyManualScaleToPanel(
  panel: Panel,
  scalePercent: number,
  page: PageDefinition,
): Panel {
  validateScale(scalePercent);
  return {
    ...panel,
    geometry: geometryForSize(
      panel.geometry,
      derivePresetSizeMm(panel.baseSizeMm, { scalePercent }),
      page,
    ),
    manualScaleOverride: true,
    layoutScaleFactor: undefined,
  };
}

export function markPanelManualResize(
  panel: Panel,
  geometry: PanelGeometry,
): Panel {
  return { ...panel, geometry, manualScaleOverride: true, layoutScaleFactor: undefined };
}

export function resetPanelToPreset(
  panel: Panel,
  preset: PanelPreset,
  page: PageDefinition,
): Panel {
  return applyPresetToPanel(panel, panel.typeId, preset, page);
}

export function getPanelScalePercent(panel: Panel): number {
  return roundMm(panel.geometry.widthMm / panel.baseSizeMm.widthMm * 100);
}

export function isPanelFollowingPreset(
  panel: Panel,
  preset: PanelPreset,
  toleranceMm = PRESET_DIMENSION_TOLERANCE_MM,
): boolean {
  if (
    panel.manualScaleOverride
    || panel.presetId !== preset.id
    || panel.aspectRatioLocked !== preset.lockAspectRatio
  ) return false;
  const expected = derivePresetSizeMm(panel.baseSizeMm, preset);
  return Math.abs(panel.geometry.widthMm - expected.widthMm) <= toleranceMm
    && Math.abs(panel.geometry.heightMm - expected.heightMm) <= toleranceMm;
}

export function applyPresetUpdateToPanels(
  panels: readonly Panel[],
  nextPreset: PanelPreset,
  mode: PresetUpdateMode,
  page: PageDefinition,
): Panel[] {
  if (mode === "future-only") return [...panels];
  return panels.map((panel) => {
    if (panel.presetId !== nextPreset.id || panel.manualScaleOverride) return panel;
    return resetPanelToPreset(panel, nextPreset, page);
  });
}

export function createCustomTypeAndPreset(
  existingTypes: readonly PanelTypeDefinition[],
): { type: PanelTypeDefinition; preset: PanelPreset } {
  const customCount = existingTypes.filter((type) => type.isCustom).length + 1;
  const typeId = createStableId("type");
  const presetId = createStableId("preset");
  return {
    type: { id: typeId, name: `Custom ${customCount}`, presetId, isCustom: true },
    preset: { id: presetId, scalePercent: 100, lockAspectRatio: true },
  };
}

function geometryForSize(
  current: PanelGeometry,
  size: SizeMm,
  page: PageDefinition,
): PanelGeometry {
  const centerX = current.xMm + current.widthMm / 2;
  const centerY = current.yMm + current.heightMm / 2;
  const maxX = Math.max(0, page.widthMm - size.widthMm);
  const maxY = Math.max(0, page.heightMm - size.heightMm);
  return {
    xMm: clamp(snapMm(centerX - size.widthMm / 2, page.gridMm), 0, maxX),
    yMm: clamp(snapMm(centerY - size.heightMm / 2, page.gridMm), 0, maxY),
    widthMm: size.widthMm,
    heightMm: size.heightMm,
  };
}

function validateScale(scalePercent: number): void {
  if (!Number.isFinite(scalePercent) || scalePercent <= 0) {
    throw new Error("Scale percentage must be a positive finite number.");
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return roundMm(Math.min(Math.max(value, minimum), Math.max(minimum, maximum)));
}
