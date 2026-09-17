export type SupportedAssetKind = "png" | "jpeg" | "svg" | "tiff";

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
  /** True when a saved source reference has not been relinked in this session. */
  readonly missing?: boolean;
  /** Portable source hint only; never used as an authoritative filesystem path. */
  readonly sourceReference?: string;
}
