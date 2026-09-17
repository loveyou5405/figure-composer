import { describe, expect, it } from "vitest";
import { A4_PORTRAIT } from "../src/domain/page";
import type { Panel } from "../src/domain/panel";
import { createDefaultPanelLabel } from "../src/domain/labels";
import {
  appendA4Page,
  createInitialProject,
  getAllProjectPanels,
  getProjectOwnershipErrors,
  movePanelToPage,
  updateProjectPagePanels,
} from "../src/domain/project";

function makePanel(id: string, pageId: string): Panel {
  return {
    id,
    pageId,
    assetId: `asset-${id}`,
    typeId: "wb",
    presetId: "preset-wb",
    baseSizeMm: { widthMm: 64, heightMm: 32 },
    geometry: { xMm: 18, yMm: 25, widthMm: 32, heightMm: 16 },
    aspectRatioLocked: true,
    manualScaleOverride: false,
    label: createDefaultPanelLabel(),
  };
}

describe("multi-page project architecture", () => {
  it("starts with one stable A4 page owned by the project", () => {
    const project = createInitialProject();
    expect(project.id).toMatch(/^project-/);
    expect(project.pages).toHaveLength(1);
    expect(project.pages[0].id).toMatch(/^page-/);
    expect(project.pages[0].definition).toEqual(A4_PORTRAIT);
    expect(getProjectOwnershipErrors(project)).toEqual([]);
  });

  it("appends independent ordered A4 pages with stable IDs", () => {
    const project = appendA4Page(appendA4Page(createInitialProject()));
    expect(project.pages.map((page) => page.name)).toEqual(["Page 1", "Page 2", "Page 3"]);
    expect(new Set(project.pages.map((page) => page.id)).size).toBe(3);
    expect(project.pages.every((page) => page.definition.widthMm === 210)).toBe(true);
    expect(project.pages.every((page) => page.definition.heightMm === 297)).toBe(true);
  });

  it("updates panels on one page without touching sibling pages", () => {
    let project = appendA4Page(createInitialProject());
    const [page1, page2] = project.pages;
    project = updateProjectPagePanels(project, page1.id, () => [makePanel("panel-a", page1.id)]);
    expect(project.pages[0].panels).toHaveLength(1);
    expect(project.pages[1]).toBe(page2);
    expect(getProjectOwnershipErrors(project)).toEqual([]);
  });

  it("rejects a panel whose pageId disagrees with its owning page", () => {
    const project = createInitialProject();
    const pageId = project.pages[0].id;
    expect(() => updateProjectPagePanels(
      project,
      pageId,
      () => [makePanel("panel-a", "page-wrong")],
    )).toThrow(/owning page/);
  });

  it("moves a panel between pages while preserving page-local geometry and panel metadata", () => {
    let project = appendA4Page(createInitialProject());
    const [page1, page2] = project.pages;
    const panel = makePanel("panel-a", page1.id);
    project = updateProjectPagePanels(project, page1.id, () => [panel]);
    const nextGeometry = { ...panel.geometry, xMm: 12, yMm: 14 };

    const moved = movePanelToPage(project, panel.id, page2.id, nextGeometry);
    expect(moved.pages[0].panels).toEqual([]);
    expect(moved.pages[1].panels[0]).toEqual({
      ...panel,
      pageId: page2.id,
      geometry: nextGeometry,
    });
    expect(getAllProjectPanels(moved)).toHaveLength(1);
    expect(getProjectOwnershipErrors(moved)).toEqual([]);
  });

  it("detects duplicate panel ownership across pages", () => {
    const project = appendA4Page(createInitialProject());
    const [page1, page2] = project.pages;
    const invalid = {
      ...project,
      pages: [
        { ...page1, panels: [makePanel("panel-a", page1.id)] },
        { ...page2, panels: [makePanel("panel-a", page2.id)] },
      ],
    };
    expect(getProjectOwnershipErrors(invalid)).toContain("Panel panel-a appears on more than one page.");
  });
});
