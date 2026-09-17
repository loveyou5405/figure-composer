import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportedAsset } from "../src/domain/asset";
import { createInitialEditorDocument, type EditorDocument } from "../src/domain/editorDocument";
import { createDefaultPanelLabel } from "../src/domain/labels";
import type { Panel } from "../src/domain/panel";
import {
  PROJECT_SCHEMA_VERSION,
  applyProjectMigrations,
  deserializeProjectFile,
  serializeProjectFile,
} from "../src/domain/projectFile";
import { appendA4Page, updateProjectPagePanels } from "../src/domain/project";
import { AUTOSAVE_DELAY_MS, clearRecovery, readRecovery, scheduleRecovery, writeRecovery } from "../src/services/recovery";
import { saveProjectDocument, type FilePickerWindow, type ProjectFileHandle } from "../src/services/projectFileIo";

afterEach(() => vi.useRealTimers());

const asset: ImportedAsset = {
  id: "asset-1",
  sourceName: "WB_A.tif",
  mimeType: "image/tiff",
  kind: "tiff",
  intrinsicWidthPx: 1200,
  intrinsicHeightPx: 600,
  byteSize: 4242,
  lastModified: 123456,
  previewUrl: "blob:live-preview",
};

function documentWithPanel(): EditorDocument {
  const initial = createInitialEditorDocument();
  const project = appendA4Page(initial.project);
  const pageId = project.pages[1].id;
  const panel: Panel = {
    id: "panel-1",
    pageId,
    assetId: asset.id,
    typeId: "wb",
    presetId: "preset-wb",
    baseSizeMm: { widthMm: 64, heightMm: 32 },
    geometry: { xMm: 18, yMm: 25, widthMm: 32, heightMm: 16 },
    aspectRatioLocked: true,
    manualScaleOverride: false,
    label: { ...createDefaultPanelLabel(), text: "A" },
  };
  return {
    ...initial,
    assets: [asset],
    project: updateProjectPagePanels(project, pageId, () => [panel]),
    layoutSettings: { mode: "compact", gapMm: 4.5, autoPagination: false, allowMinorScaling: true },
  };
}

describe("versioned .figproj persistence", () => {
  it("round-trips all canonical multi-page document data without embedding source bytes", () => {
    const source = documentWithPanel();
    const json = serializeProjectFile(source, "2026-09-17T00:00:00.000Z");
    expect(json).not.toContain("blob:live-preview");
    expect(json).not.toContain("data:image");
    const loaded = deserializeProjectFile(json);
    expect(loaded.project).toEqual(source.project);
    expect(loaded.project.pages).toHaveLength(2);
    expect(loaded.project.pages[1].panels[0].geometry).toEqual({ xMm: 18, yMm: 25, widthMm: 32, heightMm: 16 });
    expect(loaded.types).toEqual(source.types);
    expect(loaded.presets).toEqual(source.presets);
    expect(loaded.layoutSettings).toEqual(source.layoutSettings);
    expect(loaded.assets[0]).toMatchObject({ id: asset.id, previewUrl: "", missing: true });
  });

  it("reattaches an available non-destructive source by stable metadata", () => {
    const source = documentWithPanel();
    const loaded = deserializeProjectFile(serializeProjectFile(source), [asset]);
    expect(loaded.assets[0].previewUrl).toBe("blob:live-preview");
    expect(loaded.assets[0].missing).toBe(false);
  });

  it("rejects unsupported schema versions and accepts an explicit migration chain", () => {
    const legacy = { schemaVersion: "0.0.0", value: 1 };
    expect(() => applyProjectMigrations(legacy)).toThrow(/Unsupported project schema version/);
    const migrated = applyProjectMigrations(legacy, [{
      from: "0.0.0",
      to: PROJECT_SCHEMA_VERSION,
      migrate: (source) => ({ ...source, schemaVersion: PROJECT_SCHEMA_VERSION }),
    }]);
    expect(migrated).toMatchObject({ schemaVersion: PROJECT_SCHEMA_VERSION, value: 1 });
  });

  it("rejects project files with duplicate page ownership", () => {
    const source = documentWithPanel();
    const parsed = JSON.parse(serializeProjectFile(source));
    parsed.project.pages[0].id = parsed.project.pages[1].id;
    expect(() => deserializeProjectFile(JSON.stringify(parsed))).toThrow(/Duplicate or empty page ID/);
  });

  it("writes, reads, and clears recovery data through a storage-compatible boundary", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const source = documentWithPanel();
    writeRecovery(storage, source);
    expect(readRecovery(storage)?.project).toEqual(source.project);
    clearRecovery(storage);
    expect(readRecovery(storage)).toBeNull();
  });

  it("debounces recovery writes until the configured quiet period", () => {
    vi.useFakeTimers();
    const setItem = vi.fn();
    const cancel = scheduleRecovery({ setItem }, documentWithPanel());
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 1);
    expect(setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(setItem).toHaveBeenCalledTimes(1);
    cancel();
  });

  it("reuses an existing writable file handle for Save", async () => {
    let written = "";
    let closed = false;
    const handle: ProjectFileHandle = {
      name: "Figure.figproj",
      createWritable: async () => ({
        write: async (value) => { written = String(value); },
        close: async () => { closed = true; },
      }),
    };
    const result = await saveProjectDocument(
      documentWithPanel(),
      handle,
      false,
      { document: {} } as FilePickerWindow,
    );
    expect(result).toEqual({ handle, cancelled: false, usedDownloadFallback: false });
    expect(JSON.parse(written).schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(closed).toBe(true);
  });
});
