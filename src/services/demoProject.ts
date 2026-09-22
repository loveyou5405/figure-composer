import type { ImportedAsset } from "../domain/asset";
import { createInitialEditorDocument, type EditorDocument } from "../domain/editorDocument";
import { autoLabelOrderedPages, createDefaultPanelLabel } from "../domain/labels";
import type { Panel } from "../domain/panel";
import { createA4Page } from "../domain/project";
import { derivePresetSizeMm, getPresetForType } from "../domain/preset";

const DEMO_ITEMS = [
  { page: 0, typeId: "wb", x: 20, y: 28, width: 100, height: 34, color: "#243B53", title: "WB" },
  { page: 0, typeId: "if", x: 20, y: 80, width: 72, height: 54, color: "#7C3AED", title: "IF" },
  { page: 0, typeId: "if", x: 104, y: 80, width: 72, height: 54, color: "#0891B2", title: "IF" },
  { page: 1, typeId: "graph", x: 24, y: 30, width: 72, height: 62, color: "#2563EB", title: "Graph" },
  { page: 1, typeId: "microscopy", x: 108, y: 30, width: 72, height: 62, color: "#DB2777", title: "Microscopy" },
  { page: 2, typeId: "schematic", x: 30, y: 38, width: 150, height: 92, color: "#059669", title: "Schematic" },
] as const;

export function createDemoProject(): EditorDocument {
  const initial = createInitialEditorDocument();
  const pages = [
    createA4Page(1, "demo-page-1", "demo-figure-1"),
    createA4Page(2, "demo-page-2", "demo-figure-1"),
    createA4Page(3, "demo-page-3", "demo-figure-1"),
  ];
  const assets: ImportedAsset[] = [];
  const panelsByPage: Panel[][] = [[], [], []];

  DEMO_ITEMS.forEach((item, index) => {
    const assetId = `demo-asset-${index + 1}`;
    const panelId = `demo-panel-${index + 1}`;
    const svg = demoSvg(item.title, item.color, index + 1);
    const baseSizeMm = { widthMm: item.width, heightMm: item.height };
    const { type, preset } = getPresetForType(initial.types, initial.presets, item.typeId);
    const size = derivePresetSizeMm(baseSizeMm, preset);
    assets.push({
      id: assetId,
      sourceName: `${item.title.toLowerCase()}_demo_${index + 1}.svg`,
      mimeType: "image/svg+xml",
      kind: "svg",
      intrinsicWidthPx: item.width * 10,
      intrinsicHeightPx: item.height * 10,
      byteSize: svg.length,
      lastModified: 0,
      previewUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      sourceReference: `bundled-demo://${assetId}`,
    });
    panelsByPage[item.page].push({
      id: panelId,
      pageId: pages[item.page].id,
      assetId,
      typeId: type.id,
      presetId: preset.id,
      baseSizeMm,
      geometry: { xMm: item.x, yMm: item.y, widthMm: size.widthMm, heightMm: size.heightMm },
      aspectRatioLocked: true,
      manualScaleOverride: false,
      label: createDefaultPanelLabel(initial.project.labelSettings),
    });
  });

  const labeledPages = autoLabelOrderedPages(
    pages.map((page, index) => ({ ...page, panels: panelsByPage[index] })),
    initial.project.labelSettings,
  );
  return {
    ...initial,
    assets,
    project: {
      ...initial.project,
      id: "demo-project",
      title: "Figure Composer Demo",
      pages: labeledPages,
    },
  };
}

function demoSvg(title: string, color: string, index: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600"><rect width="1000" height="600" fill="#f8fafc"/><rect x="24" y="24" width="952" height="552" rx="20" fill="none" stroke="${color}" stroke-width="14"/><path d="M90 450 C230 ${180 + index * 16}, 400 ${500 - index * 12}, 580 260 S820 160, 920 330" fill="none" stroke="${color}" stroke-width="20"/><text x="70" y="115" font-family="Arial" font-size="72" font-weight="700" fill="${color}">${title} demo</text></svg>`;
}
