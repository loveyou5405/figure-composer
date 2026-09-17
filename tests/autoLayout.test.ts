import { describe, expect, it } from "vitest";
import {
  autoArrangeProject,
  generateAutoLayoutCandidates,
  getSafeLayoutRegion,
  type AutoLayoutCandidate,
} from "../src/domain/autoLayout";
import { createDefaultPanelLabel } from "../src/domain/labels";
import { A4_PORTRAIT } from "../src/domain/page";
import type { Panel, PanelGeometry } from "../src/domain/panel";
import { resetPanelToPreset } from "../src/domain/preset";
import {
  appendA4Page,
  createInitialProject,
  getProjectOwnershipErrors,
  updateProjectPagePanels,
  type FigureProject,
} from "../src/domain/project";
import { getViewportMetrics } from "../src/domain/viewport";

function makePanel(
  id: string,
  widthMm: number,
  heightMm: number,
  xMm = 20,
  yMm = 20,
  pageId = "page-1",
  typeId = "wb",
): Panel {
  return {
    id,
    pageId,
    assetId: `asset-${id}`,
    typeId,
    presetId: `preset-${typeId}`,
    baseSizeMm: { widthMm: widthMm * 2, heightMm: heightMm * 2 },
    geometry: { xMm, yMm, widthMm, heightMm },
    aspectRatioLocked: true,
    manualScaleOverride: false,
    label: { ...createDefaultPanelLabel(), text: id.toUpperCase() },
  };
}

function projectWithPanels(panels: readonly Panel[], pageCount = 1): FigureProject {
  let project = createInitialProject();
  while (project.pages.length < pageCount) project = appendA4Page(project);
  const pageId = project.pages[0].id;
  return updateProjectPagePanels(project, pageId, () => panels.map((panel) => ({ ...panel, pageId })));
}

function placement(candidate: AutoLayoutCandidate, panelId: string): PanelGeometry {
  return candidate.placements.get(panelId)!;
}

function expectNoOverlap(geometries: readonly PanelGeometry[]): void {
  for (let left = 0; left < geometries.length; left += 1) {
    for (let right = left + 1; right < geometries.length; right += 1) {
      const a = geometries[left];
      const b = geometries[right];
      const separated = a.xMm + a.widthMm <= b.xMm
        || b.xMm + b.widthMm <= a.xMm
        || a.yMm + a.heightMm <= b.yMm
        || b.yMm + b.heightMm <= a.yMm;
      expect(separated).toBe(true);
    }
  }
}

describe("deterministic row-packing candidates", () => {
  it("packs equal-size panels inside the A4 safe area with exact millimeter gaps", () => {
    const panels = Array.from({ length: 6 }, (_, index) => makePanel(`p${index}`, 50, 30));
    const region = getSafeLayoutRegion(A4_PORTRAIT);
    const [candidate] = generateAutoLayoutCandidates(panels, region, {
      mode: "balanced",
      horizontalGapMm: 3,
      verticalGapMm: 3,
    });

    expect(candidate).toBeDefined();
    candidate.rows.forEach((row) => {
      const rowPanels = row.panelIds.map((id) => placement(candidate, id));
      for (let index = 1; index < rowPanels.length; index += 1) {
        expect(rowPanels[index].xMm - (rowPanels[index - 1].xMm + rowPanels[index - 1].widthMm)).toBe(3);
      }
    });
    for (let index = 1; index < candidate.rows.length; index += 1) {
      expect(candidate.rows[index].yMm - (candidate.rows[index - 1].yMm + candidate.rows[index - 1].heightMm)).toBe(3);
    }
    const geometries = [...candidate.placements.values()];
    expectNoOverlap(geometries);
    geometries.forEach((geometry) => {
      expect(geometry.xMm).toBeGreaterThanOrEqual(region.xMm);
      expect(geometry.yMm).toBeGreaterThanOrEqual(region.yMm);
      expect(geometry.xMm + geometry.widthMm).toBeLessThanOrEqual(region.xMm + region.widthMm);
      expect(geometry.yMm + geometry.heightMm).toBeLessThanOrEqual(region.yMm + region.heightMm);
    });
  });

  it("handles mixed scientific-panel aspect ratios without changing dimensions", () => {
    const panels = [
      makePanel("wb-a", 42, 18, 30, 40, "page-1", "wb"),
      makePanel("if-a", 35, 35, 90, 30, "page-1", "if"),
      makePanel("graph-a", 54, 40, 140, 80, "page-1", "graph"),
      makePanel("ihc-a", 38, 32, 50, 130, "page-1", "ihc"),
    ];
    const [candidate] = generateAutoLayoutCandidates(panels, getSafeLayoutRegion(A4_PORTRAIT));
    expect(candidate).toBeDefined();
    panels.forEach((panel) => {
      expect(placement(candidate, panel.id).widthMm).toBe(panel.geometry.widthMm);
      expect(placement(candidate, panel.id).heightMm).toBe(panel.geometry.heightMm);
    });
    expectNoOverlap([...candidate.placements.values()]);
  });

  it("supports Balanced, Compact, and Equal Rows as valid deterministic modes", () => {
    const panels = Array.from({ length: 6 }, (_, index) => makePanel(`p${index}`, 46 + index, 24 + index));
    const region = getSafeLayoutRegion(A4_PORTRAIT);
    const balanced = generateAutoLayoutCandidates(panels, region, { mode: "balanced" })[0];
    const compact = generateAutoLayoutCandidates(panels, region, { mode: "compact" })[0];
    const equalRows = generateAutoLayoutCandidates(panels, region, { mode: "equal-rows" })[0];
    [balanced, compact, equalRows].forEach((candidate) => {
      expect(candidate).toBeDefined();
      expectNoOverlap([...candidate.placements.values()]);
    });
    expect(compact.rows.every((row) => row.xMm === region.xMm)).toBe(true);
    const equalCounts = equalRows.rows.map((row) => row.panelIds.length);
    expect(Math.max(...equalCounts) - Math.min(...equalCounts)).toBeLessThanOrEqual(1);
  });

  it("returns the same top-N candidates for identical inputs", () => {
    const panels = [
      makePanel("a", 52, 22),
      makePanel("b", 35, 35),
      makePanel("c", 60, 38),
      makePanel("d", 31, 44),
      makePanel("e", 45, 28),
    ];
    const first = generateAutoLayoutCandidates(panels, getSafeLayoutRegion(A4_PORTRAIT), { maxCandidates: 3 });
    const second = generateAutoLayoutCandidates(panels, getSafeLayoutRegion(A4_PORTRAIT), { maxCandidates: 3 });
    expect(first.length).toBeGreaterThan(1);
    expect(first.map((candidate) => [candidate.key, candidate.score])).toEqual(
      second.map((candidate) => [candidate.key, candidate.score]),
    );
    expect([...first[0].placements]).toEqual([...second[0].placements]);
  });

  it("penalizes an avoidable single-panel final row", () => {
    const panels = Array.from({ length: 4 }, (_, index) => makePanel(`p${index}`, 50, 30));
    const [candidate] = generateAutoLayoutCandidates(
      panels,
      { xMm: 0, yMm: 0, widthMm: 160, heightMm: 100 },
      { mode: "balanced", horizontalGapMm: 3, verticalGapMm: 3 },
    );
    expect(candidate.rows.map((row) => row.panelIds.length)).toEqual([2, 2]);
    expect(candidate.scoreBreakdown.orphanRow).toBe(0);
  });

  it("does not use minor scaling by default and bounds it to five percent when enabled", () => {
    const panels = [makePanel("a", 93.5, 50), makePanel("b", 93.5, 50)];
    const region = { xMm: 0, yMm: 0, widthMm: 186, heightMm: 50 };
    expect(generateAutoLayoutCandidates(panels, region)).toEqual([]);
    const [candidate] = generateAutoLayoutCandidates(panels, region, { allowMinorScaling: true });
    expect(candidate.scaleFactor).toBeLessThan(1);
    expect(candidate.scaleFactor).toBeGreaterThanOrEqual(0.95);
    expect(placement(candidate, "a").widthMm / panels[0].geometry.widthMm).toBeCloseTo(candidate.scaleFactor, 3);
  });

  it("is independent of viewport zoom", () => {
    const panels = [makePanel("a", 42, 18), makePanel("b", 35, 35), makePanel("c", 54, 40)];
    getViewportMetrics(A4_PORTRAIT, 50);
    const at50 = generateAutoLayoutCandidates(panels, getSafeLayoutRegion(A4_PORTRAIT))[0];
    getViewportMetrics(A4_PORTRAIT, 300);
    const at300 = generateAutoLayoutCandidates(panels, getSafeLayoutRegion(A4_PORTRAIT))[0];
    expect([...at50.placements]).toEqual([...at300.placements]);
  });
});

describe("auto-arrange scopes and pagination", () => {
  it("arranges only the selected panels and leaves unrelated panels unchanged", () => {
    const panels = [
      makePanel("a", 30, 20, 20, 20),
      makePanel("b", 30, 20, 70, 20),
      makePanel("c", 30, 20, 130, 180),
    ];
    const project = projectWithPanels(panels);
    const pageId = project.pages[0].id;
    const untouched = project.pages[0].panels[2];
    const result = autoArrangeProject(project, {
      target: "selection",
      activePageId: pageId,
      selectedPanelIds: new Set(["a", "b"]),
    });
    expect(result.applied).toBe(true);
    expect(result.project.pages[0].panels[2]).toBe(untouched);
    expect(result.affectedPanelIds).toEqual(["a", "b"]);
  });

  it("arranges a page inside safe margins while preserving preset metadata, labels, and manual overrides", () => {
    const panels = [
      makePanel("a", 42, 18, 10, 10, "page-1", "wb"),
      { ...makePanel("b", 35, 35, 100, 100, "page-1", "if"), manualScaleOverride: true },
      makePanel("c", 54, 40, 150, 230, "page-1", "graph"),
    ];
    const project = projectWithPanels(panels);
    const pageId = project.pages[0].id;
    const result = autoArrangeProject(project, { target: "page", activePageId: pageId, autoPaginate: false });
    expect(result.applied).toBe(true);
    const arranged = result.project.pages[0].panels;
    arranged.forEach((panel, index) => {
      expect(panel.geometry.widthMm).toBe(panels[index].geometry.widthMm);
      expect(panel.geometry.heightMm).toBe(panels[index].geometry.heightMm);
      expect(panel.typeId).toBe(panels[index].typeId);
      expect(panel.presetId).toBe(panels[index].presetId);
      expect(panel.manualScaleOverride).toBe(panels[index].manualScaleOverride);
      expect(panel.label).toEqual(panels[index].label);
    });
    expect(result.transaction?.kind).toBe("auto-layout");
    expect(result.transaction?.before).toBe(project);
    expect(result.transaction?.after).toBe(result.project);
  });

  it("creates Page 2 for ordered overflow without changing panel identities", () => {
    const panels = Array.from({ length: 7 }, (_, index) => makePanel(`p${index}`, 90, 90));
    const project = projectWithPanels(panels);
    const result = autoArrangeProject(project, {
      target: "page",
      activePageId: project.pages[0].id,
      autoPaginate: true,
      pageIdFactory: (pageNumber) => `stable-page-${pageNumber}`,
    });
    expect(result.applied).toBe(true);
    expect(result.project.pages).toHaveLength(2);
    expect(result.createdPageIds).toEqual(["stable-page-2"]);
    expect(result.project.pages.flatMap((page) => page.panels.map((panel) => panel.id))).toEqual(
      panels.map((panel) => panel.id),
    );
    expect(getProjectOwnershipErrors(result.project)).toEqual([]);
  });

  it("creates Page 3 for a larger ordered dataset", () => {
    const panels = Array.from({ length: 9 }, (_, index) => makePanel(`p${index}`, 90, 90));
    const project = projectWithPanels(panels);
    const result = autoArrangeProject(project, {
      target: "project",
      activePageId: project.pages[0].id,
      pageIdFactory: (pageNumber) => `stable-page-${pageNumber}`,
    });
    expect(result.project.pages).toHaveLength(3);
    expect(result.project.pages.map((page) => page.panels.length)).toEqual([4, 4, 1]);
  });

  it("reuses existing pages before creating another and preserves project order", () => {
    const panels = Array.from({ length: 9 }, (_, index) => makePanel(`p${index}`, 90, 90));
    const project = projectWithPanels(panels, 2);
    const existingPageIds = project.pages.map((page) => page.id);
    const result = autoArrangeProject(project, {
      target: "project",
      activePageId: project.pages[0].id,
      pageIdFactory: (pageNumber) => `new-page-${pageNumber}`,
    });
    expect(result.project.pages.slice(0, 2).map((page) => page.id)).toEqual(existingPageIds);
    expect(result.createdPageIds).toEqual(["new-page-3"]);
    expect(result.project.pages.flatMap((page) => page.panels.map((panel) => panel.id))).toEqual(
      panels.map((panel) => panel.id),
    );
  });

  it("reports failure atomically when pagination is disabled and content cannot fit", () => {
    const panels = Array.from({ length: 7 }, (_, index) => makePanel(`p${index}`, 90, 90));
    const project = projectWithPanels(panels);
    const result = autoArrangeProject(project, {
      target: "page",
      activePageId: project.pages[0].id,
      autoPaginate: false,
    });
    expect(result.applied).toBe(false);
    expect(result.project).toBe(project);
    expect(result.error).toMatch(/Auto Pagination/);
  });

  it("marks optional auto scaling without redefining the preset or manual override", () => {
    const panels = [makePanel("a", 93.5, 136), makePanel("b", 93.5, 136)];
    const project = projectWithPanels(panels);
    const result = autoArrangeProject(project, {
      target: "page",
      activePageId: project.pages[0].id,
      allowMinorScaling: true,
      autoPaginate: false,
    });
    expect(result.applied).toBe(true);
    result.project.pages[0].panels.forEach((panel) => {
      expect(panel.layoutScaleFactor).toBeGreaterThanOrEqual(0.95);
      expect(panel.presetId).toBe("preset-wb");
      expect(panel.manualScaleOverride).toBe(false);
      const reset = resetPanelToPreset(
        panel,
        { id: "preset-wb", scalePercent: 50, lockAspectRatio: true },
        A4_PORTRAIT,
      );
      expect(reset.layoutScaleFactor).toBeUndefined();
      expect(reset.geometry.widthMm).toBe(93.5);
      expect(reset.geometry.heightMm).toBe(136);
    });
  });
});
