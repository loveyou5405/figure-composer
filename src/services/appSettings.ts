import type { AutoLayoutPreferences, EditorDocument } from "../domain/editorDocument";
import { createInitialEditorDocument } from "../domain/editorDocument";
import { DEFAULT_LABEL_SETTINGS, type ProjectLabelSettings } from "../domain/labels";
import type { PanelPreset, PanelTypeDefinition } from "../domain/preset";

export const APP_SETTINGS_STORAGE_KEY = "figure-composer:settings:v1";

export interface AppSettings {
  readonly schemaVersion: "1";
  readonly preferences: {
    readonly showGrid: boolean;
    readonly showMargins: boolean;
    readonly zoomPercent: number;
  };
  readonly panelTypes: readonly PanelTypeDefinition[];
  readonly panelPresets: readonly PanelPreset[];
  readonly manuscriptStyleProfiles: readonly ProjectLabelSettings[];
  readonly recentSettings: {
    readonly layout: AutoLayoutPreferences;
    readonly label: ProjectLabelSettings;
  };
}

export function createDefaultAppSettings(): AppSettings {
  const document = createInitialEditorDocument();
  return {
    schemaVersion: "1",
    preferences: { showGrid: true, showMargins: true, zoomPercent: 70 },
    panelTypes: document.types,
    panelPresets: document.presets,
    manuscriptStyleProfiles: [document.project.labelSettings],
    recentSettings: {
      layout: document.layoutSettings,
      label: document.project.labelSettings,
    },
  };
}

export function loadAppSettings(storage: Pick<Storage, "getItem">): AppSettings {
  const fallback = createDefaultAppSettings();
  const value = storage.getItem(APP_SETTINGS_STORAGE_KEY);
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as Partial<AppSettings>;
    if (parsed.schemaVersion !== "1" || !parsed.preferences || !Array.isArray(parsed.panelTypes)
      || !Array.isArray(parsed.panelPresets) || !parsed.recentSettings) return fallback;
    const presetIds = new Set(parsed.panelPresets.map((preset) => preset.id));
    if (parsed.panelTypes.some((type) => !presetIds.has(type.presetId))) return fallback;
    return {
      ...fallback,
      ...parsed,
      preferences: { ...fallback.preferences, ...parsed.preferences },
      manuscriptStyleProfiles: Array.isArray(parsed.manuscriptStyleProfiles)
        ? parsed.manuscriptStyleProfiles.map((profile) => ({ ...DEFAULT_LABEL_SETTINGS, ...profile }))
        : fallback.manuscriptStyleProfiles,
      recentSettings: {
        layout: { ...fallback.recentSettings.layout, ...parsed.recentSettings.layout },
        label: { ...fallback.recentSettings.label, ...parsed.recentSettings.label },
      },
    };
  } catch {
    return fallback;
  }
}

export function saveAppSettings(storage: Pick<Storage, "setItem">, settings: AppSettings): void {
  storage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function createEditorDocumentFromSettings(settings: AppSettings): EditorDocument {
  const initial = createInitialEditorDocument();
  return {
    ...initial,
    types: settings.panelTypes.map((type) => ({ ...type })),
    presets: settings.panelPresets.map((preset) => ({ ...preset })),
    layoutSettings: { ...settings.recentSettings.layout },
    project: {
      ...initial.project,
      labelSettings: { ...settings.recentSettings.label },
    },
  };
}
