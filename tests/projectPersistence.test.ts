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
import { formatProjectFileName, saveProjectDocument, type FilePickerWindow, type ProjectFileHandle } from "../src/services/projectFileIo";

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
    baseSizeMm: { widthMm: 317.5, heightMm: 158.75 },
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
  it("formats portable project names with a local calendar date and custom title", () => {
    expect(formatProjectFileName("My Figure", new Date(2026, 8, 22))).toBe("20260922_My Figure");
    expect(formatProjectFileName("", new Date(2026, 0, 3))).toBe("20260103_Untitled figure");
  });
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

  it("loads legacy projects without Figure IDs as one continuous Figure", () => {
    const source = documentWithPanel();
    const parsed = JSON.parse(serializeProjectFile(source));
    parsed.project.pages.forEach((page: Record<string, unknown>) => { delete page.figureId; });
    const loaded = deserializeProjectFile(JSON.stringify(parsed));
    const figureIds = new Set(loaded.project.pages.map((page) => page.figureId));
    expect(figureIds.size).toBe(1);
    expect([...figureIds][0]).toBeTruthy();
  });

  it("rejects a present but invalid Figure ID instead of treating it as legacy", () => {
    const parsed = JSON.parse(serializeProjectFile(documentWithPanel()));
    parsed.project.pages[0].figureId = 123;
    expect(() => deserializeProjectFile(JSON.stringify(parsed))).toThrow(/Figure ID is invalid/);
  });

  it("reattaches an available non-destructive source by stable metadata", () => {
    const source = documentWithPanel();
    const loaded = deserializeProjectFile(serializeProjectFile(source), [asset]);
    expect(loaded.assets[0].previewUrl).toBe("blob:live-preview");
    expect(loaded.assets[0].missing).toBe(false);
  });

  it("normalizes legacy fixed panel bases to the PowerPoint 96 DPI scale reference", () => {
    const source = documentWithPanel();
    const parsed = JSON.parse(serializeProjectFile(source));
    parsed.project.pages[1].panels[0].baseSizeMm = { widthMm: 64, heightMm: 32 };
    const loaded = deserializeProjectFile(JSON.stringify(parsed));
    expect(loaded.project.pages[1].panels[0].baseSizeMm).toEqual({ widthMm: 317.5, heightMm: 158.75 });
    expect(loaded.project.pages[1].panels[0].geometry).toEqual(source.project.pages[1].panels[0].geometry);
  });

  it("round-trips clipboard provenance and quality metadata", () => {
    const source = documentWithPanel();
    const clipboardAsset: ImportedAsset = {
      ...asset,
      sourceKind: "clipboard",
      sourceApplication: "PowerPoint",
      canonicalFormat: "tiff",
      isVector: false,
      isLosslessRaster: true,
      qualityClass: "lossless-raster",
      physicalSizeSource: "clipboard",
      clipboardDiagnostics: {
        availableFormats: ["image/tiff", "image/png"],
        selectedFormat: "tiff",
        qualityClass: "lossless-raster",
        pixelWidth: 1200,
        pixelHeight: 600,
        physicalWidthMm: 52,
        physicalHeightMm: 26,
        previewConverted: true,
        canonicalFormat: "tiff",
        previewFormat: "png",
      },
    };
    const loaded = deserializeProjectFile(serializeProjectFile({ ...source, assets: [clipboardAsset] }));
    expect(loaded.assets[0]).toMatchObject({
      sourceKind: "clipboard",
      sourceApplication: "PowerPoint",
      canonicalFormat: "tiff",
      isVector: false,
      isLosslessRaster: true,
      qualityClass: "lossless-raster",
      physicalSizeSource: "clipboard",
      clipboardDiagnostics: {
        availableFormats: ["image/tiff", "image/png"],
        selectedFormat: "tiff",
        qualityClass: "lossless-raster",
        pixelWidth: 1200,
        pixelHeight: 600,
        physicalWidthMm: 52,
        physicalHeightMm: 26,
        previewConverted: true,
        canonicalFormat: "tiff",
        previewFormat: "png",
      },
    });
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
    let written: Blob | string | null = null;
    let closed = false;
    const handle: ProjectFileHandle = {
      name: "Figure.figproj",
      createWritable: async () => ({
        write: async (value) => { written = value; },
        close: async () => { closed = true; },
      }),
    };
    const projectBlob = new Blob(["portable-project"], { type: "application/octet-stream" });
    const result = await saveProjectDocument(
      projectBlob,
      "Figure",
      handle,
      false,
      { document: {} } as FilePickerWindow,
    );
    expect(result).toEqual({ handle, cancelled: false, usedDownloadFallback: false });
    expect(written).toBe(projectBlob);
    expect(closed).toBe(true);
  });
});
