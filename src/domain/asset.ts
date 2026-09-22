export type SupportedAssetKind = "png" | "jpeg" | "svg" | "tiff";

export type CanonicalAssetFormat = "svg" | "emf" | "wmf" | "tiff" | "png" | "dib" | "jpeg";
export type AssetQualityClass = "vector" | "lossless-raster" | "lossy-raster" | "bitmap-fallback";
export type PhysicalSizeSource = "clipboard" | "estimated" | "default";

export interface ClipboardSourceDiagnostics {
  readonly availableFormats: readonly string[];
  readonly selectedFormat: CanonicalAssetFormat;
  readonly qualityClass: AssetQualityClass;
  readonly pixelWidth?: number;
  readonly pixelHeight?: number;
  readonly physicalWidthMm?: number;
  readonly physicalHeightMm?: number;
  readonly previewConverted: boolean;
  readonly canonicalFormat: CanonicalAssetFormat;
  readonly previewFormat: CanonicalAssetFormat;
}

export interface ImportedAsset {
  readonly id: string;
  readonly sourceName: string;
  readonly mimeType: string;
  readonly kind: SupportedAssetKind;
  readonly intrinsicWidthPx: number;
  readonly intrinsicHeightPx: number;
  readonly byteSize: number;
  readonly lastModified: number;
  readonly previewUrl: string;
  /** Origin and fidelity metadata are optional for legacy file imports. */
  readonly sourceKind?: "file" | "clipboard" | "bundled";
  readonly sourceApplication?: "PowerPoint" | "Unknown";
  readonly canonicalFormat?: CanonicalAssetFormat;
  readonly isVector?: boolean;
  readonly isLosslessRaster?: boolean;
  readonly qualityClass?: AssetQualityClass;
  readonly physicalSizeSource?: PhysicalSizeSource;
  readonly clipboardDiagnostics?: ClipboardSourceDiagnostics;
  /** True when a saved source reference has not been relinked in this session. */
  readonly missing?: boolean;
  /** Portable source hint only; never used as an authoritative filesystem path. */
  readonly sourceReference?: string;
}
