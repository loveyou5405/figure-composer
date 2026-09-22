import JSZip from "jszip";
import type { ImportedAsset, SupportedAssetKind } from "../domain/asset";
import type { EditorDocument } from "../domain/editorDocument";
import {
  createProjectFile,
  deserializeProjectFile,
  type FigureProjectFile,
} from "../domain/projectFile";
import { loadImportedAsset } from "./assetImport";
import type { SourceBinding } from "./sourceTracking";

export const PORTABLE_PROJECT_CONTAINER_VERSION = "1.0.0";
export const PORTABLE_PROJECT_MIME = "application/vnd.figure-composer.project+zip";
const PROJECT_MANIFEST_PATH = "project.json";

export interface PortableAssetEntry {
  readonly id: string;
  readonly path: string;
  readonly sourceName: string;
  readonly mimeType: string;
  readonly kind: SupportedAssetKind;
  readonly byteSize: number;
  readonly lastModified: number;
  readonly sha256: string;
}

export interface PortableProjectManifest {
  readonly containerVersion: typeof PORTABLE_PROJECT_CONTAINER_VERSION;
  readonly format: "figure-composer-portable-project";
  readonly projectFile: FigureProjectFile;
  readonly assets: readonly PortableAssetEntry[];
}

export interface LoadedProjectDocument {
  readonly document: EditorDocument;
  readonly sourceFiles: ReadonlyMap<string, File>;
  readonly portable: boolean;
}

type AssetLoader = (file: File) => Promise<ImportedAsset>;

export async function createPortableProjectBlob(
  document: EditorDocument,
  sourceBindings: ReadonlyMap<string, SourceBinding>,
  savedAt = new Date().toISOString(),
): Promise<Blob> {
  const zip = new JSZip();
  const packagedAssets: PortableAssetEntry[] = [];

  for (let index = 0; index < document.assets.length; index += 1) {
    const asset = document.assets[index];
    const file = await resolveExactSourceFile(asset, sourceBindings);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error(`${asset.sourceName} is empty and cannot be packed.`);
    if (file.size !== asset.byteSize) {
      throw new Error(`${asset.sourceName} no longer matches the imported source. Refresh or relink it before saving.`);
    }
    const path = portableAssetPath(asset, index);
    const entry: PortableAssetEntry = {
      id: asset.id,
      path,
      sourceName: asset.sourceName,
      mimeType: asset.mimeType,
      kind: asset.kind,
      byteSize: bytes.byteLength,
      lastModified: asset.lastModified,
      sha256: await sha256Hex(bytes),
    };
    packagedAssets.push(entry);
    zip.file(path, bytes, { binary: true, compression: "STORE" });
  }

  const portableDocument: EditorDocument = {
    ...document,
    assets: document.assets.map((asset, index) => ({
      ...asset,
      sourceReference: packagedAssets[index].path,
    })),
  };
  const manifest: PortableProjectManifest = {
    containerVersion: PORTABLE_PROJECT_CONTAINER_VERSION,
    format: "figure-composer-portable-project",
    projectFile: createProjectFile(portableDocument, savedAt),
    assets: packagedAssets,
  };
  zip.file(PROJECT_MANIFEST_PATH, JSON.stringify(manifest, null, 2), {
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return zip.generateAsync({
    type: "blob",
    mimeType: PORTABLE_PROJECT_MIME,
    compression: "STORE",
  });
}

export async function loadProjectDocument(
  file: File,
  availableAssets: readonly ImportedAsset[] = [],
  assetLoader: AssetLoader = loadImportedAsset,
): Promise<LoadedProjectDocument> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasZipSignature(bytes)) {
    return {
      document: deserializeProjectFile(new TextDecoder().decode(bytes), availableAssets),
      sourceFiles: new Map(),
      portable: false,
    };
  }

  const createdPreviewUrls: string[] = [];
  try {
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false });
    const manifestEntry = zip.file(PROJECT_MANIFEST_PATH);
    if (!manifestEntry) throw new Error("Portable Figure project is missing project.json.");
    const manifest = parsePortableManifest(JSON.parse(await manifestEntry.async("text")));
    const document = deserializeProjectFile(JSON.stringify(manifest.projectFile));
    const metadataById = new Map(document.assets.map((asset) => [asset.id, asset]));
    const sourceFiles = new Map<string, File>();
    const restoredAssets: ImportedAsset[] = [];

    if (manifest.assets.length !== document.assets.length) {
      throw new Error("Portable Figure project asset manifest does not match the project document.");
    }

    for (const entry of manifest.assets) {
      const metadata = metadataById.get(entry.id);
      if (!metadata) throw new Error(`Portable asset ${entry.id} is not referenced by the project.`);
      const archived = zip.file(entry.path);
      if (!archived || archived.dir) throw new Error(`Portable Figure project is missing ${entry.sourceName}.`);
      if (entry.sourceName !== metadata.sourceName
        || entry.mimeType !== metadata.mimeType
        || entry.kind !== metadata.kind
        || entry.byteSize !== metadata.byteSize
        || entry.lastModified !== metadata.lastModified
        || metadata.sourceReference !== entry.path) {
        throw new Error(`${entry.sourceName} does not match the project manifest metadata.`);
      }
      const assetBytes = await archived.async("uint8array");
      if (assetBytes.byteLength !== entry.byteSize || assetBytes.byteLength !== metadata.byteSize) {
        throw new Error(`${entry.sourceName} failed its stored-size integrity check.`);
      }
      if (await sha256Hex(assetBytes) !== entry.sha256) {
        throw new Error(`${entry.sourceName} failed its SHA-256 integrity check.`);
      }
      const sourceFile = new File([assetBytes], entry.sourceName, {
        type: entry.mimeType,
        lastModified: entry.lastModified,
      });
      const decoded = await assetLoader(sourceFile);
      if (decoded.kind !== entry.kind
        || decoded.intrinsicWidthPx !== metadata.intrinsicWidthPx
        || decoded.intrinsicHeightPx !== metadata.intrinsicHeightPx) {
        revokeIfObjectUrl(decoded.previewUrl);
        throw new Error(`${entry.sourceName} does not match its saved image metadata.`);
      }
      if (decoded.previewUrl.startsWith("blob:")) createdPreviewUrls.push(decoded.previewUrl);
      sourceFiles.set(entry.id, sourceFile);
      restoredAssets.push({
        ...metadata,
        previewUrl: decoded.previewUrl,
        missing: false,
        sourceReference: entry.path,
      });
      metadataById.delete(entry.id);
    }
    if (metadataById.size > 0 || sourceFiles.size !== manifest.assets.length) {
      throw new Error("Portable Figure project has duplicate or incomplete asset ownership.");
    }

    return {
      document: { ...document, assets: restoredAssets },
      sourceFiles,
      portable: true,
    };
  } catch (error) {
    createdPreviewUrls.forEach(revokeIfObjectUrl);
    if (error instanceof Error && error.message.startsWith("Portable")) throw error;
    throw new Error(error instanceof Error
      ? `Portable Figure project could not be opened: ${error.message}`
      : "Portable Figure project could not be opened.");
  }
}

function parsePortableManifest(value: unknown): PortableProjectManifest {
  if (!isRecord(value)
    || value.format !== "figure-composer-portable-project"
    || value.containerVersion !== PORTABLE_PROJECT_CONTAINER_VERSION
    || !isRecord(value.projectFile)
    || !Array.isArray(value.assets)) {
    throw new Error("Portable Figure project manifest is invalid or unsupported.");
  }
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  const assets = value.assets.map((candidate, index): PortableAssetEntry => {
    if (!isRecord(candidate)
      || typeof candidate.id !== "string" || !candidate.id
      || typeof candidate.path !== "string" || !isSafeArchivePath(candidate.path)
      || typeof candidate.sourceName !== "string" || !candidate.sourceName
      || typeof candidate.mimeType !== "string" || !candidate.mimeType
      || !["png", "jpeg", "svg", "tiff"].includes(String(candidate.kind))
      || !Number.isInteger(candidate.byteSize) || Number(candidate.byteSize) < 1
      || !Number.isFinite(candidate.lastModified) || Number(candidate.lastModified) < 0
      || typeof candidate.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(candidate.sha256)) {
      throw new Error(`Portable asset entry ${index + 1} is invalid.`);
    }
    if (seenIds.has(candidate.id) || seenPaths.has(candidate.path)) {
      throw new Error("Portable Figure project contains duplicate asset entries.");
    }
    seenIds.add(candidate.id);
    seenPaths.add(candidate.path);
    return candidate as unknown as PortableAssetEntry;
  });
  return {
    containerVersion: PORTABLE_PROJECT_CONTAINER_VERSION,
    format: "figure-composer-portable-project",
    projectFile: value.projectFile as unknown as FigureProjectFile,
    assets,
  };
}

async function resolveExactSourceFile(
  asset: ImportedAsset,
  sourceBindings: ReadonlyMap<string, SourceBinding>,
): Promise<File> {
  const binding = sourceBindings.get(asset.id);
  if (binding) {
    try {
      return await binding.getFile();
    } catch {
      throw new Error(`${asset.sourceName} could not be read. Relink it before saving this portable project.`);
    }
  }
  if (asset.sourceReference?.startsWith("bundled-demo://") && asset.previewUrl.startsWith("data:")) {
    const blob = await fetch(asset.previewUrl).then((response) => response.blob());
    return new File([blob], asset.sourceName, { type: asset.mimeType, lastModified: asset.lastModified });
  }
  throw new Error(`${asset.sourceName} has no exact source bytes. Relink it before saving this portable project.`);
}

function portableAssetPath(asset: ImportedAsset, index: number): string {
  const extension = asset.kind === "jpeg" ? extensionFromName(asset.sourceName, ["jpg", "jpeg"], "jpg")
    : asset.kind === "tiff" ? extensionFromName(asset.sourceName, ["tif", "tiff"], "tif")
      : asset.kind;
  const stableId = asset.id.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "asset";
  return `assets/${String(index + 1).padStart(4, "0")}-${stableId}.${extension}`;
}

function extensionFromName(name: string, allowed: readonly string[], fallback: string): string {
  const extension = name.split(".").at(-1)?.toLowerCase();
  return extension && allowed.includes(extension) ? extension : fallback;
}

function isSafeArchivePath(path: string): boolean {
  return path.startsWith("assets/")
    && !path.includes("\\")
    && !path.includes("\0")
    && !path.split("/").includes("..")
    && path.length <= 240;
}

function hasZipSignature(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4b
    && ((bytes[2] === 0x03 && bytes[3] === 0x04)
      || (bytes[2] === 0x05 && bytes[3] === 0x06)
      || (bytes[2] === 0x07 && bytes[3] === 0x08));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function revokeIfObjectUrl(url: string): void {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
