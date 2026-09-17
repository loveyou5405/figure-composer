import { describe, expect, it } from "vitest";
import { duplicateSelectedPanels } from "../src/domain/panel";
import { A4_PORTRAIT } from "../src/domain/page";
import { createDemoProject } from "../src/services/demoProject";
import { isDesktopRuntime } from "../src/services/desktopIo";
import { buildPptxExportPlan } from "../src/services/pptxExport";
import { exportPptx } from "../src/services/pptxExport";
import { reviewDocument } from "../src/domain/validation";
import JSZip from "jszip";

describe("desktop release foundations", () => {
  it("duplicates selected panels with unique stable IDs and snapped page-local geometry", () => {
    const panel = createDemoProject().project.pages[0].panels[0];
    const result = duplicateSelectedPanels([panel], new Set([panel.id]), A4_PORTRAIT, () => "panel-copy");
    expect(result.duplicatedIds).toEqual(["panel-copy"]);
    expect(result.panels).toHaveLength(2);
    expect(result.panels[1].pageId).toBe(panel.pageId);
    expect(result.panels[1].geometry.xMm).toBe(panel.geometry.xMm + 4);
    expect(result.panels[1].geometry.yMm).toBe(panel.geometry.yMm + 4);
    expect(result.panels[0]).toBe(panel);
  });

  it("rejects duplicate IDs from a faulty ID factory", () => {
    const panel = createDemoProject().project.pages[0].panels[0];
    expect(() => duplicateSelectedPanels([panel], new Set([panel.id]), A4_PORTRAIT, () => panel.id)).toThrow(/unique IDs/);
  });

  it("ships a deterministic three-page mixed-type demo that maps to three slides", () => {
    const demo = createDemoProject();
    expect(demo.project.pages).toHaveLength(3);
    expect(new Set(demo.project.pages.flatMap((page) => page.panels.map((panel) => panel.typeId))).size).toBeGreaterThan(3);
    expect(demo.project.pages.flatMap((page) => page.panels).every((panel) => panel.label.text)).toBe(true);
    const plan = buildPptxExportPlan(demo, { scope: "all", activePageId: demo.project.pages[0].id });
    expect(plan.slides).toHaveLength(3);
  });

  it("generates a valid three-slide PPTX package from the bundled demo", async () => {
    const demo = createDemoProject();
    const result = await exportPptx(
      demo,
      { scope: "all", activePageId: demo.project.pages[0].id },
      async (asset) => `data:image/svg+xml;base64,${btoa(decodeURIComponent(asset.previewUrl.split(",")[1]))}`,
    );
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    expect(slides.sort()).toEqual([
      "ppt/slides/slide1.xml",
      "ppt/slides/slide2.xml",
      "ppt/slides/slide3.xml",
    ]);
  });

  it("reviews a common 40-panel document deterministically without mutation", () => {
    const demo = createDemoProject();
    const source = demo.project.pages[0].panels[0];
    const panels = Array.from({ length: 40 }, (_, index) => ({
      ...source,
      id: `load-panel-${index}`,
      geometry: {
        ...source.geometry,
        xMm: 12 + (index % 5) * 36,
        yMm: 12 + Math.floor(index / 5) * 32,
        widthMm: 30,
        heightMm: 18,
      },
      label: { ...source.label, text: String(index + 1) },
    }));
    const document = {
      ...demo,
      project: { ...demo.project, pages: [{ ...demo.project.pages[0], panels }] },
      assets: [demo.assets[0]],
    };
    const before = JSON.stringify(document);
    expect(reviewDocument(document)).toEqual(reviewDocument(document));
    expect(JSON.stringify(document)).toBe(before);
  });

  it("detects the desktop bridge without assuming it in browsers", () => {
    expect(isDesktopRuntime({} as Window)).toBe(false);
    expect(isDesktopRuntime({ __TAURI_INTERNALS__: {} } as unknown as Window)).toBe(true);
  });
});
