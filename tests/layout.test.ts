import { describe, expect, it } from "vitest";
import {
  alignSelectedPanels,
  distributeSelectedPanels,
  equalizeSelectedPanelSize,
  moveSelectedPanels,
  setSelectedPanelGap,
  type AlignmentOperation,
} from "../src/domain/layout";
import { A4_PORTRAIT } from "../src/domain/page";
import type { Panel } from "../src/domain/panel";
import { createDefaultPanelLabel } from "../src/domain/labels";
import { appendA4Page, createInitialProject, updateProjectPagePanels } from "../src/domain/project";
import { getViewportMetrics } from "../src/domain/viewport";

function panel(
  id: string,
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  pageId = "page-1",
): Panel {
  return {
    id,
    pageId,
    assetId: `asset-${id}`,
    typeId: "wb",
    presetId: "preset-wb",
    baseSizeMm: { widthMm: widthMm * 2, heightMm: heightMm * 2 },
    geometry: { xMm, yMm, widthMm, heightMm },
    aspectRatioLocked: true,
    manualScaleOverride: false,
    label: createDefaultPanelLabel(),
  };
}

function byId(panels: readonly Panel[], id: string): Panel {
  return panels.find((candidate) => candidate.id === id)!;
}

const selectedABC = new Set(["a", "b", "c"]);

describe("group movement", () => {
  it("moves every selected panel by an identical delta and preserves relative spacing", () => {
    const panels = [panel("a", 20, 20, 20, 10), panel("b", 55, 30, 25, 12), panel("c", 90, 40, 15, 20)];
    const moved = moveSelectedPanels(panels, selectedABC, 12, 5, A4_PORTRAIT, { snapping: false });
    expect(moved.panels.map((item, index) => item.geometry.xMm - panels[index].geometry.xMm)).toEqual([12, 12, 12]);
    expect(byId(moved.panels, "b").geometry.xMm - byId(moved.panels, "a").geometry.xMm).toBe(35);
  });

  it("clamps the entire selection when one panel reaches a page boundary", () => {
    const panels = [panel("a", 150, 20, 20, 10), panel("b", 185, 30, 25, 12)];
    const moved = moveSelectedPanels(panels, new Set(["a", "b"]), 20, 0, A4_PORTRAIT, { snapping: false });
    expect(moved.deltaXMm).toBe(0);
    expect(moved.panels).toEqual(panels);
  });

  it("is independent of viewport zoom", () => {
    const panels = [panel("a", 20, 20, 20, 10), panel("b", 55, 30, 25, 12)];
    getViewportMetrics(A4_PORTRAIT, 50);
    const at50 = moveSelectedPanels(panels, new Set(["a", "b"]), 8, 3, A4_PORTRAIT, { snapping: false });
    getViewportMetrics(A4_PORTRAIT, 200);
    const at200 = moveSelectedPanels(panels, new Set(["a", "b"]), 8, 3, A4_PORTRAIT, { snapping: false });
    expect(at50.panels).toEqual(at200.panels);
  });

  it("supports the required 1 mm and 5 mm keyboard nudge deltas", () => {
    const panels = [panel("a", 20, 20, 20, 10), panel("b", 55, 30, 25, 12)];
    const ids = new Set(["a", "b"]);
    const oneMillimeter = moveSelectedPanels(panels, ids, 1, 0, A4_PORTRAIT, { snapping: false });
    const fiveMillimeters = moveSelectedPanels(panels, ids, 0, 5, A4_PORTRAIT, { snapping: false });
    expect(oneMillimeter.panels.map((item, index) => item.geometry.xMm - panels[index].geometry.xMm)).toEqual([1, 1]);
    expect(fiveMillimeters.panels.map((item, index) => item.geometry.yMm - panels[index].geometry.yMm)).toEqual([5, 5]);
  });
});

describe("anchor alignment", () => {
  const original = [panel("a", 10, 20, 20, 10), panel("b", 50, 50, 30, 20), panel("c", 100, 80, 40, 30)];
  const expected: Record<AlignmentOperation, (item: Panel, anchor: Panel) => number> = {
    left: (item) => item.geometry.xMm,
    "horizontal-center": (item) => item.geometry.xMm + item.geometry.widthMm / 2,
    right: (item) => item.geometry.xMm + item.geometry.widthMm,
    top: (item) => item.geometry.yMm,
    "vertical-center": (item) => item.geometry.yMm + item.geometry.heightMm / 2,
    bottom: (item) => item.geometry.yMm + item.geometry.heightMm,
  };

  it.each(Object.keys(expected) as AlignmentOperation[])("aligns %s to the anchor", (operation) => {
    const result = alignSelectedPanels(original, selectedABC, "c", operation, "selection", A4_PORTRAIT);
    const anchor = byId(result, "c");
    expect(expected[operation](byId(result, "a"), anchor)).toBe(expected[operation](anchor, anchor));
    expect(expected[operation](byId(result, "b"), anchor)).toBe(expected[operation](anchor, anchor));
  });

  it("keeps the anchor panel stationary", () => {
    const result = alignSelectedPanels(original, selectedABC, "c", "left", "selection", A4_PORTRAIT);
    expect(byId(result, "c")).toBe(original[2]);
  });

  it("supports compact page alignment using safe margins and page center", () => {
    const left = alignSelectedPanels(original, selectedABC, "c", "left", "page", A4_PORTRAIT);
    const centered = alignSelectedPanels(original, selectedABC, "c", "horizontal-center", "page", A4_PORTRAIT);
    expect(Math.min(...left.map((item) => item.geometry.xMm))).toBe(A4_PORTRAIT.marginMm);
    const min = Math.min(...centered.map((item) => item.geometry.xMm));
    const max = Math.max(...centered.map((item) => item.geometry.xMm + item.geometry.widthMm));
    expect((min + max) / 2).toBe(A4_PORTRAIT.widthMm / 2);
  });
});

describe("distribution and explicit spacing", () => {
  it("creates equal horizontal edge gaps with different panel widths and preserves geometric order", () => {
    const panels = [panel("c", 100, 20, 40, 10), panel("a", 10, 20, 20, 10), panel("b", 55, 20, 30, 10)];
    const result = distributeSelectedPanels(panels, selectedABC, "horizontal");
    const ordered = [...result].sort((a, b) => a.geometry.xMm - b.geometry.xMm);
    const gaps = [
      ordered[1].geometry.xMm - (ordered[0].geometry.xMm + ordered[0].geometry.widthMm),
      ordered[2].geometry.xMm - (ordered[1].geometry.xMm + ordered[1].geometry.widthMm),
    ];
    expect(gaps[0]).toBe(gaps[1]);
    expect(ordered.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(byId(result, "a").geometry.xMm).toBe(10);
    expect(byId(result, "c").geometry.xMm).toBe(100);
  });

  it("creates equal vertical edge gaps", () => {
    const panels = [panel("a", 10, 10, 20, 10), panel("b", 10, 45, 20, 20), panel("c", 10, 100, 20, 30)];
    const result = distributeSelectedPanels(panels, selectedABC, "vertical");
    const a = byId(result, "a");
    const b = byId(result, "b");
    const c = byId(result, "c");
    expect(b.geometry.yMm - (a.geometry.yMm + a.geometry.heightMm))
      .toBe(c.geometry.yMm - (b.geometry.yMm + b.geometry.heightMm));
  });

  it("sets horizontal gaps to exactly 2 mm", () => {
    const panels = [panel("a", 10, 10, 20, 10), panel("b", 50, 10, 30, 10), panel("c", 100, 10, 40, 10)];
    const result = setSelectedPanelGap(panels, selectedABC, "horizontal", 2, A4_PORTRAIT);
    expect(byId(result, "b").geometry.xMm).toBe(32);
    expect(byId(result, "c").geometry.xMm).toBe(64);
  });

  it("sets vertical gaps to exactly 2 mm", () => {
    const panels = [panel("a", 10, 10, 20, 10), panel("b", 10, 50, 20, 20), panel("c", 10, 100, 20, 30)];
    const result = setSelectedPanelGap(panels, selectedABC, "vertical", 2, A4_PORTRAIT);
    expect(byId(result, "b").geometry.yMm).toBe(22);
    expect(byId(result, "c").geometry.yMm).toBe(44);
  });
});

describe("equal-size operations", () => {
  const panels = [panel("a", 10, 20, 20, 10), panel("b", 50, 40, 30, 10), panel("c", 100, 80, 50, 25)];

  it("uses anchor width while preserving each panel aspect ratio", () => {
    const result = equalizeSelectedPanelSize(panels, selectedABC, "c", "width", A4_PORTRAIT);
    expect(byId(result, "a").geometry).toMatchObject({ widthMm: 50, heightMm: 25 });
    expect(byId(result, "b").geometry).toMatchObject({ widthMm: 50, heightMm: 16.667 });
    expect(byId(result, "c")).toBe(panels[2]);
  });

  it("uses anchor height while preserving each panel aspect ratio", () => {
    const result = equalizeSelectedPanelSize(panels, selectedABC, "c", "height", A4_PORTRAIT);
    expect(byId(result, "a").geometry).toMatchObject({ widthMm: 50, heightMm: 25 });
    expect(byId(result, "b").geometry).toMatchObject({ widthMm: 75, heightMm: 25 });
  });

  it("marks resized panels as manual overrides without changing preset metadata", () => {
    const originalPreset = panels[0].presetId;
    const result = equalizeSelectedPanelSize(panels, selectedABC, "c", "width", A4_PORTRAIT);
    expect(byId(result, "a").manualScaleOverride).toBe(true);
    expect(byId(result, "a").presetId).toBe(originalPreset);
    expect(panels[0].manualScaleOverride).toBe(false);
  });
});

describe("smart snapping", () => {
  const panels = [panel("a", 20, 20, 20, 10), panel("b", 70, 60, 30, 20)];

  it("snaps to another panel edge", () => {
    const result = moveSelectedPanels(panels, new Set(["a"]), 49, 0, A4_PORTRAIT, { toleranceMm: 2 });
    expect(byId(result.panels, "a").geometry.xMm).toBe(70);
    expect(result.guides).toContainEqual({ axis: "vertical", positionMm: 70, source: "panel" });
  });

  it("snaps to another panel center", () => {
    const result = moveSelectedPanels(panels, new Set(["a"]), 54, 0, A4_PORTRAIT, { toleranceMm: 2 });
    expect(byId(result.panels, "a").geometry.xMm + 10).toBe(85);
  });

  it("snaps to a safe page margin", () => {
    const result = moveSelectedPanels(panels, new Set(["a"]), -7, 0, A4_PORTRAIT, { toleranceMm: 2 });
    expect(byId(result.panels, "a").geometry.xMm).toBe(12);
    expect(result.guides).toContainEqual({ axis: "vertical", positionMm: 12, source: "page" });
  });

  it("snaps to page center", () => {
    const result = moveSelectedPanels(panels, new Set(["a"]), 74, 0, A4_PORTRAIT, { toleranceMm: 2 });
    expect(byId(result.panels, "a").geometry.xMm + 10).toBe(105);
  });

  it("temporary snap disable preserves the unsnapped millimeter delta", () => {
    const result = moveSelectedPanels(panels, new Set(["a"]), 49.4, 0.3, A4_PORTRAIT, { snapping: false });
    expect(byId(result.panels, "a").geometry).toMatchObject({ xMm: 69.4, yMm: 20.3 });
    expect(result.guides).toEqual([]);
  });

  it("falls back to the 1 mm page grid when no smart candidate is close", () => {
    const result = moveSelectedPanels(panels, new Set(["a"]), 3.4, 3.4, A4_PORTRAIT, { toleranceMm: 0.25 });
    expect(byId(result.panels, "a").geometry).toMatchObject({ xMm: 23, yMm: 23 });
  });

  it("converts a fixed pixel tolerance so snap geometry is consistent across zoom", () => {
    const targetDelta = 50;
    const at50 = getViewportMetrics(A4_PORTRAIT, 50);
    const at200 = getViewportMetrics(A4_PORTRAIT, 200);
    const result50 = moveSelectedPanels(
      panels,
      new Set(["a"]),
      targetDelta - 4 / at50.pixelsPerMm,
      0,
      A4_PORTRAIT,
      { toleranceMm: 6 / at50.pixelsPerMm },
    );
    const result200 = moveSelectedPanels(
      panels,
      new Set(["a"]),
      targetDelta - 4 / at200.pixelsPerMm,
      0,
      A4_PORTRAIT,
      { toleranceMm: 6 / at200.pixelsPerMm },
    );
    expect(byId(result50.panels, "a").geometry.xMm).toBe(70);
    expect(result50.panels).toEqual(result200.panels);
  });
});

describe("active-page isolation", () => {
  it("never mutates panels on another project page", () => {
    let project = appendA4Page(createInitialProject());
    const [page1, page2] = project.pages;
    project = updateProjectPagePanels(project, page1.id, () => [panel("a", 20, 20, 20, 10, page1.id)]);
    project = updateProjectPagePanels(project, page2.id, () => [panel("b", 20, 20, 20, 10, page2.id)]);
    const untouchedPage2 = project.pages[1];
    project = updateProjectPagePanels(project, page1.id, (pagePanels) => moveSelectedPanels(
      pagePanels,
      new Set(["a"]),
      10,
      10,
      page1.definition,
      { snapping: false },
    ).panels);
    expect(project.pages[1]).toBe(untouchedPage2);
    expect(project.pages[1].panels[0].geometry).toMatchObject({ xMm: 20, yMm: 20 });
  });
});
