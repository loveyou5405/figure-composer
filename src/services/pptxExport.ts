import type { ImportedAsset } from "../domain/asset";
import type { EditorDocument } from "../domain/editorDocument";
import type { PanelGeometry } from "../domain/panel";
import { getProjectFigures } from "../domain/project";
import { validateDocument } from "../domain/projectFile";

export const MILLIMETERS_PER_INCH = 25.4;
export const EMU_PER_MILLIMETER = 36_000;
export const A4_WIDTH_EMU = 210 * EMU_PER_MILLIMETER;
export const A4_HEIGHT_EMU = 297 * EMU_PER_MILLIMETER;

export type PptxExportScope = "all" | "current";

export interface PptxExportOptions {
  readonly scope: PptxExportScope;
  readonly activePageId: string;
  readonly fileName?: string;
}

export interface PptxImagePlan {
  readonly panelId: string;
  readonly assetId: string;
  readonly objectName: string;
  readonly altText: string;
  readonly geometryMm: PanelGeometry;
}

export interface PptxLabelPlan {
  readonly panelId: string;
  readonly objectName: string;
  readonly text: string;
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly fontFamily: string;
  readonly fontSizePt: number;
  readonly bold: boolean;
  readonly color: string;
}

export interface PptxSlidePlan {
  readonly pageId: string;
  readonly pageName: string;
  readonly figureId: string;
  readonly figureNumber: number;
  readonly figurePageNumber: number;
  readonly images: readonly PptxImagePlan[];
  readonly labels: readonly PptxLabelPlan[];
}

export interface PptxExportPlan {
  readonly slides: readonly PptxSlidePlan[];
  readonly warnings: readonly string[];
}

export interface PptxExportResult {
  readonly blob: Blob;
  readonly fileName: string;
  readonly warnings: readonly string[];
}

export type AssetDataResolver = (asset: ImportedAsset) => Promise<string>;

export class PptxExportError extends Error {
  constructor(
    public readonly errors: readonly string[],
    public readonly warnings: readonly string[] = [],
  ) {
    super(errors.join(" "));
    this.name = "PptxExportError";
  }
}

export function mmToInches(mm: number): number {
  if (!Number.isFinite(mm)) throw new Error("Millimeter value must be finite.");
  return mm / MILLIMETERS_PER_INCH;
}

export function buildPptxExportPlan(
  editor: EditorDocument,
  options: PptxExportOptions,
): PptxExportPlan {
  validateDocument(editor);
  const pages = options.scope === "current"
    ? editor.project.pages.filter((page) => page.id === options.activePageId)
    : editor.project.pages;
  if (pages.length === 0) throw new PptxExportError(["The selected page could not be found."]);

  const pageFigurePositions = new Map<string, { figureId: string; figureNumber: number; figurePageNumber: number }>();
  getProjectFigures(editor.project).forEach((figure, figureIndex) => {
    figure.pages.forEach((page, figurePageIndex) => pageFigurePositions.set(page.id, {
      figureId: figure.id,
      figureNumber: figureIndex + 1,
      figurePageNumber: figurePageIndex + 1,
    }));
  });

  const assetsById = new Map(editor.assets.map((asset) => [asset.id, asset]));
  const typesById = new Map(editor.types.map((type) => [type.id, type]));
  const errors: string[] = [];
  const warnings: string[] = [];
  const slides = pages.map((page) => {
    const usedNames = new Map<string, number>();
    const images: PptxImagePlan[] = page.panels.map((panel, index) => {
      const asset = assetsById.get(panel.assetId)!;
      if (asset.missing || !asset.previewUrl) errors.push(`${page.name}: ${asset.sourceName} is missing. Relink it before export.`);
      if (panel.geometry.xMm < 0 || panel.geometry.yMm < 0
        || panel.geometry.xMm + panel.geometry.widthMm > page.definition.widthMm
        || panel.geometry.yMm + panel.geometry.heightMm > page.definition.heightMm) {
        warnings.push(`${page.name}: ${asset.sourceName} extends beyond the A4 page.`);
      }
      const typeName = typesById.get(panel.typeId)?.name ?? panel.typeId;
      const token = panel.label.visible && panel.label.text.trim() ? panel.label.text.trim() : String(index + 1);
      const baseName = `Panel_${sanitizeObjectName(token)}_${sanitizeObjectName(typeName)}`;
      return {
        panelId: panel.id,
        assetId: panel.assetId,
        objectName: uniqueObjectName(baseName, usedNames),
        altText: `${asset.sourceName} panel, type ${typeName}`,
        geometryMm: panel.geometry,
      };
    });
    const labels: PptxLabelPlan[] = page.panels.flatMap((panel, index) => {
      if (!panel.label.visible || !panel.label.text) return [];
      const heightMm = editor.project.labelSettings.fontSizePt * MILLIMETERS_PER_INCH / 72 * 1.25;
      const widthMm = Math.max(
        8,
        panel.label.text.length * editor.project.labelSettings.fontSizePt * MILLIMETERS_PER_INCH / 72 * 0.72 + 2,
      );
      const token = sanitizeObjectName(panel.label.text || String(index + 1));
      return [{
        panelId: panel.id,
        objectName: uniqueObjectName(`Label_${token}`, usedNames),
        text: panel.label.text,
        xMm: panel.geometry.xMm + panel.label.offsetXmm,
        yMm: panel.geometry.yMm + panel.label.offsetYmm - heightMm,
        widthMm,
        heightMm,
        fontFamily: editor.project.labelSettings.fontFamily,
        fontSizePt: editor.project.labelSettings.fontSizePt,
        bold: editor.project.labelSettings.bold,
        color: normalizeHexColor(editor.project.labelSettings.color),
      }];
    });
    const figurePosition = pageFigurePositions.get(page.id)!;
    return { pageId: page.id, pageName: page.name, ...figurePosition, images, labels };
  });

  if (errors.length > 0) throw new PptxExportError(errors, warnings);
  return { slides, warnings };
}

export async function exportPptx(
  editor: EditorDocument,
  options: PptxExportOptions,
  resolveAssetData: AssetDataResolver = resolveAssetPreviewData,
): Promise<PptxExportResult> {
  const plan = buildPptxExportPlan(editor, options);
  const assetsById = new Map(editor.assets.map((asset) => [asset.id, asset]));
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.author = "Figure Composer";
  pptx.company = "Figure Composer";
  pptx.subject = "Editable scientific figure";
  pptx.title = editor.project.title;
  pptx.defineLayout({ name: "A4_PORTRAIT", width: mmToInches(210), height: mmToInches(297) });
  pptx.layout = "A4_PORTRAIT";

  for (const slidePlan of plan.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addNotes(`Figure ${slidePlan.figureNumber}, page ${slidePlan.figurePageNumber} (${slidePlan.pageName}). Panel and label objects remain independently editable.`);

    for (const imagePlan of slidePlan.images) {
      const asset = assetsById.get(imagePlan.assetId);
      if (!asset) throw new PptxExportError([`Asset ${imagePlan.assetId} is missing from the project.`], plan.warnings);
      const data = await resolveAssetData(asset);
      slide.addImage({
        data,
        x: mmToInches(imagePlan.geometryMm.xMm),
        y: mmToInches(imagePlan.geometryMm.yMm),
        w: mmToInches(imagePlan.geometryMm.widthMm),
        h: mmToInches(imagePlan.geometryMm.heightMm),
        objectName: imagePlan.objectName,
        altText: imagePlan.altText,
      });
    }

    for (const label of slidePlan.labels) {
      slide.addText(label.text, {
        x: mmToInches(label.xMm),
        y: mmToInches(label.yMm),
        w: mmToInches(label.widthMm),
        h: mmToInches(label.heightMm),
        objectName: label.objectName,
        fontFace: label.fontFamily,
        fontSize: label.fontSizePt,
        bold: label.bold,
        color: label.color,
        margin: 0,
        breakLine: false,
        fit: "shrink",
        valign: "middle",
        isTextBox: true,
      });
    }
  }

  const value = await pptx.write({ outputType: "blob", compression: true });
  const generatedBlob = value instanceof Blob
    ? value
    : new Blob([value as BlobPart], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
  const blob = await repairPptxGenJsSlideMasterDeclarations(generatedBlob);
  return {
    blob,
    fileName: normalizePptxFileName(options.fileName ?? editor.project.title),
    warnings: plan.warnings,
  };
}

export async function repairPptxGenJsSlideMasterDeclarations(blob: Blob): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const contentTypesPart = zip.file("[Content_Types].xml");
  if (!contentTypesPart) throw new PptxExportError(["The generated PowerPoint package is missing [Content_Types].xml."]);
  const contentTypes = await contentTypesPart.async("text");
  const repaired = contentTypes.replace(
    /<Override\s+PartName="\/(ppt\/slideMasters\/slideMaster\d+\.xml)"\s+ContentType="application\/vnd\.openxmlformats-officedocument\.presentationml\.slideMaster\+xml"\s*\/>/g,
    (entry, partName: string) => zip.file(partName) ? entry : "",
  );
  if (repaired === contentTypes) return blob;
  zip.file("[Content_Types].xml", repaired);
  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

export function downloadPptx(result: PptxExportResult): void {
  const url = URL.createObjectURL(result.blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function resolveAssetPreviewData(asset: ImportedAsset): Promise<string> {
  if (asset.missing || !asset.previewUrl) throw new PptxExportError([`${asset.sourceName} is missing. Relink it before export.`]);
  const response = await fetch(asset.previewUrl);
  if (!response.ok) throw new PptxExportError([`${asset.sourceName} could not be read for export.`]);
  return blobToDataUri(await response.blob());
}

export function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Image encoding failed."));
    reader.onerror = () => reject(reader.error ?? new Error("Image encoding failed."));
    reader.readAsDataURL(blob);
  });
}

function sanitizeObjectName(value: string): string {
  const sanitized = value.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return sanitized || "Object";
}

function uniqueObjectName(base: string, counts: Map<string, number>): string {
  const count = (counts.get(base) ?? 0) + 1;
  counts.set(base, count);
  return count === 1 ? base : `${base}_${count}`;
}

function normalizeHexColor(value: string): string {
  const normalized = value.trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(normalized) ? normalized.toUpperCase() : "111111";
}

function normalizePptxFileName(value: string): string {
  const stem = value.trim().replace(/\.pptx$/i, "").replace(/[<>:"/\\|?*]+/g, "_") || "Figure";
  return `${stem}.pptx`;
}
