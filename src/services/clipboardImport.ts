import type {
  AssetQualityClass,
  CanonicalAssetFormat,
  ClipboardSourceDiagnostics,
  ImportedAsset,
  PhysicalSizeSource,
} from "../domain/asset";
import { getPageMargins, type PageDefinition } from "../domain/page";
import { roundMm, snapMm, type PanelGeometry, type SizeMm } from "../domain/panel";

const FORMAT_PRIORITY: readonly CanonicalAssetFormat[] = [
  "svg",
  "emf",
  "wmf",
  "tiff",
  "png",
  "dib",
  "jpeg",
];

const WEB_SUPPORTED_FORMATS = new Set<CanonicalAssetFormat>(["svg", "tiff", "png", "jpeg"]);
const MIME_TO_FORMAT: Readonly<Record<string, CanonicalAssetFormat>> = {
  "image/svg+xml": "svg",
  "image/emf": "emf",
  "image/x-emf": "emf",
  "application/x-emf": "emf",
  "image/wmf": "wmf",
  "image/x-wmf": "wmf",
  "application/x-wmf": "wmf",
  "image/tiff": "tiff",
  "image/tif": "tiff",
  "image/x-tiff": "tiff",
  "image/png": "png",
  "image/bmp": "dib",
  "image/x-ms-bmp": "dib",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
};

const FORMAT_EXTENSION: Readonly<Record<CanonicalAssetFormat, string>> = {
  svg: ".svg",
  emf: ".emf",
  wmf: ".wmf",
  tiff: ".tiff",
  png: ".png",
  dib: ".bmp",
  jpeg: ".jpg",
};

export interface ClipboardCandidate {
  readonly blob: Blob;
  readonly format: CanonicalAssetFormat;
  readonly mimeType: string;
  readonly name?: string;
}

export interface ClipboardImportPayload {
  readonly file: File;
  readonly canonicalFormat: CanonicalAssetFormat;
  readonly sourceApplication: "PowerPoint" | "Unknown";
  readonly physicalSizeMm: SizeMm | null;
  readonly physicalSizeSource: PhysicalSizeSource;
  readonly availableFormats: readonly string[];
}

export interface ClipboardImportProvider {
  readonly kind: "web" | "native";
  read(data: DataTransfer): Promise<ClipboardImportPayload | null>;
}

export class WebClipboardProvider implements ClipboardImportProvider {
  readonly kind = "web" as const;

  read(data: DataTransfer): Promise<ClipboardImportPayload | null> {
    return readWebClipboardPayload(data);
  }
}

export const webClipboardProvider = new WebClipboardProvider();

export interface ClipboardQualityMetadata {
  readonly sourceKind: "clipboard";
  readonly sourceApplication: "PowerPoint" | "Unknown";
  readonly canonicalFormat: CanonicalAssetFormat;
  readonly isVector: boolean;
  readonly isLosslessRaster: boolean;
  readonly qualityClass: AssetQualityClass;
  readonly physicalSizeSource: PhysicalSizeSource;
}

export function clipboardFormatForMime(mimeType: string): CanonicalAssetFormat | null {
  return MIME_TO_FORMAT[mimeType.trim().toLowerCase()] ?? null;
}

export function selectBestClipboardCandidate(
  candidates: readonly ClipboardCandidate[],
  supportedFormats: ReadonlySet<CanonicalAssetFormat> = WEB_SUPPORTED_FORMATS,
): ClipboardCandidate | null {
  return [...candidates]
    .filter((candidate) => supportedFormats.has(candidate.format))
    .sort((left, right) => FORMAT_PRIORITY.indexOf(left.format) - FORMAT_PRIORITY.indexOf(right.format))[0] ?? null;
}

export async function readWebClipboardPayload(data: DataTransfer): Promise<ClipboardImportPayload | null> {
  const html = safeClipboardText(data, "text/html");
  const plainText = safeClipboardText(data, "text/plain");
  const svgText = safeClipboardText(data, "image/svg+xml")
    || (plainText.trimStart().startsWith("<svg") ? plainText : "");
  const candidates: ClipboardCandidate[] = [];
  const availableFormats = collectAvailableClipboardFormats(data);

  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (!file) continue;
    const format = clipboardFormatForMime(file.type) ?? clipboardFormatForName(file.name);
    if (format) candidates.push({ blob: file, format, mimeType: file.type, name: file.name });
  }

  for (const file of Array.from(data.files ?? [])) {
    const format = clipboardFormatForMime(file.type) ?? clipboardFormatForName(file.name);
    if (format) candidates.push({ blob: file, format, mimeType: file.type, name: file.name });
  }

  if (svgText) {
    candidates.push({
      blob: new Blob([svgText], { type: "image/svg+xml" }),
      format: "svg",
      mimeType: "image/svg+xml",
      name: "PowerPoint clipboard.svg",
    });
  }

  const dataUrl = extractImageDataUrl(html);
  if (dataUrl) {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const format = clipboardFormatForMime(blob.type);
    if (format) candidates.push({ blob, format, mimeType: blob.type });
  }

  const candidate = selectBestClipboardCandidate(candidates);
  if (!candidate) return null;
  const sourceApplication = isPowerPointHtml(html) ? "PowerPoint" : "Unknown";
  const physicalSizeMm = parseClipboardPhysicalSizeMm(html);
  const extension = FORMAT_EXTENSION[candidate.format];
  const fileName = candidate.name && candidate.name.toLowerCase().endsWith(extension)
    ? candidate.name
    : `${sourceApplication === "PowerPoint" ? "PowerPoint" : "Clipboard"} paste${extension}`;
  const file = new File([candidate.blob], fileName, {
    type: candidate.mimeType || candidate.blob.type || mimeForFormat(candidate.format),
    lastModified: Date.now(),
  });
  return {
    file,
    canonicalFormat: candidate.format,
    sourceApplication,
    physicalSizeMm,
    physicalSizeSource: physicalSizeMm ? "clipboard" : "default",
    availableFormats,
  };
}

export function clipboardQualityMetadata(payload: ClipboardImportPayload): ClipboardQualityMetadata {
  const isVector = payload.canonicalFormat === "svg" || payload.canonicalFormat === "emf" || payload.canonicalFormat === "wmf";
  const isLosslessRaster = payload.canonicalFormat === "tiff" || payload.canonicalFormat === "png" || payload.canonicalFormat === "dib";
  return {
    sourceKind: "clipboard",
    sourceApplication: payload.sourceApplication,
    canonicalFormat: payload.canonicalFormat,
    isVector,
    isLosslessRaster,
    qualityClass: isVector
      ? "vector"
      : payload.canonicalFormat === "dib"
        ? "bitmap-fallback"
        : isLosslessRaster ? "lossless-raster" : "lossy-raster",
    physicalSizeSource: payload.physicalSizeSource,
  };
}

export function clipboardSourceDiagnostics(
  payload: ClipboardImportPayload,
  asset: Pick<ImportedAsset, "intrinsicWidthPx" | "intrinsicHeightPx">,
  previewFormatOverride?: CanonicalAssetFormat,
): ClipboardSourceDiagnostics {
  const quality = clipboardQualityMetadata(payload);
  const previewFormat = previewFormatOverride ?? previewFormatForCanonical(payload.canonicalFormat);
  return {
    availableFormats: [...payload.availableFormats],
    selectedFormat: payload.canonicalFormat,
    qualityClass: quality.qualityClass,
    ...(quality.isVector ? {} : {
      pixelWidth: asset.intrinsicWidthPx,
      pixelHeight: asset.intrinsicHeightPx,
    }),
    ...(payload.physicalSizeMm ? {
      physicalWidthMm: payload.physicalSizeMm.widthMm,
      physicalHeightMm: payload.physicalSizeMm.heightMm,
    } : {}),
    previewConverted: previewFormat !== payload.canonicalFormat,
    canonicalFormat: payload.canonicalFormat,
    previewFormat,
  };
}

export function placeClipboardPanelGeometry(
  requestedSize: SizeMm,
  page: PageDefinition,
  cascadeIndex: number,
  cascadeMm = 3,
): PanelGeometry {
  const margins = getPageMargins(page);
  const safeWidth = page.widthMm - margins.leftMm - margins.rightMm;
  const safeHeight = page.heightMm - margins.topMm - margins.bottomMm;
  const scale = Math.min(1, safeWidth / requestedSize.widthMm, safeHeight / requestedSize.heightMm);
  const size = {
    widthMm: roundMm(requestedSize.widthMm * scale),
    heightMm: roundMm(requestedSize.heightMm * scale),
  };
  const maxOffsetX = Math.max(0, safeWidth - size.widthMm);
  const maxOffsetY = Math.max(0, safeHeight - size.heightMm);
  const maxSteps = Math.max(0, Math.floor(Math.min(maxOffsetX, maxOffsetY) / cascadeMm));
  const step = maxSteps > 0 ? cascadeIndex % (maxSteps + 1) : 0;
  const offset = step * cascadeMm;
  return {
    xMm: snapMm(margins.leftMm + offset, page.gridMm),
    yMm: snapMm(margins.topMm + offset, page.gridMm),
    widthMm: size.widthMm,
    heightMm: size.heightMm,
  };
}

export function parseClipboardPhysicalSizeMm(html: string): SizeMm | null {
  if (!html) return null;
  const imageMarkup = html.match(/<img\b[^>]*>/i)?.[0] ?? html;
  const width = readCssLengthMm(imageMarkup, "width");
  const height = readCssLengthMm(imageMarkup, "height");
  if (!width || !height) return null;
  return { widthMm: roundMm(width), heightMm: roundMm(height) };
}

export function describeClipboardQuality(asset: ImportedAsset, effectiveDpi?: number): string {
  if (asset.qualityClass === "vector") return "Vector";
  const format = (asset.canonicalFormat ?? asset.kind).toUpperCase();
  const dpi = effectiveDpi && Number.isFinite(effectiveDpi) ? ` — ${Math.round(effectiveDpi)} effective DPI` : "";
  return asset.qualityClass === "bitmap-fallback" ? `Bitmap fallback${dpi}` : `${format}${dpi}`;
}

function safeClipboardText(data: DataTransfer, type: string): string {
  try {
    return data.getData(type) || "";
  } catch {
    return "";
  }
}

function collectAvailableClipboardFormats(data: DataTransfer): string[] {
  const formats = new Set<string>();
  for (const type of Array.from(data.types ?? [])) {
    if (type) formats.add(type);
  }
  for (const item of Array.from(data.items ?? [])) {
    if (item.type) formats.add(item.type);
  }
  for (const file of Array.from(data.files ?? [])) {
    if (file.type) formats.add(file.type);
  }
  return [...formats];
}

function clipboardFormatForName(name: string): CanonicalAssetFormat | null {
  const extension = name.toLowerCase().match(/\.[^.]+$/)?.[0];
  return extension === ".svg" ? "svg"
    : extension === ".emf" ? "emf"
      : extension === ".wmf" ? "wmf"
        : extension === ".tif" || extension === ".tiff" ? "tiff"
          : extension === ".png" ? "png"
            : extension === ".bmp" || extension === ".dib" ? "dib"
              : extension === ".jpg" || extension === ".jpeg" ? "jpeg" : null;
}

function extractImageDataUrl(html: string): string | null {
  const match = html.match(/(?:src|href)\s*=\s*["'](data:image\/(?:svg\+xml|png|jpeg|jpg|tiff|x-tiff);[^"']+)["']/i);
  return match?.[1]?.replace(/&amp;/g, "&") ?? null;
}

function isPowerPointHtml(html: string): boolean {
  return /powerpoint|mso-|microsoft office/i.test(html);
}

function readCssLengthMm(html: string, property: "width" | "height"): number | null {
  const match = html.match(new RegExp(`${property}\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)\\s*(mm|cm|in|pt|px)`, "i"));
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = match[2].toLowerCase();
  if (unit === "mm") return value;
  if (unit === "cm") return value * 10;
  if (unit === "in") return value * 25.4;
  if (unit === "pt") return value * 25.4 / 72;
  return value * 25.4 / 96;
}

function mimeForFormat(format: CanonicalAssetFormat): string {
  if (format === "svg") return "image/svg+xml";
  if (format === "tiff") return "image/tiff";
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "emf") return "image/emf";
  if (format === "wmf") return "image/wmf";
  return "image/bmp";
}

function previewFormatForCanonical(format: CanonicalAssetFormat): CanonicalAssetFormat {
  return format === "tiff" || format === "emf" || format === "wmf" || format === "dib" ? "png" : format;
}
