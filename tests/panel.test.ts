import { describe, expect, it } from "vitest";
import { A4_PORTRAIT } from "../src/domain/page";
import {
  getInitialPanelSizeMm,
  movePanelGeometry,
  placePanelGeometry,
  removePanelById,
  resizePanelGeometry,
  type PanelGeometry,
} from "../src/domain/panel";
import { getViewportMetrics, screenPixelsToMm } from "../src/domain/viewport";
import { createDefaultPanelLabel } from "../src/domain/labels";

const ORIGIN: PanelGeometry = {
  xMm: 10,
  yMm: 20,
  widthMm: 50,
  heightMm: 25,
};

describe("panel creation", () => {
  it("fits landscape and portrait images into the neutral 64 mm box", () => {
    expect(getInitialPanelSizeMm(1200, 600)).toEqual({ widthMm: 64, heightMm: 32 });
    expect(getInitialPanelSizeMm(600, 1200)).toEqual({ widthMm: 32, heightMm: 64 });
  });

  it("creates deterministic grid-snapped placement around a drop point", () => {
    const geometry = placePanelGeometry(
      { widthMm: 64, heightMm: 32 },
      A4_PORTRAIT,
      { xMm: 100.3, yMm: 100.7 },
    );
    expect(geometry).toEqual({ xMm: 68, yMm: 85, widthMm: 64, heightMm: 32 });
  });

  it("cascades multiple dropped panels while keeping them inside A4", () => {
    const first = placePanelGeometry({ widthMm: 64, heightMm: 32 }, A4_PORTRAIT, { xMm: 205, yMm: 292 }, 0);
    const second = placePanelGeometry({ widthMm: 64, heightMm: 32 }, A4_PORTRAIT, { xMm: 205, yMm: 292 }, 1);
    expect(first.xMm).toBe(146);
    expect(first.yMm).toBe(265);
    expect(second).toEqual(first);
  });
});

describe("millimeter interaction geometry", () => {
  it("snaps movement to the 1 mm project grid", () => {
    expect(movePanelGeometry(ORIGIN, 7.6, -2.4, A4_PORTRAIT)).toEqual({
      ...ORIGIN,
      xMm: 18,
      yMm: 18,
    });
  });

  it("produces identical geometry from equivalent drags at different zooms", () => {
    const at50 = getViewportMetrics(A4_PORTRAIT, 50);
    const at200 = getViewportMetrics(A4_PORTRAIT, 200);
    const deltaMmAt50 = screenPixelsToMm(12 * at50.pixelsPerMm, at50.pixelsPerMm);
    const deltaMmAt200 = screenPixelsToMm(12 * at200.pixelsPerMm, at200.pixelsPerMm);

    expect(movePanelGeometry(ORIGIN, deltaMmAt50, 0, A4_PORTRAIT)).toEqual(
      movePanelGeometry(ORIGIN, deltaMmAt200, 0, A4_PORTRAIT),
    );
  });

  it("preserves aspect ratio while resizing from horizontal or vertical movement", () => {
    const horizontal = resizePanelGeometry(ORIGIN, 10.4, 1, A4_PORTRAIT);
    const vertical = resizePanelGeometry(ORIGIN, 1, 5.4, A4_PORTRAIT);
    expect(horizontal).toMatchObject({ widthMm: 60, heightMm: 30 });
    expect(vertical).toMatchObject({ widthMm: 61, heightMm: 30.5 });
    expect(horizontal.widthMm / horizontal.heightMm).toBe(2);
    expect(vertical.widthMm / vertical.heightMm).toBe(2);
  });

  it("allows free resize only when the inherited preset lock is off", () => {
    const resized = resizePanelGeometry(ORIGIN, 10, 4, A4_PORTRAIT, false);
    expect(resized).toMatchObject({ widthMm: 60, heightMm: 29 });
    expect(resized.widthMm / resized.heightMm).not.toBe(2);
  });

  it("clamps move and resize interactions to the A4 page", () => {
    const moved = movePanelGeometry(ORIGIN, 500, 500, A4_PORTRAIT);
    const resized = resizePanelGeometry(ORIGIN, 500, 500, A4_PORTRAIT);
    expect(moved.xMm + moved.widthMm).toBe(A4_PORTRAIT.widthMm);
    expect(moved.yMm + moved.heightMm).toBe(A4_PORTRAIT.heightMm);
    expect(resized.xMm + resized.widthMm).toBeLessThanOrEqual(A4_PORTRAIT.widthMm);
    expect(resized.yMm + resized.heightMm).toBeLessThanOrEqual(A4_PORTRAIT.heightMm);
  });

  it("keeps extreme aspect ratios on-page when minimum size cannot fit", () => {
    const portrait = resizePanelGeometry(
      { xMm: 0, yMm: 0, widthMm: 2, heightMm: 200 },
      -100,
      -100,
      A4_PORTRAIT,
    );
    expect(portrait.widthMm).toBeLessThanOrEqual(A4_PORTRAIT.widthMm);
    expect(portrait.heightMm).toBeLessThanOrEqual(A4_PORTRAIT.heightMm);
    expect(portrait.widthMm / portrait.heightMm).toBeCloseTo(0.01, 3);
  });
});

describe("panel deletion", () => {
  it("removes only the selected panel without mutating the source collection", () => {
    const panelBase = {
      pageId: "page-1",
      typeId: "other",
      presetId: "preset-other",
      baseSizeMm: { widthMm: 50, heightMm: 25 },
      aspectRatioLocked: true,
      manualScaleOverride: false,
      label: createDefaultPanelLabel(),
    };
    const panels = [
      { ...panelBase, id: "panel-a", assetId: "asset-a", geometry: ORIGIN },
      { ...panelBase, id: "panel-b", assetId: "asset-b", geometry: { ...ORIGIN, xMm: 70 } },
    ] as const;
    const remaining = removePanelById(panels, "panel-a");
    expect(remaining.map((panel) => panel.id)).toEqual(["panel-b"]);
    expect(panels).toHaveLength(2);
  });
});
