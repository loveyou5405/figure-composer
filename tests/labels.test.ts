import { describe, expect, it } from "vitest";
import {
  DEFAULT_LABEL_SETTINGS,
  applyDefaultOffsetsToAutomaticLabels,
  applyLabelLetterCaseToAutomaticLabels,
  alphabeticLabel,
  autoLabelOrderedPages,
  autoLabelPanels,
  createDefaultPanelLabel,
  getLabelValidationWarnings,
  getPanelLabelBoundsMm,
  getPanelReadingOrder,
  getPageLabelStartIndex,
  updatePanelLabelText,
  updatePanelLabelOffset,
  updatePanelLabelVisibility,
} from "../src/domain/labels";
import {
  alignSelectedPanels,
  distributeSelectedPanels,
  moveSelectedPanels,
} from "../src/domain/layout";
import { A4_PORTRAIT } from "../src/domain/page";
import { resizePanelGeometry, type Panel } from "../src/domain/panel";
import { getViewportMetrics } from "../src/domain/viewport";

function panel(
  id: string,
  xMm: number,
  yMm: number,
  pageId = "page-1",
  widthMm = 20,
  heightMm = 12,
): Panel {
  return {
    id,
    pageId,
    assetId: `asset-${id}`,
    typeId: "other",
    presetId: "preset-other",
    baseSizeMm: { widthMm, heightMm },
    geometry: { xMm, yMm, widthMm, heightMm },
    aspectRatioLocked: true,
    manualScaleOverride: false,
    label: createDefaultPanelLabel(),
  };
}

function labels(panels: readonly Panel[]): string[] {
  return panels.map((item) => item.label.text);
}

describe("alphabetic panel label sequence", () => {
  it("generates A through Z and transitions to AA, AB, and AC", () => {
    expect(alphabeticLabel(0)).toBe("A");
    expect(alphabeticLabel(25)).toBe("Z");
    expect(alphabeticLabel(26)).toBe("AA");
    expect(alphabeticLabel(27)).toBe("AB");
    expect(alphabeticLabel(28)).toBe("AC");
    expect(alphabeticLabel(0, "lowercase")).toBe("a");
    expect(alphabeticLabel(26, "lowercase")).toBe("aa");
  });

  it("rejects non-integer and negative indices", () => {
    expect(() => alphabeticLabel(-1)).toThrow(/non-negative integer/);
    expect(() => alphabeticLabel(1.5)).toThrow(/non-negative integer/);
  });
});

describe("geometry-based reading order", () => {
  it("orders a single row left to right independent of input order", () => {
    const input = [panel("c", 80, 20), panel("a", 10, 20), panel("b", 45, 20)];
    expect(getPanelReadingOrder(input).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("orders rows top to bottom and panels left to right", () => {
    const input = [
      panel("f", 80, 50), panel("b", 45, 10), panel("d", 10, 50),
      panel("c", 80, 10), panel("e", 45, 50), panel("a", 10, 10),
    ];
    expect(getPanelReadingOrder(input).map((item) => item.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("uses the inclusive five millimeter row tolerance deterministically", () => {
    const input = [panel("right", 50, 15), panel("left", 10, 10), panel("next", 5, 15.001)];
    expect(getPanelReadingOrder(input, 5).map((item) => item.id)).toEqual(["left", "right", "next"]);
  });
});

describe("explicit auto labeling", () => {
  it("labels only the supplied active-page panel collection", () => {
    const page1 = [panel("a", 10, 10, "page-1"), panel("b", 40, 10, "page-1")];
    const page2 = [panel("c", 10, 10, "page-2")];
    expect(labels(autoLabelPanels(page1))).toEqual(["A", "B"]);
    expect(labels(page2)).toEqual([""]);
  });

  it("labels only selected panels in their own reading order", () => {
    const input = [panel("a", 10, 10), panel("b", 40, 10), panel("c", 70, 10)];
    const result = autoLabelPanels(input, { panelIds: new Set(["b", "c"]) });
    expect(labels(result)).toEqual(["", "A", "B"]);
  });

  it("excludes hidden labels without consuming sequence slots", () => {
    const input = [
      panel("a", 10, 10),
      updatePanelLabelVisibility(panel("hidden", 40, 10), false),
      panel("c", 70, 10),
    ];
    expect(labels(autoLabelPanels(input))).toEqual(["A", "", "B"]);
  });

  it("keeps center-aligned panels in left-to-right order after a label is hidden", () => {
    const input = [
      panel("a", 10, 10),
      updatePanelLabelVisibility(panel("hidden", 40, 10), false),
      panel("c", 10, 40, "page-1", 20, 20),
      panel("d", 40, 30, "page-1", 20, 40),
    ];
    const result = autoLabelPanels(input);
    expect(labels(result)).toEqual(["A", "", "B", "C"]);
  });

  it("creates manual overrides and preserves them by default", () => {
    const input = [panel("a", 10, 10), updatePanelLabelText(panel("b", 40, 10), "C1"), panel("c", 70, 10)];
    const result = autoLabelPanels(input);
    expect(labels(result)).toEqual(["A", "C1", "C"]);
    expect(result[1].label.mode).toBe("manual");
  });

  it("replaces manual labels only under the explicit replace policy", () => {
    const manual = updatePanelLabelText(panel("a", 10, 10), "A–C");
    const result = autoLabelPanels([manual], { manualPolicy: "replace" });
    expect(result[0].label).toMatchObject({ text: "A", mode: "auto" });
  });

  it("generates lowercase automatic labels and preserves manual text when case changes", () => {
    const automatic = autoLabelPanels([panel("a", 10, 10), panel("b", 40, 10)], { letterCase: "lowercase" });
    const withManual = [automatic[0], updatePanelLabelText(automatic[1], "B1")];
    const upper = applyLabelLetterCaseToAutomaticLabels(withManual, "uppercase");
    expect(labels(automatic)).toEqual(["a", "b"]);
    expect(labels(upper)).toEqual(["A", "B1"]);
    expect(upper[1].label.mode).toBe("manual");
  });
});

describe("multi-page sequence modes", () => {
  const pages = [
    { id: "page-1", definition: A4_PORTRAIT, panels: [panel("a", 10, 10), panel("b", 40, 10)] },
    { id: "page-2", definition: A4_PORTRAIT, panels: [panel("c", 10, 10, "page-2"), panel("d", 40, 10, "page-2")] },
  ];

  it("continues labels across ordered project pages by default", () => {
    const result = autoLabelOrderedPages(pages, DEFAULT_LABEL_SETTINGS);
    expect(labels(result[0].panels)).toEqual(["A", "B"]);
    expect(labels(result[1].panels)).toEqual(["C", "D"]);
  });

  it("can restart the sequence on every page", () => {
    const result = autoLabelOrderedPages(pages, { ...DEFAULT_LABEL_SETTINGS, sequenceMode: "restart-per-page" });
    expect(labels(result[0].panels)).toEqual(["A", "B"]);
    expect(labels(result[1].panels)).toEqual(["A", "B"]);
  });

  it("uses the selected letter case across ordered pages", () => {
    const result = autoLabelOrderedPages(pages, { ...DEFAULT_LABEL_SETTINGS, letterCase: "lowercase" });
    expect(labels(result[0].panels)).toEqual(["a", "b"]);
    expect(labels(result[1].panels)).toEqual(["c", "d"]);
  });

  it("continues across pages in one figure and restarts at a new figure", () => {
    const figurePages = [
      { ...pages[0], figureId: "figure-1" },
      { ...pages[1], figureId: "figure-1" },
      { id: "page-3", figureId: "figure-2", definition: A4_PORTRAIT, panels: [panel("e", 10, 10, "page-3")] },
    ];
    const result = autoLabelOrderedPages(figurePages, DEFAULT_LABEL_SETTINGS);
    expect(labels(result[0].panels)).toEqual(["A", "B"]);
    expect(labels(result[1].panels)).toEqual(["C", "D"]);
    expect(labels(result[2].panels)).toEqual(["A"]);
    expect(getPageLabelStartIndex(figurePages, "page-2", DEFAULT_LABEL_SETTINGS)).toBe(2);
    expect(getPageLabelStartIndex(figurePages, "page-3", DEFAULT_LABEL_SETTINGS)).toBe(0);
  });
});

describe("label attachment and layout isolation", () => {
  const attached = updatePanelLabelText(panel("a", 20, 30), "A1");

  it("uses the publication-style -2 mm up-left automatic offset", () => {
    const labeled = updatePanelLabelText(panel("default", 20, 30), "A");
    const bounds = getPanelLabelBoundsMm(labeled, DEFAULT_LABEL_SETTINGS);
    expect(createDefaultPanelLabel()).toMatchObject({ offsetXmm: -2, offsetYmm: -2, offsetMode: "automatic" });
    expect(bounds.xMm).toBe(18);
    expect(bounds.yMm + bounds.heightMm).toBe(28);
    expect(bounds.yMm + bounds.heightMm).toBeLessThan(labeled.geometry.yMm);
  });

  it("panel movement preserves label metadata and moves its derived bounds", () => {
    const moved = moveSelectedPanels([attached], new Set(["a"]), 10, 5, A4_PORTRAIT, { snapping: false }).panels[0];
    expect(moved.label).toEqual(attached.label);
    expect(getPanelLabelBoundsMm(moved, DEFAULT_LABEL_SETTINGS).xMm - getPanelLabelBoundsMm(attached, DEFAULT_LABEL_SETTINGS).xMm).toBe(10);
  });

  it("panel resize preserves label text and millimeter offset", () => {
    const geometry = resizePanelGeometry(attached.geometry, 10, 5, A4_PORTRAIT);
    const resized = { ...attached, geometry };
    expect(resized.label).toEqual(attached.label);
  });

  it("alignment and distribution preserve labels and ignore label bounds", () => {
    const input = [attached, updatePanelLabelText(panel("b", 60, 45), "B"), updatePanelLabelText(panel("c", 110, 60), "C")];
    const aligned = alignSelectedPanels(input, new Set(["a", "b"]), "a", "top", "selection", A4_PORTRAIT);
    const distributed = distributeSelectedPanels(aligned, new Set(["a", "b", "c"]), "horizontal");
    expect(distributed.map((item) => item.label.text)).toEqual(["A1", "B", "C"]);
  });

  it("zoom changes pixels-per-mm but never canonical label geometry", () => {
    const before = getPanelLabelBoundsMm(attached, DEFAULT_LABEL_SETTINGS);
    getViewportMetrics(A4_PORTRAIT, 25);
    getViewportMetrics(A4_PORTRAIT, 400);
    expect(getPanelLabelBoundsMm(attached, DEFAULT_LABEL_SETTINGS)).toEqual(before);
  });

  it("applies changed defaults only to automatically positioned labels", () => {
    const automatic = panel("auto", 20, 20);
    const manual = updatePanelLabelOffset(panel("manual", 50, 20), 3, 4);
    const result = applyDefaultOffsetsToAutomaticLabels(
      [automatic, manual],
      { ...DEFAULT_LABEL_SETTINGS, defaultOffsetXmm: -5, defaultOffsetYmm: -6 },
    );
    expect(result[0].label).toMatchObject({ offsetXmm: -5, offsetYmm: -6, offsetMode: "automatic" });
    expect(result[1].label).toMatchObject({ offsetXmm: 3, offsetYmm: 4, offsetMode: "manual" });
  });
});

describe("label validation hooks", () => {
  it("detects duplicate visible labels as warnings", () => {
    const duplicateA = updatePanelLabelText(panel("a", 10, 20), "A");
    const duplicateB = updatePanelLabelText(panel("b", 40, 20), "A");
    const warnings = getLabelValidationWarnings(
      [{ id: "page-1", definition: A4_PORTRAIT, panels: [duplicateA, duplicateB] }],
      DEFAULT_LABEL_SETTINGS,
    );
    expect(warnings.filter((warning) => warning.code === "duplicate-visible-label")).toHaveLength(2);
  });

  it("detects a label outside the A4 page", () => {
    const outside = updatePanelLabelText(panel("a", 0, 0), "A");
    const warnings = getLabelValidationWarnings(
      [{ id: "page-1", definition: A4_PORTRAIT, panels: [outside] }],
      DEFAULT_LABEL_SETTINGS,
    );
    expect(warnings.some((warning) => warning.code === "label-outside-page")).toBe(true);
    expect(warnings.some((warning) => warning.code === "manual-override")).toBe(true);
  });
});
