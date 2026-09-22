import { describe, expect, it } from "vitest";
import type { ImportedAsset } from "../src/domain/asset";
import { createInitialEditorDocument, type EditorDocument } from "../src/domain/editorDocument";
import { commitHistory, createHistory, undoHistory } from "../src/domain/history";
import { createDefaultPanelLabel } from "../src/domain/labels";
import type { Panel } from "../src/domain/panel";
import { updateProjectPagePanels } from "../src/domain/project";
import {
  geometryPreservingWidthAndCenter,
  refreshAssetSource,
  relinkAssetSource,
  replacePanelSource,
  sourceFingerprintChanged,
} from "../src/domain/source";
import {
  checkAssetSources,
  summarizeSourceChecks,
  type SourceBinding,
} from "../src/services/sourceTracking";

const originalAsset: ImportedAsset = {
  id: "asset-original",
  sourceName: "Fig3A_WB.svg",
  mimeType: "image/svg+xml",
  kind: "svg",
  intrinsicWidthPx: 800,
  intrinsicHeightPx: 400,
  byteSize: 1000,
  lastModified: 100,
  previewUrl: "blob:original",
};

function replacementAsset(width = 1200, height = 600): ImportedAsset {
  return {
    id: "asset-replacement",
    sourceName: "Fig3A_WB_v2.svg",
    mimeType: "image/svg+xml",
    kind: "svg",
    intrinsicWidthPx: width,
    intrinsicHeightPx: height,
    byteSize: 1500,
    lastModified: 200,
    previewUrl: "blob:replacement",
  };
}

function documentWithPanel(secondReference = false): EditorDocument {
  const initial = createInitialEditorDocument();
  const pageId = initial.project.pages[0].id;
  const panel: Panel = {
    id: "panel-1",
    pageId,
    assetId: originalAsset.id,
    typeId: "wb",
    presetId: "preset-wb",
    baseSizeMm: { widthMm: 64, heightMm: 32 },
    geometry: { xMm: 20, yMm: 30, widthMm: 40, heightMm: 20 },
    aspectRatioLocked: true,
    manualScaleOverride: true,
    label: { ...createDefaultPanelLabel(), text: "A", mode: "manual" },
  };
  return {
    ...initial,
    assets: [originalAsset],
    project: updateProjectPagePanels(initial.project, pageId, () => secondReference
      ? [panel, { ...panel, id: "panel-2", geometry: { ...panel.geometry, xMm: 70 } }]
      : [panel]),
  };
}

describe("source replacement geometry", () => {
  it("preserves width and center for a same-aspect source", () => {
    expect(geometryPreservingWidthAndCenter(
      { xMm: 20, yMm: 30, widthMm: 40, heightMm: 20 },
      2,
    )).toEqual({ xMm: 20, yMm: 30, widthMm: 40, heightMm: 20 });
  });

  it("recalculates height while preserving width and center for a different aspect ratio", () => {
    expect(geometryPreservingWidthAndCenter(
      { xMm: 20, yMm: 30, widthMm: 40, heightMm: 20 },
      1,
    )).toEqual({ xMm: 20, yMm: 20, widthMm: 40, heightMm: 40 });
  });

  it("replaces only the selected panel source while preserving scientific metadata", () => {
    const source = documentWithPanel(true);
    const replaced = replacePanelSource(source, "panel-1", replacementAsset(600, 600), "preserve-width");
    const [first, second] = replaced.project.pages[0].panels;
    expect(first).toMatchObject({
      id: "panel-1",
      pageId: source.project.pages[0].id,
      assetId: "asset-replacement",
      typeId: "wb",
      presetId: "preset-wb",
      manualScaleOverride: true,
      label: source.project.pages[0].panels[0].label,
      geometry: { xMm: 20, yMm: 20, widthMm: 40, heightMm: 40 },
    });
    expect(second.assetId).toBe(originalAsset.id);
    expect(replaced.assets.map((asset) => asset.id)).toEqual([originalAsset.id, "asset-replacement"]);
  });

  it("reapplies the existing preset as the optional replacement sizing mode", () => {
    const source = documentWithPanel();
    const replaced = replacePanelSource(source, "panel-1", replacementAsset(600, 600), "reapply-preset");
    const panel = replaced.project.pages[0].panels[0];
    expect(panel.geometry.widthMm).toBe(79.375);
    expect(panel.geometry.heightMm).toBe(79.375);
    expect(panel.manualScaleOverride).toBe(false);
    expect(panel.typeId).toBe("wb");
    expect(panel.label.text).toBe("A");
  });

  it("refreshes every panel linked to one asset and keeps the stable asset ID", () => {
    const refreshed = refreshAssetSource(documentWithPanel(true), originalAsset.id, replacementAsset(600, 600), "preserve-width");
    expect(refreshed.assets).toHaveLength(1);
    expect(refreshed.assets[0]).toMatchObject({ id: originalAsset.id, sourceName: "Fig3A_WB_v2.svg", missing: false });
    expect(refreshed.project.pages[0].panels.every((panel) => panel.assetId === originalAsset.id)).toBe(true);
    expect(refreshed.project.pages[0].panels.map((panel) => panel.geometry.heightMm)).toEqual([40, 40]);
  });

  it("preserves a persisted desktop source path when refreshing through its live binding", () => {
    const source = { ...documentWithPanel(), assets: [{ ...originalAsset, sourceReference: "C:\\figures\\Fig3A_WB.svg" }] };
    const refreshed = refreshAssetSource(source, originalAsset.id, replacementAsset(), "preserve-width");
    expect(refreshed.assets[0].sourceReference).toBe("C:\\figures\\Fig3A_WB.svg");
  });

  it("relinks a missing source without changing layout or panel metadata", () => {
    const source = {
      ...documentWithPanel(),
      assets: [{ ...originalAsset, previewUrl: "", missing: true }],
    };
    const relinked = relinkAssetSource(source, originalAsset.id, replacementAsset(600, 600));
    expect(relinked.project).toBe(source.project);
    expect(relinked.assets[0]).toMatchObject({ id: originalAsset.id, missing: false, previewUrl: "blob:replacement" });
  });

  it("undoes a source replacement as one history transaction", () => {
    const source = documentWithPanel();
    const replaced = replacePanelSource(source, "panel-1", replacementAsset(), "preserve-width");
    const history = commitHistory(createHistory(source), replaced, "Replace source");
    expect(undoHistory(history).present).toBe(source);
  });
});

describe("source change detection abstraction", () => {
  it("compares name, byte size, and modified time rather than filename alone", () => {
    expect(sourceFingerprintChanged(
      { sourceName: "figure.svg", byteSize: 10, lastModified: 1 },
      { sourceName: "figure.svg", byteSize: 11, lastModified: 1 },
    )).toBe(true);
    expect(sourceFingerprintChanged(
      { sourceName: "figure.svg", byteSize: 10, lastModified: 1 },
      { sourceName: "figure.svg", byteSize: 10, lastModified: 1 },
    )).toBe(false);
  });

  it("detects changed and unchanged sources through refreshable bindings", async () => {
    const unchangedFile = { name: originalAsset.sourceName, size: originalAsset.byteSize, lastModified: originalAsset.lastModified } as File;
    const changedFile = { name: originalAsset.sourceName, size: originalAsset.byteSize + 1, lastModified: 200 } as File;
    const unchanged: SourceBinding = { capability: "refreshable", getFile: async () => unchangedFile };
    const changed: SourceBinding = { capability: "refreshable", getFile: async () => changedFile };
    expect((await checkAssetSources([originalAsset], new Map([[originalAsset.id, unchanged]])))[0].status).toBe("unchanged");
    expect((await checkAssetSources([originalAsset], new Map([[originalAsset.id, changed]])))[0].status).toBe("changed");
  });

  it("reports missing saved sources and unavailable browser snapshots honestly", async () => {
    const missing = { ...originalAsset, previewUrl: "", missing: true };
    const results = await checkAssetSources([missing, { ...originalAsset, id: "snapshot" }], new Map());
    expect(results.map((result) => result.status)).toEqual(["missing", "unavailable"]);
    expect(summarizeSourceChecks(results)).toEqual({ changed: 0, missing: 1, unchanged: 0, unavailable: 1 });
  });

  it("reports a refreshable source as missing when its handle can no longer resolve it", async () => {
    const missingHandle: SourceBinding = {
      capability: "refreshable",
      getFile: async () => { throw Object.assign(new Error("gone"), { name: "NotFoundError" }); },
    };
    const [result] = await checkAssetSources([originalAsset], new Map([[originalAsset.id, missingHandle]]));
    expect(result.status).toBe("missing");
  });
});
