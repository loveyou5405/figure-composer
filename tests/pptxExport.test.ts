import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { ImportedAsset } from "../src/domain/asset";
import { createInitialEditorDocument, type EditorDocument } from "../src/domain/editorDocument";
import { createDefaultPanelLabel } from "../src/domain/labels";
import type { Panel } from "../src/domain/panel";
import { appendA4Page, appendNewFigure, updateProjectPagePanels } from "../src/domain/project";
import {
  A4_HEIGHT_EMU,
  A4_WIDTH_EMU,
  EMU_PER_MILLIMETER,
  PptxExportError,
  buildPptxExportPlan,
  exportPptx,
  mmToInches,
} from "../src/services/pptxExport";

const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const simpleSvg = "data:image/svg+xml;base64," + btoa("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"100\"><rect width=\"200\" height=\"100\" fill=\"#ccd8ff\"/></svg>");

function asset(id: string, kind: ImportedAsset["kind"], previewUrl = `blob:${id}`): ImportedAsset {
  return {
    id,
    sourceName: `${id}.${kind === "jpeg" ? "jpg" : kind}`,
    mimeType: kind === "svg" ? "image/svg+xml" : `image/${kind}`,
    kind,
    intrinsicWidthPx: 800,
    intrinsicHeightPx: 400,
    byteSize: 100,
    lastModified: 1,
    previewUrl,
  };
}

function panel(
  id: string,
  pageId: string,
  assetId: string,
  label: string,
  xMm: number,
  yMm: number,
): Panel {
  return {
    id,
    pageId,
    assetId,
    typeId: "wb",
    presetId: "preset-wb",
    baseSizeMm: { widthMm: 40, heightMm: 20 },
    geometry: { xMm, yMm, widthMm: 40, heightMm: 20 },
    aspectRatioLocked: true,
    manualScaleOverride: false,
    label: { ...createDefaultPanelLabel(), text: label },
  };
}

function twoPageDocument(): EditorDocument {
  const initial = createInitialEditorDocument();
  const project = appendA4Page(initial.project, "page-2");
  const page1Id = project.pages[0].id;
  const withPage1 = updateProjectPagePanels(project, page1Id, () => [
    panel("panel-a", page1Id, "asset-png", "A", 20, 30),
  ]);
  const withPage2 = updateProjectPagePanels(withPage1, "page-2", () => [
    panel("panel-beta", "page-2", "asset-svg", "β", 18, 25),
  ]);
  return {
    ...initial,
    project: { ...withPage2, title: "M10 geometry" },
    assets: [asset("asset-png", "png"), asset("asset-svg", "svg")],
  };
}

function multiFigureDocument(): EditorDocument {
  const source = twoPageDocument();
  const project = appendNewFigure(source.project, "page-3", "figure-2");
  return {
    ...source,
    project: updateProjectPagePanels(project, "page-3", () => [
      panel("panel-c", "page-3", "asset-png", "A", 22, 28),
    ]),
  };
}

describe("PPTX export planning", () => {
  it("uses direct deterministic millimeter conversions for A4", () => {
    expect(mmToInches(25.4)).toBe(1);
    expect(EMU_PER_MILLIMETER).toBe(36_000);
    expect(A4_WIDTH_EMU).toBe(7_560_000);
    expect(A4_HEIGHT_EMU).toBe(10_692_000);
  });

  it("maps every ordered project page to one slide by default", () => {
    const source = twoPageDocument();
    const plan = buildPptxExportPlan(source, { scope: "all", activePageId: source.project.pages[0].id });
    expect(plan.slides.map((slide) => slide.pageId)).toEqual([source.project.pages[0].id, "page-2"]);
  });

  it("exports every Figure into one ordered deck and restarts Figure-local page numbers", () => {
    const source = multiFigureDocument();
    const plan = buildPptxExportPlan(source, {
      scope: "all",
      activePageId: source.project.pages[0].id,
    });
    expect(plan.slides.map((slide) => [slide.figureNumber, slide.figurePageNumber, slide.pageId])).toEqual([
      [1, 1, source.project.pages[0].id],
      [1, 2, "page-2"],
      [2, 1, "page-3"],
    ]);
  });

  it("can export only the active page", () => {
    const plan = buildPptxExportPlan(twoPageDocument(), { scope: "current", activePageId: "page-2" });
    expect(plan.slides).toHaveLength(1);
    expect(plan.slides[0].pageId).toBe("page-2");
  });

  it("keeps panels and labels as independent named objects with exact page-local geometry", () => {
    const source = twoPageDocument();
    const plan = buildPptxExportPlan(source, { scope: "all", activePageId: source.project.pages[0].id });
    expect(plan.slides[0].images[0]).toMatchObject({
      panelId: "panel-a",
      objectName: "Panel_A_WB",
      geometryMm: { xMm: 20, yMm: 30, widthMm: 40, heightMm: 20 },
    });
    expect(plan.slides[0].labels[0]).toMatchObject({
      panelId: "panel-a",
      objectName: "Label_A",
      text: "A",
      xMm: 18,
    });
    expect(plan.slides[0].labels[0].yMm + plan.slides[0].labels[0].heightMm).toBeCloseTo(28, 10);
    expect(plan.slides[1].labels[0].text).toBe("β");
  });

  it("blocks export when a source must be relinked", () => {
    const source = twoPageDocument();
    const missing = { ...source, assets: source.assets.map((item) => item.id === "asset-png" ? { ...item, previewUrl: "", missing: true } : item) };
    expect(() => buildPptxExportPlan(missing, { scope: "all", activePageId: source.project.pages[0].id }))
      .toThrow(PptxExportError);
  });

  it("warns without mutating panels that extend beyond the page", () => {
    const source = twoPageDocument();
    const pageId = source.project.pages[0].id;
    const before = source.project.pages[0].panels[0].geometry;
    const overflow = {
      ...source,
      project: updateProjectPagePanels(source.project, pageId, (panels) => [
        { ...panels[0], geometry: { ...panels[0].geometry, xMm: 190 } },
      ]),
    };
    const plan = buildPptxExportPlan(overflow, { scope: "current", activePageId: pageId });
    expect(plan.warnings[0]).toMatch(/extends beyond/);
    expect(source.project.pages[0].panels[0].geometry).toEqual(before);
  });
});

describe("PPTX package generation", () => {
  it("writes exact A4 and panel geometry while preserving independent editable objects", async () => {
    const source = twoPageDocument();
    const result = await exportPptx(
      source,
      { scope: "all", activePageId: source.project.pages[0].id, fileName: "M10 test" },
      async (item) => item.kind === "svg" ? simpleSvg : tinyPng,
    );
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const presentation = await zip.file("ppt/presentation.xml")!.async("text");
    const slide1 = await zip.file("ppt/slides/slide1.xml")!.async("text");
    const slide2 = await zip.file("ppt/slides/slide2.xml")!.async("text");
    expect(result.fileName).toBe("M10 test.pptx");
    expect(presentation).toContain(`cx=\"${A4_WIDTH_EMU}\"`);
    expect(presentation).toContain(`cy=\"${A4_HEIGHT_EMU}\"`);
    const contentTypes = await zip.file("[Content_Types].xml")!.async("text");
    expect(contentTypes).not.toContain("slideMaster2.xml");
    const declaredParts = [...contentTypes.matchAll(/PartName=\"\/([^\"]+)\"/g)].map((match) => match[1]);
    expect(declaredParts.every((part) => zip.file(part) !== null)).toBe(true);
    expect(slide1).toContain("Panel_A_WB");
    expect(slide1).toContain("Label_A");
    expect(slide1).toContain("<p:pic>");
    expect(slide1).toContain("<a:t>A</a:t>");
    expect(slide1).toContain(`<a:off x=\"${20 * EMU_PER_MILLIMETER}\" y=\"${30 * EMU_PER_MILLIMETER}\"/>`);
    expect(slide1).toContain(`<a:ext cx=\"${40 * EMU_PER_MILLIMETER}\" cy=\"${20 * EMU_PER_MILLIMETER}\"/>`);
    expect(slide2).toContain("<a:t>β</a:t>");
    expect(Object.keys(zip.files).some((path) => /^ppt\/media\/.*\.svg$/i.test(path))).toBe(true);
  });

  it("writes pages from multiple Figures into the same PowerPoint package", async () => {
    const source = multiFigureDocument();
    const result = await exportPptx(
      source,
      { scope: "all", activePageId: source.project.pages[0].id, fileName: "All figures" },
      async (item) => item.kind === "svg" ? simpleSvg : tinyPng,
    );
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(zip.file("ppt/slides/slide1.xml")).not.toBeNull();
    expect(zip.file("ppt/slides/slide2.xml")).not.toBeNull();
    expect(zip.file("ppt/slides/slide3.xml")).not.toBeNull();
    expect(await zip.file("ppt/slides/slide1.xml")!.async("text")).not.toContain("Figure 1");
    expect(await zip.file("ppt/slides/slide3.xml")!.async("text")).not.toContain("Figure 2");
    expect(buildPptxExportPlan(source, {
      scope: "all",
      activePageId: source.project.pages[0].id,
    }).slides.map((slide) => slide.figureNumber)).toEqual([1, 1, 2]);
  });
});
