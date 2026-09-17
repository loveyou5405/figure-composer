import { describe, expect, it } from "vitest";
import type { ImportedAsset } from "../src/domain/asset";
import { createInitialEditorDocument, type EditorDocument } from "../src/domain/editorDocument";
import { createDefaultPanelLabel, updatePanelLabelOffset, updatePanelLabelText } from "../src/domain/labels";
import type { Panel } from "../src/domain/panel";
import { updateProjectPagePanels } from "../src/domain/project";
import {
  effectiveDpi,
  movePanelInsideSafeMargin,
  reviewDocument,
  summarizeReview,
} from "../src/domain/validation";

function asset(id: string, kind: ImportedAsset["kind"] = "png", width = 1200, height = 600): ImportedAsset {
  return {
    id,
    sourceName: `${id}.${kind === "jpeg" ? "jpg" : kind}`,
    mimeType: kind === "svg" ? "image/svg+xml" : `image/${kind}`,
    kind,
    intrinsicWidthPx: width,
    intrinsicHeightPx: height,
    byteSize: 100,
    lastModified: 1,
    previewUrl: `blob:${id}`,
  };
}

function panel(id: string, pageId: string, assetId: string, xMm = 20, yMm = 20, label = "A"): Panel {
  return {
    id,
    pageId,
    assetId,
    typeId: "wb",
    presetId: "preset-wb",
    baseSizeMm: { widthMm: 80, heightMm: 40 },
    geometry: { xMm, yMm, widthMm: 40, heightMm: 20 },
    aspectRatioLocked: true,
    manualScaleOverride: false,
    label: { ...createDefaultPanelLabel(), text: label },
  };
}

function documentWith(panels: readonly Panel[], assets?: readonly ImportedAsset[]): EditorDocument {
  const initial = createInitialEditorDocument();
  const pageId = initial.project.pages[0].id;
  return {
    ...initial,
    assets: assets ?? panels.map((item) => asset(item.assetId)),
    project: updateProjectPagePanels(initial.project, pageId, () => panels.map((item) => ({ ...item, pageId }))),
  };
}

function codes(document: EditorDocument): string[] {
  return reviewDocument(document).map((finding) => finding.code);
}

describe("review geometry", () => {
  it("detects page overflow but ignores sub-epsilon floating-point drift", () => {
    const initial = createInitialEditorDocument();
    const pageId = initial.project.pages[0].id;
    const outside = { ...panel("outside", pageId, "a", 190), geometry: { xMm: 190, yMm: 20, widthMm: 25, heightMm: 20 } };
    expect(codes(documentWith([outside]))).toContain("panel-outside-page");
    const drift = { ...outside, geometry: { xMm: 170.0005, yMm: 20, widthMm: 40, heightMm: 20 } };
    expect(codes(documentWith([drift]))).not.toContain("panel-outside-page");
  });

  it("reports safe-margin intrusion and offers a non-resizing move fix", () => {
    const initial = createInitialEditorDocument();
    const pageId = initial.project.pages[0].id;
    const source = panel("edge", pageId, "a", 10, 14);
    const finding = reviewDocument(documentWith([source])).find((item) => item.code === "panel-outside-safe-margin")!;
    expect(finding.message).toContain("2 mm");
    expect(finding.fix?.kind).toBe("move-inside-margin");
    const moved = movePanelInsideSafeMargin(source, initial.project.pages[0].definition);
    expect(moved.geometry).toEqual({ ...source.geometry, xMm: 12, yMm: 14 });
  });

  it("detects positive-area panel overlap but not touching edges", () => {
    const initial = createInitialEditorDocument();
    const pageId = initial.project.pages[0].id;
    expect(codes(documentWith([panel("a", pageId, "a", 20, 20, "A"), panel("b", pageId, "b", 59, 20, "B")]))).toContain("panel-overlap");
    expect(codes(documentWith([panel("a", pageId, "a", 20, 20, "A"), panel("b", pageId, "b", 60, 20, "B")]))).not.toContain("panel-overlap");
  });
});

describe("review labels", () => {
  it("detects labels outside the page", () => {
    const initial = createInitialEditorDocument();
    const pageId = initial.project.pages[0].id;
    expect(codes(documentWith([panel("a", pageId, "a", 0, 0)]))).toContain("label-outside-page");
  });

  it("detects a label colliding with panel content", () => {
    const initial = createInitialEditorDocument();
    const pageId = initial.project.pages[0].id;
    const source = updatePanelLabelOffset(panel("a", pageId, "a", 20, 20), 1, 2);
    expect(codes(documentWith([source]))).toContain("label-panel-collision");
  });

  it("detects label-to-label collisions", () => {
    const initial = createInitialEditorDocument();
    const pageId = initial.project.pages[0].id;
    const a = panel("a", pageId, "a", 20, 20, "AA");
    const b = panel("b", pageId, "b", 21, 40, "BB");
    const shifted = updatePanelLabelOffset(b, -3, -22);
    expect(codes(documentWith([a, shifted]))).toContain("label-label-collision");
  });

  it("reports duplicate, missing, and manual label intent independently", () => {
    const initial = createInitialEditorDocument();
    const pageId = initial.project.pages[0].id;
    const duplicateA = panel("a", pageId, "a", 20, 30, "A");
    const duplicateB = panel("b", pageId, "b", 70, 30, "A");
    const missing = panel("c", pageId, "c", 120, 30, "");
    const manual = updatePanelLabelText(panel("d", pageId, "d", 20, 80, "D"), "D1");
    const result = codes(documentWith([duplicateA, duplicateB, missing, manual]));
    expect(result).toContain("duplicate-visible-label");
    expect(result).toContain("missing-visible-label");
    expect(result).toContain("manual-label-override");
  });
});

describe("review presets and raster quality", () => {
  it("reports preset deviation and explicit manual override with reset action", () => {
    const initial = createInitialEditorDocument();
    const pageId = initial.project.pages[0].id;
    const source = { ...panel("a", pageId, "a"), manualScaleOverride: true, geometry: { xMm: 20, yMm: 20, widthMm: 36, heightMm: 18 } };
    const result = reviewDocument(documentWith([source]));
    expect(result.find((item) => item.code === "preset-deviation")?.fix?.kind).toBe("reset-preset");
    expect(result.map((item) => item.code)).toContain("manual-scale-override");
  });

  it("detects inconsistent scales among panels of the same scientific type", () => {
    const initial = createInitialEditorDocument();
    const pageId = initial.project.pages[0].id;
    const a = panel("a", pageId, "a", 20, 20, "A");
    const b = { ...panel("b", pageId, "b", 70, 20, "B"), geometry: { xMm: 70, yMm: 20, widthMm: 35.2, heightMm: 17.6 }, manualScaleOverride: true };
    expect(codes(documentWith([a, b]))).toContain("inconsistent-type-scale");
  });

  it("uses inclusive 300/200 DPI thresholds", () => {
    const initial = createInitialEditorDocument();
    const pageId = initial.project.pages[0].id;
    const source = panel("dpi", pageId, "dpi");
    expect(effectiveDpi(source, 600, 300)).toBeCloseTo(381, 4);
    expect(codes(documentWith([source], [asset("dpi", "png", 472, 236)]))).toContain("low-dpi");
    expect(codes(documentWith([source], [asset("dpi", "png", 314, 157)]))).toContain("low-dpi-strong");
    expect(codes(documentWith([source], [asset("dpi", "png", 473, 237)]))).not.toContain("low-dpi");
  });
});

describe("review sources and summaries", () => {
  it("reports missing, changed, and TIFF fallback sources", () => {
    const initial = createInitialEditorDocument();
    const pageId = initial.project.pages[0].id;
    const missingAsset = { ...asset("missing"), previewUrl: "", missing: true };
    const changedAsset = asset("changed");
    const tiffAsset = asset("tiff", "tiff");
    const document = documentWith([
      panel("m", pageId, "missing", 20, 30, "M"),
      panel("c", pageId, "changed", 70, 30, "C"),
      panel("t", pageId, "tiff", 120, 30, "T"),
    ], [missingAsset, changedAsset, tiffAsset]);
    const result = reviewDocument(document, [{ assetId: "changed", status: "changed", file: {} as File }]);
    expect(result.find((item) => item.code === "missing-source")?.severity).toBe("error");
    expect(result.find((item) => item.code === "changed-source")?.fix?.kind).toBe("refresh-source");
    expect(result.map((item) => item.code)).toContain("source-fallback");
  });

  it("returns stable deterministic ordering and severity totals", () => {
    const initial = createInitialEditorDocument();
    const pageId = initial.project.pages[0].id;
    const source = { ...panel("a", pageId, "a", 0, 0, ""), manualScaleOverride: true };
    const document = documentWith([source], [{ ...asset("a"), previewUrl: "", missing: true }]);
    const first = reviewDocument(document);
    const second = reviewDocument(document);
    expect(second).toEqual(first);
    expect(first[0].severity).toBe("error");
    const summary = summarizeReview(first);
    expect(summary.errors).toBeGreaterThan(0);
    expect(summary.warnings).toBeGreaterThan(0);
    expect(summary.info).toBeGreaterThan(0);
  });
});
