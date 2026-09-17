import { describe, expect, it } from "vitest";
import {
  APP_SETTINGS_STORAGE_KEY,
  createDefaultAppSettings,
  createEditorDocumentFromSettings,
  loadAppSettings,
  saveAppSettings,
} from "../src/services/appSettings";

function storageFixture() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    values,
  };
}

describe("persistent application settings", () => {
  it("provides stable defaults outside disposable session temp", () => {
    const settings = loadAppSettings(storageFixture());
    expect(settings.schemaVersion).toBe("1");
    expect(settings.preferences).toEqual({ showGrid: true, showMargins: true, zoomPercent: 70 });
    expect(settings.panelTypes.length).toBeGreaterThan(0);
    expect(settings.panelPresets.length).toBeGreaterThan(0);
    expect(settings.manuscriptStyleProfiles).toHaveLength(1);
  });

  it("round-trips preferences, presets, profiles, and recent settings", () => {
    const storage = storageFixture();
    const defaults = createDefaultAppSettings();
    const changed = {
      ...defaults,
      preferences: { showGrid: false, showMargins: true, zoomPercent: 125 },
      panelPresets: defaults.panelPresets.map((preset) => preset.id === "preset-wb" ? { ...preset, scalePercent: 55 } : preset),
    };
    saveAppSettings(storage, changed);
    const restored = loadAppSettings(storage);
    expect(restored.preferences.zoomPercent).toBe(125);
    expect(restored.panelPresets.find((preset) => preset.id === "preset-wb")?.scalePercent).toBe(55);
    expect(storage.values.has(APP_SETTINGS_STORAGE_KEY)).toBe(true);
  });

  it("falls back conservatively for malformed or referentially invalid settings", () => {
    const malformed = storageFixture();
    malformed.setItem(APP_SETTINGS_STORAGE_KEY, "not-json");
    expect(loadAppSettings(malformed)).toEqual(createDefaultAppSettings());

    const invalid = storageFixture();
    invalid.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({
      ...createDefaultAppSettings(),
      panelPresets: [],
    }));
    expect(loadAppSettings(invalid)).toEqual(createDefaultAppSettings());
  });

  it("applies saved reusable settings to new projects without sharing mutable arrays", () => {
    const settings = createDefaultAppSettings();
    const document = createEditorDocumentFromSettings(settings);
    expect(document.types).toEqual(settings.panelTypes);
    expect(document.presets).toEqual(settings.panelPresets);
    expect(document.project.labelSettings).toEqual(settings.recentSettings.label);
    expect(document.types).not.toBe(settings.panelTypes);
    expect(document.presets).not.toBe(settings.panelPresets);
  });
});
