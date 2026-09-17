import type { ImportedAsset, SupportedAssetKind } from "../domain/asset";
import { createStableId } from "../domain/id";
import * as UTIF from "utif";

const KIND_BY_MIME: Readonly<Record<string, SupportedAssetKind>> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/svg+xml": "svg",
  "image/tiff": "tiff",
  "image/tif": "tiff",
  "image/x-tiff": "tiff",
};

const KIND_BY_EXTENSION: Readonly<Record<string, SupportedAssetKind>> = {
  ".png": "png",
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".svg": "svg",
  ".tif": "tiff",
  ".tiff": "tiff",
};

const MAX_TIFF_PIXELS = 100_000_000;

export interface DecodedTiffPage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export class AssetImportError extends Error {
  constructor(
    public readonly filename: string,
    message: string,
  ) {
    super(message);
    this.name = "AssetImportError";
  }
}

export type AssetImportOutcome =
  | { readonly status: "accepted"; readonly file: File; readonly asset: ImportedAsset }
  | { readonly status: "rejected"; readonly file: File; readonly message: string };

export function getSupportedAssetKind(
  file: Pick<File, "name" | "type">,
): SupportedAssetKind | null {
  const normalizedMime = file.type.trim().toLowerCase();
  if (normalizedMime) return KIND_BY_MIME[normalizedMime] ?? null;

  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  return extension ? KIND_BY_EXTENSION[extension] ?? null : null;
}

export async function loadImportedAsset(file: File): Promise<ImportedAsset> {
  const kind = getSupportedAssetKind(file);
  if (!kind) {
    throw new AssetImportError(file.name, "Unsupported file. Use PNG, JPEG, SVG, or TIFF.");
  }

  let previewUrl: string | null = null;
  try {
    let dimensions: { width: number; height: number };
    if (kind === "tiff") {
      const decoded = decodeTiffFirstPage(await file.arrayBuffer());
      previewUrl = await createTiffPreviewUrl(decoded);
      dimensions = decoded;
    } else {
      previewUrl = URL.createObjectURL(file);
      dimensions = await readImageDimensions(previewUrl);
    }
    return {
      id: createStableId("asset"),
      sourceName: file.name,
      mimeType: file.type || mimeForKind(kind),
      kind,
      intrinsicWidthPx: dimensions.width,
      intrinsicHeightPx: dimensions.height,
      byteSize: file.size,
      lastModified: file.lastModified,
      previewUrl,
    };
  } catch {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    throw new AssetImportError(file.name, "The image could not be decoded.");
  }
}

export function decodeTiffFirstPage(buffer: ArrayBuffer): DecodedTiffPage {
  const pages = UTIF.decode(buffer);
  const firstPage = pages[0];
  if (!firstPage) throw new Error("TIFF contains no image pages.");
  const widthTag = firstPage.t256;
  const heightTag = firstPage.t257;
  const width = Number(Array.isArray(widthTag) ? widthTag[0] : firstPage.width);
  const height = Number(Array.isArray(heightTag) ? heightTag[0] : firstPage.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("TIFF has invalid dimensions.");
  }
  if (width * height > MAX_TIFF_PIXELS) {
    throw new Error("TIFF is too large to preview safely.");
  }
  UTIF.decodeImage(buffer, firstPage);
  const rgba = UTIF.toRGBA8(firstPage);
  if (rgba.byteLength !== width * height * 4) {
    throw new Error("TIFF pixel data is incomplete.");
  }
  return { width, height, rgba };
}

export async function loadImportedAssetBatch(
  files: readonly File[],
  loader: (file: File) => Promise<ImportedAsset> = loadImportedAsset,
): Promise<AssetImportOutcome[]> {
  const settled = await Promise.allSettled(files.map((file) => loader(file)));
  return settled.map((result, index) => {
    const file = files[index];
    if (result.status === "fulfilled") {
      return { status: "accepted", file, asset: result.value };
    }
    return {
      status: "rejected",
      file,
      message: result.reason instanceof Error ? result.reason.message : "Import failed.",
    };
  });
}

function readImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      } else {
        reject(new Error("Image has no intrinsic dimensions."));
      }
    };
    image.onerror = () => reject(new Error("Image decode failed."));
    image.src = url;
  });
}

function createTiffPreviewUrl(page: DecodedTiffPage): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = page.width;
  canvas.height = page.height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Canvas preview is unavailable."));
  context.putImageData(
    new ImageData(new Uint8ClampedArray(page.rgba), page.width, page.height),
    0,
    0,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("TIFF preview encoding failed."));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });
}

function mimeForKind(kind: SupportedAssetKind): string {
  if (kind === "jpeg") return "image/jpeg";
  if (kind === "tiff") return "image/tiff";
  return kind === "svg" ? "image/svg+xml" : "image/png";
}
