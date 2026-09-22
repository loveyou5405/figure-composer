import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { ImportedAsset } from "../src/domain/asset";
import { createInitialEditorDocument, type EditorDocument } from "../src/domain/editorDocument";
import { createDefaultPanelLabel } from "../src/domain/labels";
import type { Panel } from "../src/domain/panel";
import { serializeProjectFile } from "../src/domain/projectFile";
import { updateProjectPagePanels } from "../src/domain/project";
import {
  createPortableProjectBlob,
  loadProjectDocument,
  PORTABLE_PROJECT_CONTAINER_VERSION,
  PORTABLE_PROJECT_MIME,
  type PortableProjectManifest,
} from "../src/services/portableProject";
import { createSnapshotSourceBinding } from "../src/services/sourceTracking";

const originalBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function sourceFile(bytes: Uint8Array = originalBytes): File {
  return new File([bytes], "source.png", { type: "image/png", lastModified: 1234 });
}

function portableDocument(): EditorDocument {
  const initial = createInitialEditorDocument();
  const pageId = initial.project.pages[0].id;
  const asset: ImportedAsset = {
    id: "asset-portable",
    sourceName: "source.png",
    mimeType: "image/png",
    kind: "png",
    intrinsicWidthPx: 640,
    intrinsicHeightPx: 320,
    byteSize: originalBytes.byteLength,
    lastModified: 1234,
    previewUrl: "blob:original-preview",
    sourceKind: "file",
  };
  const panel: Panel = {
    id: "panel-portable",
    pageId,
    assetId: asset.id,
    typeId: "wb",
    presetId: "preset-wb",
    baseSizeMm: { widthMm: 169.333, heightMm: 84.667 },
    geometry: { xMm: 18, yMm: 22, widthMm: 84.667, heightMm: 42.333 },
    aspectRatioLocked: true,
    manualScaleOverride: false,
    label: { ...createDefaultPanelLabel(), text: "A" },
  };
  return {
    ...initial,
    assets: [asset],
    project: updateProjectPagePanels(initial.project, pageId, () => [panel]),
  };
}

async function mockAssetLoader(file: File): Promise<ImportedAsset> {
  return {
    id: "decoded-id",
    sourceName: file.name,
    mimeType: file.type,
    kind: "png",
    intrinsicWidthPx: 640,
    intrinsicHeightPx: 320,
    byteSize: file.size,
    lastModified: file.lastModified,
    previewUrl: "blob:restored-preview",
  };
}

describe("portable Figure projects", () => {
  it("stores exact source bytes and restores an editable document without external files", async () => {
    const document = portableDocument();
    const source = sourceFile();
    const blob = await createPortableProjectBlob(
      document,
      new Map([[document.assets[0].id, createSnapshotSourceBinding(source)]]),
      "2026-09-22T00:00:00.000Z",
    );
    expect(blob.type).toBe(PORTABLE_PROJECT_MIME);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file("project.json")!.async("text")) as PortableProjectManifest;
    expect(manifest.containerVersion).toBe(PORTABLE_PROJECT_CONTAINER_VERSION);
    expect(manifest.assets).toHaveLength(1);
    expect([...await zip.file(manifest.assets[0].path)!.async("uint8array")]).toEqual([...originalBytes]);

    const loaded = await loadProjectDocument(
      new File([blob], "portable.figproj", { type: blob.type }),
      [],
      mockAssetLoader,
    );
    expect(loaded.portable).toBe(true);
    expect(loaded.document.project).toEqual(document.project);
    expect(loaded.document.assets[0]).toMatchObject({
      id: document.assets[0].id,
      sourceName: "source.png",
      missing: false,
      previewUrl: "blob:restored-preview",
    });
    const restoredSource = loaded.sourceFiles.get(document.assets[0].id)!;
    expect([...new Uint8Array(await restoredSource.arrayBuffer())]).toEqual([...originalBytes]);

    const resaved = await createPortableProjectBlob(
      loaded.document,
      new Map([[document.assets[0].id, createSnapshotSourceBinding(restoredSource)]]),
    );
    const resavedZip = await JSZip.loadAsync(await resaved.arrayBuffer());
    const resavedManifest = JSON.parse(await resavedZip.file("project.json")!.async("text")) as PortableProjectManifest;
    expect([...await resavedZip.file(resavedManifest.assets[0].path)!.async("uint8array")]).toEqual([...originalBytes]);
  });

  it("keeps legacy JSON .figproj files readable", async () => {
    const document = portableDocument();
    const loaded = await loadProjectDocument(
      new File([serializeProjectFile(document)], "legacy.figproj", { type: "application/json" }),
      [document.assets[0]],
      mockAssetLoader,
    );
    expect(loaded.portable).toBe(false);
    expect(loaded.document.project).toEqual(document.project);
    expect(loaded.document.assets[0].previewUrl).toBe("blob:original-preview");
  });

  it("refuses to save when exact source bytes are unavailable", async () => {
    await expect(createPortableProjectBlob(portableDocument(), new Map()))
      .rejects.toThrow(/no exact source bytes/i);
  });

  it("rejects a package whose embedded image bytes fail SHA-256 verification", async () => {
    const document = portableDocument();
    const blob = await createPortableProjectBlob(
      document,
      new Map([[document.assets[0].id, createSnapshotSourceBinding(sourceFile())]]),
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file("project.json")!.async("text")) as PortableProjectManifest;
    zip.file(manifest.assets[0].path, new Uint8Array(originalBytes.map((value, index) => index === 8 ? value + 1 : value)));
    const tampered = await zip.generateAsync({ type: "blob" });
    await expect(loadProjectDocument(
      new File([tampered], "tampered.figproj"),
      [],
      mockAssetLoader,
    )).rejects.toThrow(/SHA-256 integrity check/);
  });
});
