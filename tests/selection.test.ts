import { describe, expect, it } from "vitest";
import type { Panel } from "../src/domain/panel";
import { createDefaultPanelLabel } from "../src/domain/labels";
import {
  clearPanelSelection,
  selectAllPanels,
  selectOnlyPanel,
  selectPanelsIntersectingMarquee,
  togglePanelSelection,
} from "../src/domain/selection";

function panel(id: string, pageId: string, xMm: number): Panel {
  return {
    id,
    pageId,
    assetId: `asset-${id}`,
    typeId: "other",
    presetId: "preset-other",
    baseSizeMm: { widthMm: 20, heightMm: 10 },
    geometry: { xMm, yMm: 20, widthMm: 20, heightMm: 10 },
    aspectRatioLocked: true,
    manualScaleOverride: false,
    label: createDefaultPanelLabel(),
  };
}

describe("multi-panel selection", () => {
  it("shift-click adds a panel and makes it the anchor", () => {
    const result = togglePanelSelection(selectOnlyPanel("a"), "b");
    expect(result).toEqual({ selectedPanelIds: ["a", "b"], anchorPanelId: "b" });
  });

  it("shift-click on a selected panel removes it", () => {
    const result = togglePanelSelection(
      { selectedPanelIds: ["a", "b", "c"], anchorPanelId: "c" },
      "b",
    );
    expect(result).toEqual({ selectedPanelIds: ["a", "c"], anchorPanelId: "c" });
  });

  it("falls back to the last remaining selected panel when the anchor is removed", () => {
    const result = togglePanelSelection(
      { selectedPanelIds: ["a", "b", "c"], anchorPanelId: "c" },
      "c",
    );
    expect(result.anchorPanelId).toBe("b");
  });

  it("empty-canvas clearing removes selection and anchor", () => {
    expect(clearPanelSelection()).toEqual({ selectedPanelIds: [], anchorPanelId: null });
  });

  it("select all receives active-page panels only", () => {
    const page1Panels = [panel("a", "page-1", 10), panel("b", "page-1", 40)];
    const otherPage = panel("c", "page-2", 70);
    const result = selectAllPanels(page1Panels);
    expect(result.selectedPanelIds).toEqual(["a", "b"]);
    expect(result.selectedPanelIds).not.toContain(otherPage.id);
    expect(result.anchorPanelId).toBe("b");
  });

  it("marquee selection uses bounding-box intersection", () => {
    const panels = [panel("a", "page-1", 10), panel("b", "page-1", 40), panel("c", "page-1", 80)];
    const result = selectPanelsIntersectingMarquee(
      panels,
      { xMm: 29, yMm: 0, widthMm: 32, heightMm: 100 },
    );
    expect(result.selectedPanelIds).toEqual(["a", "b"]);
    expect(result.anchorPanelId).toBe("b");
  });
});
