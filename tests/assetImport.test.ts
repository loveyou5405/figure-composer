import { describe, expect, it } from "vitest";
import { createStableId } from "../src/domain/id";
import type { ImportedAsset } from "../src/domain/asset";
import { decodeTiffFirstPage, getSupportedAssetKind, loadImportedAssetBatch } from "../src/services/assetImport";
import * as UTIF from "utif";

describe("asset type validation", () => {
  it.each([
    ["panel.png", "image/png", "png"],
    ["panel.jpg", "image/jpeg", "jpeg"],
    ["panel.jpeg", "image/jpeg", "jpeg"],
    ["panel.svg", "image/svg+xml", "svg"],
    ["panel.tif", "image/tiff", "tiff"],
    ["panel.tiff", "image/x-tiff", "tiff"],
  ] as const)("accepts %s", (name, type, expected) => {
    expect(getSupportedAssetKind({ name, type })).toBe(expected);
  });

  it("uses the extension only when the browser provides no MIME type", () => {
    expect(getSupportedAssetKind({ name: "PANEL.JPEG", type: "" })).toBe("jpeg");
    expect(getSupportedAssetKind({ name: "panel.svg", type: "application/octet-stream" })).toBeNull();
    expect(getSupportedAssetKind({ name: "PANEL.TIFF", type: "" })).toBe("tiff");
  });

  it("rejects unsupported file formats", () => {
    expect(getSupportedAssetKind({ name: "panel.bmp", type: "image/bmp" })).toBeNull();
    expect(getSupportedAssetKind({ name: "notes.txt", type: "text/plain" })).toBeNull();
  });
});

describe("TIFF decoding", () => {
  it("decodes the first page to RGBA without modifying the encoded source", () => {
    const pixels = new Uint8Array([
      255, 0, 0, 255,
      0, 255, 0, 255,
    ]);
    const encoded = UTIF.encodeImage(pixels, 2, 1);
    const before = new Uint8Array(encoded).slice();
    const decoded = decodeTiffFirstPage(encoded);
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(1);
    expect(decoded.rgba).toHaveLength(8);
    expect(new Uint8Array(encoded)).toEqual(before);
  });

  it("rejects malformed TIFF data", () => {
    expect(() => decodeTiffFirstPage(new ArrayBuffer(8))).toThrow();
  });
});

describe("stable entity IDs", () => {
  it("creates distinct prefixed IDs for independent panels and assets", () => {
    const ids = new Set([
      createStableId("asset"),
      createStableId("asset"),
      createStableId("panel"),
      createStableId("panel"),
    ]);
    expect(ids.size).toBe(4);
    expect([...ids].filter((id) => id.startsWith("asset-")).length).toBe(2);
    expect([...ids].filter((id) => id.startsWith("panel-")).length).toBe(2);
  });
});

describe("multi-file import", () => {
  it("preserves file order and isolates a rejected sibling", async () => {
    const files = [
      { name: "first.svg", type: "image/svg+xml" },
      { name: "broken.svg", type: "image/svg+xml" },
      { name: "third.png", type: "image/png" },
    ] as File[];
    const loader = async (file: File): Promise<ImportedAsset> => {
      if (file.name === "broken.svg") throw new Error("The image could not be decoded.");
      await Promise.resolve();
      return {
        id: `asset-${file.name}`,
        sourceName: file.name,
        mimeType: file.type,
        kind: file.name.endsWith(".png") ? "png" : "svg",
        intrinsicWidthPx: 100,
        intrinsicHeightPx: 50,
        byteSize: 1,
        lastModified: 0,
        previewUrl: `blob:${file.name}`,
      };
    };

    const outcomes = await loadImportedAssetBatch(files, loader);
    expect(outcomes.map((outcome) => outcome.file.name)).toEqual([
      "first.svg",
      "broken.svg",
      "third.png",
    ]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "accepted",
      "rejected",
      "accepted",
    ]);
  });
});
