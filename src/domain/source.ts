import type { ImportedAsset } from "./asset";
import type { EditorDocument } from "./editorDocument";
import { getPowerPointReferenceSizeMm, roundMm, type Panel, type PanelGeometry } from "./panel";
import { applyPresetToPanel, type PanelPreset } from "./preset";

export type SourceSizingMode = "preserve-width" | "reapply-preset";

export interface SourceFingerprint {
  readonly sourceName: string;
  readonly byteSize: number;
  readonly lastModified: number;
}

export function getAssetFingerprint(asset: Pick<ImportedAsset, "sourceName" | "byteSize" | "lastModified">): SourceFingerprint {
  return {
    sourceName: asset.sourceName,
    byteSize: asset.byteSize,
    lastModified: asset.lastModified,
  };
}

export function getFileFingerprint(file: Pick<File, "name" | "size" | "lastModified">): SourceFingerprint {
  return {
    sourceName: file.name,
    byteSize: file.size,
    lastModified: file.lastModified,
  };
}

export function sourceFingerprintChanged(
  expected: SourceFingerprint,
  current: SourceFingerprint,
): boolean {
  return expected.sourceName !== current.sourceName
    || expected.byteSize !== current.byteSize
    || expected.lastModified !== current.lastModified;
}

export function replacePanelSource(
  document: EditorDocument,
  panelId: string,
  replacement: ImportedAsset,
  sizingMode: SourceSizingMode,
): EditorDocument {
  let replacedAssetId: string | null = null;
  let found = false;
  const pages = document.project.pages.map((page) => ({
    ...page,
    panels: page.panels.map((panel) => {
      if (panel.id !== panelId) return panel;
      found = true;
      replacedAssetId = panel.assetId;
      const preset = getPanelPreset(document.presets, panel);
      return updatePanelForSource(panel, replacement, sizingMode, preset, page.definition);
    }),
  }));
  if (!found || !replacedAssetId) throw new Error(`Panel ${panelId} was not found.`);
  if (document.assets.some((asset) => asset.id === replacement.id)) {
    throw new Error(`Replacement asset ID ${replacement.id} is already in use.`);
  }
  const retainedAssetIds = new Set(pages.flatMap((page) => page.panels.map((panel) => panel.assetId)));
  return {
    ...document,
    project: { ...document.project, pages },
    assets: [
      ...document.assets.filter((asset) => asset.id !== replacedAssetId || retainedAssetIds.has(asset.id)),
      normalizeLiveAsset(replacement, replacement.id),
    ],
  };
}

export function refreshAssetSource(
  document: EditorDocument,
  assetId: string,
  refreshed: ImportedAsset,
  sizingMode: SourceSizingMode,
): EditorDocument {
  if (!document.assets.some((asset) => asset.id === assetId)) throw new Error(`Asset ${assetId} was not found.`);
  const pages = document.project.pages.map((page) => ({
    ...page,
    panels: page.panels.map((panel) => {
      if (panel.assetId !== assetId) return panel;
      const preset = getPanelPreset(document.presets, panel);
      return updatePanelForSource(panel, refreshed, sizingMode, preset, page.definition, assetId);
    }),
  }));
  return {
    ...document,
    project: { ...document.project, pages },
    assets: document.assets.map((asset) => asset.id === assetId
      ? normalizeLiveAsset({ ...refreshed, sourceReference: refreshed.sourceReference ?? asset.sourceReference }, assetId)
      : asset),
  };
}

/** Relinking restores the logical source record without changing any panel geometry or metadata. */
export function relinkAssetSource(
  document: EditorDocument,
  assetId: string,
  relinked: ImportedAsset,
): EditorDocument {
  if (!document.assets.some((asset) => asset.id === assetId)) throw new Error(`Asset ${assetId} was not found.`);
  return {
    ...document,
    assets: document.assets.map((asset) => asset.id === assetId ? normalizeLiveAsset(relinked, assetId) : asset),
  };
}

function updatePanelForSource(
  panel: Panel,
  source: ImportedAsset,
  sizingMode: SourceSizingMode,
  preset: PanelPreset,
  page: Parameters<typeof applyPresetToPanel>[3],
  assetId = source.id,
): Panel {
  const baseSizeMm = getPowerPointReferenceSizeMm(source.intrinsicWidthPx, source.intrinsicHeightPx);
  const withSource = { ...panel, assetId, baseSizeMm };
  if (sizingMode === "reapply-preset") {
    return applyPresetToPanel(withSource, panel.typeId, preset, page);
  }
  return {
    ...withSource,
    geometry: geometryPreservingWidthAndCenter(
      panel.geometry,
      source.intrinsicWidthPx / source.intrinsicHeightPx,
    ),
  };
}

export function geometryPreservingWidthAndCenter(
  current: PanelGeometry,
  nextAspectRatio: number,
): PanelGeometry {
  if (!Number.isFinite(nextAspectRatio) || nextAspectRatio <= 0) {
    throw new Error("Replacement source must have a positive aspect ratio.");
  }
  const centerY = current.yMm + current.heightMm / 2;
  const heightMm = roundMm(current.widthMm / nextAspectRatio);
  return {
    xMm: current.xMm,
    yMm: roundMm(centerY - heightMm / 2),
    widthMm: current.widthMm,
    heightMm,
  };
}

function getPanelPreset(presets: readonly PanelPreset[], panel: Panel): PanelPreset {
  const preset = presets.find((candidate) => candidate.id === panel.presetId);
  if (!preset) throw new Error(`Panel ${panel.id} references a missing preset.`);
  return preset;
}

function normalizeLiveAsset(asset: ImportedAsset, id: string): ImportedAsset {
  return {
    ...asset,
    id,
    missing: false,
    sourceReference: asset.sourceReference ?? asset.sourceName,
  };
}
