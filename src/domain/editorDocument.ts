import type { ImportedAsset } from "./asset";
import { DEFAULT_AUTO_LAYOUT_SETTINGS, type AutoLayoutMode } from "./autoLayout";
import {
  createDefaultPanelPresets,
  createDefaultPanelTypes,
  type PanelPreset,
  type PanelTypeDefinition,
} from "./preset";
import { createInitialProject, type FigureProject } from "./project";

export interface AutoLayoutPreferences {
  readonly mode: AutoLayoutMode;
  readonly gapMm: number;
  readonly autoPagination: boolean;
  readonly allowMinorScaling: boolean;
}

export interface EditorDocument {
  readonly project: FigureProject;
  readonly assets: readonly ImportedAsset[];
  readonly types: readonly PanelTypeDefinition[];
  readonly presets: readonly PanelPreset[];
  readonly layoutSettings: AutoLayoutPreferences;
}

export const DEFAULT_LAYOUT_PREFERENCES: AutoLayoutPreferences = Object.freeze({
  mode: DEFAULT_AUTO_LAYOUT_SETTINGS.mode,
  gapMm: DEFAULT_AUTO_LAYOUT_SETTINGS.horizontalGapMm,
  autoPagination: true,
  allowMinorScaling: false,
});

export function createInitialEditorDocument(): EditorDocument {
  return {
    project: createInitialProject(),
    assets: [],
    types: createDefaultPanelTypes(),
    presets: createDefaultPanelPresets(),
    layoutSettings: { ...DEFAULT_LAYOUT_PREFERENCES },
  };
}
