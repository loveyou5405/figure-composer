import { describe, expect, it } from "vitest";
import type { CanonicalAssetFormat, ImportedAsset } from "../src/domain/asset";
import { A4_PORTRAIT } from "../src/domain/page";
import type { Panel } from "../src/domain/panel";
import { effectiveDpi } from "../src/domain/validation";
import {
  clipboardQualityMetadata,
  clipboardSourceDiagnostics,
  parseClipboardPhysicalSizeMm,
  placeClipboardPanelGeometry,
  selectBestClipboardCandidate,
  type ClipboardCandidate,
  type ClipboardImportPayload,
} from "../src/services/clipboardImport";

function candidate(format: CanonicalAssetFormat): ClipboardCandidate {
  return { blob: new Blob([format]), format, mimeType: `image/${format}` };
}

describe("clipboard fidelity selection", () => {
  it("prefers SVG over TIFF and TIFF over PNG in the web provider", () => {
    expect(selectBestClipboardCandidate([
      candidate("png"),
      candidate("tiff"),
      candidate("svg"),
    ])?.format).toBe("svg");
    expect(selectBestClipboardCandidate([
      candidate("png"),
      candidate("tiff"),
    ])?.format).toBe("tiff");
  });

  it("uses the full native priority when the provider declares native formats", () => {
    const nativeFormats = new Set<CanonicalAssetFormat>(["svg", "emf", "wmf", "tiff", "png", "dib", "jpeg"]);
    expect(selectBestClipboardCandidate([
      candidate("jpeg"),
      candidate("tiff"),
      candidate("wmf"),
      candidate("emf"),
    ], nativeFormats)?.format).toBe("emf");
  });

  it("does not select an unsupported native-only representation in web mode", () => {
    expect(selectBestClipboardCandidate([candidate("emf"), candidate("png")])?.format).toBe("png");
  });
});

describe("clipboard physical size and placement", () => {
  it("reads reliable CSS dimensions in millimeters and points", () => {
    expect(parseClipboardPhysicalSizeMm('<img style="width:52mm;height:38mm">')).toEqual({ widthMm: 52, heightMm: 38 });
    expect(parseClipboardPhysicalSizeMm('<img style="width:144pt;height:72pt">')).toEqual({ widthMm: 50.8, heightMm: 25.4 });
  });

  it("uses a deterministic 3 mm cascade inside the safe region", () => {
    expect(placeClipboardPanelGeometry({ widthMm: 52, heightMm: 38 }, A4_PORTRAIT, 0)).toMatchObject({
      xMm: 12,
      yMm: 12,
      widthMm: 52,
      heightMm: 38,
    });
    expect(placeClipboardPanelGeometry({ widthMm: 52, heightMm: 38 }, A4_PORTRAIT, 1)).toMatchObject({
      xMm: 15,
      yMm: 15,
    });
  });

  it("fits an oversized paste into the safe region without changing aspect ratio", () => {
    const placed = placeClipboardPanelGeometry({ widthMm: 400, heightMm: 200 }, A4_PORTRAIT, 0);
    expect(placed.xMm).toBe(12);
    expect(placed.yMm).toBe(12);
    expect(placed.widthMm).toBeLessThanOrEqual(186);
    expect(placed.heightMm).toBeLessThanOrEqual(273);
    expect(placed.widthMm / placed.heightMm).toBeCloseTo(2, 3);
  });
});

describe("clipboard quality metadata", () => {
  it.each([
    ["svg", "vector", true, false],
    ["tiff", "lossless-raster", false, true],
    ["png", "lossless-raster", false, true],
    ["jpeg", "lossy-raster", false, false],
    ["dib", "bitmap-fallback", false, true],
  ] as const)("classifies %s without inferring quality from a friendlier extension", (format, qualityClass, isVector, isLosslessRaster) => {
    const payload = {
      file: {} as File,
      canonicalFormat: format,
      sourceApplication: "PowerPoint",
      physicalSizeMm: null,
      physicalSizeSource: "default",
      availableFormats: [],
    } satisfies ClipboardImportPayload;
    expect(clipboardQualityMetadata(payload)).toMatchObject({
      sourceKind: "clipboard",
      canonicalFormat: format,
      qualityClass,
      isVector,
      isLosslessRaster,
    } satisfies Partial<ImportedAsset>);
  });

  it("records PNG diagnostics and all clipboard-advertised formats", () => {
    const payload = {
      file: {} as File,
      canonicalFormat: "png",
      sourceApplication: "PowerPoint",
      physicalSizeMm: { widthMm: 54, heightMm: 32.6 },
      physicalSizeSource: "clipboard",
      availableFormats: ["image/png", "image/jpeg", "text/html"],
    } satisfies ClipboardImportPayload;
    expect(clipboardSourceDiagnostics(payload, { intrinsicWidthPx: 2840, intrinsicHeightPx: 1712 })).toEqual({
      availableFormats: ["image/png", "image/jpeg", "text/html"],
      selectedFormat: "png",
      qualityClass: "lossless-raster",
      pixelWidth: 2840,
      pixelHeight: 1712,
      physicalWidthMm: 54,
      physicalHeightMm: 32.6,
      previewConverted: false,
      canonicalFormat: "png",
      previewFormat: "png",
    });
  });

  it("keeps vector, lossy raster, and preview conversion as distinct diagnostics", () => {
    const base = {
      file: {} as File,
      sourceApplication: "Unknown" as const,
      physicalSizeMm: null,
      physicalSizeSource: "default" as const,
      availableFormats: [] as readonly string[],
    };
    const svg = clipboardSourceDiagnostics({ ...base, canonicalFormat: "svg" }, { intrinsicWidthPx: 1000, intrinsicHeightPx: 500 });
    expect(svg).toMatchObject({ qualityClass: "vector", previewConverted: false, canonicalFormat: "svg", previewFormat: "svg" });
    expect(svg).not.toHaveProperty("pixelWidth");
    const jpeg = clipboardSourceDiagnostics({ ...base, canonicalFormat: "jpeg" }, { intrinsicWidthPx: 1000, intrinsicHeightPx: 500 });
    expect(jpeg.qualityClass).toBe("lossy-raster");
    const tiff = clipboardSourceDiagnostics({ ...base, canonicalFormat: "tiff" }, { intrinsicWidthPx: 1000, intrinsicHeightPx: 500 });
    expect(tiff).toMatchObject({ canonicalFormat: "tiff", previewFormat: "png", previewConverted: true });
    const emf = clipboardSourceDiagnostics({ ...base, canonicalFormat: "emf" }, { intrinsicWidthPx: 1, intrinsicHeightPx: 1 }, "png");
    expect(emf).toMatchObject({ qualityClass: "vector", canonicalFormat: "emf", previewFormat: "png", previewConverted: true });
  });

  it("calculates effective DPI from source pixels and current displayed millimeters", () => {
    const panel = {
      geometry: { xMm: 12, yMm: 12, widthMm: 54, heightMm: 32.6 },
    } as Panel;
    expect(effectiveDpi(panel, 2840, 1712)).toBeCloseTo(1333.9, 1);
  });

  it("leaves unavailable application, formats, and physical size unknown", () => {
    const payload = {
      file: {} as File,
      canonicalFormat: "png",
      sourceApplication: "Unknown",
      physicalSizeMm: null,
      physicalSizeSource: "default",
      availableFormats: [],
    } satisfies ClipboardImportPayload;
    const quality = clipboardQualityMetadata(payload);
    const diagnostics = clipboardSourceDiagnostics(payload, { intrinsicWidthPx: 400, intrinsicHeightPx: 300 });
    expect(quality.sourceApplication).toBe("Unknown");
    expect(diagnostics.availableFormats).toEqual([]);
    expect(diagnostics).not.toHaveProperty("physicalWidthMm");
    expect(diagnostics).not.toHaveProperty("physicalHeightMm");
  });
});
