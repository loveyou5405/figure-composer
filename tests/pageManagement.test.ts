import { describe, expect, it } from "vitest";
import { autoArrangeProject } from "../src/domain/autoLayout";
import { commitHistory, createHistory, undoHistory } from "../src/domain/history";
import { createDefaultPanelLabel } from "../src/domain/labels";
import type { Panel } from "../src/domain/panel";
import {
  appendA4Page,
  deleteProjectPage,
  duplicateProjectPage,
  getProjectOwnershipErrors,
  movePanelsToPage,
  reorderProjectPage,
  updateProjectPagePanels,
  createInitialProject,
} from "../src/domain/project";

function makePanel(id: string, pageId: string, xMm: number, yMm: number, widthMm = 30, heightMm = 20): Panel {
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
    label: { ...createDefaultPanelLabel(), text: id.toUpperCase() },
  };
}

describe("page management", () => {
  it("appends a stable page with an injectable ID", () => {
    const project = appendA4Page(createInitialProject(), "page-2");
    expect(project.pages.map((page) => [page.id, page.name])).toEqual([
      [project.pages[0].id, "Page 1"],
      ["page-2", "Page 2"],
    ]);
  });

  it("deletes an empty page and renumbers display names", () => {
    let project = appendA4Page(appendA4Page(createInitialProject(), "page-2"), "page-3");
    project = deleteProjectPage(project, "page-2");
    expect(project.pages.map((page) => [page.id, page.name])).toEqual([
      [project.pages[0].id, "Page 1"],
      ["page-3", "Page 2"],
    ]);
  });

  it("deletes a populated page without changing panels owned by other pages", () => {
    let project = appendA4Page(createInitialProject(), "page-2");
    const firstId = project.pages[0].id;
    const retained = makePanel("retained", firstId, 20, 30);
    project = updateProjectPagePanels(project, firstId, () => [retained]);
    project = updateProjectPagePanels(project, "page-2", () => [makePanel("removed", "page-2", 40, 50)]);
    const deleted = deleteProjectPage(project, "page-2");
    expect(deleted.pages).toHaveLength(1);
    expect(deleted.pages[0].panels).toEqual([retained]);
    expect(getProjectOwnershipErrors(deleted)).toEqual([]);
  });

  it("refuses to delete the project's only page", () => {
    expect(() => deleteProjectPage(createInitialProject(), "anything")).toThrow(/at least one page/);
  });

  it("duplicates a populated page with new page and panel IDs", () => {
    let project = createInitialProject();
    const pageId = project.pages[0].id;
    project = updateProjectPagePanels(project, pageId, () => [
      makePanel("a", pageId, 20, 30),
      makePanel("b", pageId, 60, 30),
    ]);
    const panelIds = ["copy-a", "copy-b"];
    const duplicated = duplicateProjectPage(project, pageId, () => "page-copy", () => panelIds.shift()!);
    expect(duplicated.pages).toHaveLength(2);
    expect(duplicated.pages[1].id).toBe("page-copy");
    expect(duplicated.pages[1].panels.map((panel) => panel.id)).toEqual(["copy-a", "copy-b"]);
    expect(duplicated.pages[1].panels.every((panel) => panel.pageId === "page-copy")).toBe(true);
    expect(duplicated.pages[1].panels.map((panel) => panel.assetId)).toEqual(["asset-a", "asset-b"]);
    expect(duplicated.pages[1].panels.map((panel) => panel.label.text)).toEqual(["A", "B"]);
    expect(getProjectOwnershipErrors(duplicated)).toEqual([]);
  });

  it("reorders the page array while preserving stable IDs and panel ownership", () => {
    let project = appendA4Page(createInitialProject(), "page-2");
    const firstId = project.pages[0].id;
    project = updateProjectPagePanels(project, "page-2", () => [makePanel("a", "page-2", 20, 30)]);
    const reordered = reorderProjectPage(project, "page-2", 0);
    expect(reordered.pages.map((page) => page.id)).toEqual(["page-2", firstId]);
    expect(reordered.pages.map((page) => page.name)).toEqual(["Page 1", "Page 2"]);
    expect(reordered.pages[0].panels[0].pageId).toBe("page-2");
  });

  it("moves one panel to the next page at the top safe margin while preserving metadata", () => {
    let project = appendA4Page(createInitialProject(), "page-2");
    const firstId = project.pages[0].id;
    const panel = makePanel("a", firstId, 25, 80);
    project = updateProjectPagePanels(project, firstId, () => [panel]);
    const moved = movePanelsToPage(project, new Set(["a"]), "page-2");
    expect(moved.pages[0].panels).toEqual([]);
    expect(moved.pages[1].panels[0]).toEqual({
      ...panel,
      pageId: "page-2",
      geometry: { ...panel.geometry, xMm: 25, yMm: 12 },
    });
  });

  it("moves a selection as one relative group and clamps it inside the safe right edge", () => {
    let project = appendA4Page(createInitialProject(), "page-2");
    const firstId = project.pages[0].id;
    project = updateProjectPagePanels(project, firstId, () => [
      makePanel("a", firstId, 170, 100, 20, 20),
      makePanel("b", firstId, 196, 130, 8, 10),
      makePanel("untouched", firstId, 40, 200),
    ]);
    const moved = movePanelsToPage(project, new Set(["a", "b"]), "page-2");
    expect(moved.pages[0].panels.map((panel) => panel.id)).toEqual(["untouched"]);
    const [a, b] = moved.pages[1].panels;
    expect(a.geometry).toEqual({ xMm: 164, yMm: 12, widthMm: 20, heightMm: 20 });
    expect(b.geometry).toEqual({ xMm: 190, yMm: 42, widthMm: 8, heightMm: 10 });
    expect(b.geometry.xMm - a.geometry.xMm).toBe(26);
    expect(b.geometry.yMm - a.geometry.yMm).toBe(30);
  });

  it("rejects a group larger than the target safe area without mutation", () => {
    let project = appendA4Page(createInitialProject(), "page-2");
    const firstId = project.pages[0].id;
    project = updateProjectPagePanels(project, firstId, () => [makePanel("wide", firstId, 0, 0, 190, 20)]);
    expect(() => movePanelsToPage(project, new Set(["wide"]), "page-2")).toThrow(/larger than the target page safe area/);
    expect(project.pages[0].panels).toHaveLength(1);
  });

  it("keeps reordered pages in their new order during project Auto Layout", () => {
    let project = appendA4Page(createInitialProject(), "page-2");
    const firstId = project.pages[0].id;
    project = updateProjectPagePanels(project, firstId, () => [makePanel("a", firstId, 20, 30)]);
    project = updateProjectPagePanels(project, "page-2", () => [makePanel("b", "page-2", 30, 40)]);
    project = reorderProjectPage(project, "page-2", 0);
    const orderedIds = project.pages.map((page) => page.id);
    const arranged = autoArrangeProject(project, { target: "project", activePageId: "page-2" });
    expect(arranged.project.pages.map((page) => page.id)).toEqual(orderedIds);
    expect(arranged.project.pages.flatMap((page) => page.panels.map((panel) => panel.id))).toEqual(["b", "a"]);
  });

  it("undoes a complete page operation as one history transaction", () => {
    const initial = createInitialProject();
    const added = appendA4Page(initial, "page-2");
    const history = commitHistory(createHistory(initial), added, "Add page");
    expect(history.past).toHaveLength(1);
    expect(undoHistory(history).present).toBe(initial);
  });
});
