import { describe, expect, it } from "vitest";
import { A4_PORTRAIT } from "../src/domain/page";
import {
  calculateFitZoom,
  clampZoom,
  CSS_PIXELS_PER_MM,
  getViewportMetrics,
  screenPixelsToMm,
} from "../src/domain/viewport";

describe("A4 page geometry", () => {
  it("stores the required dimensions in canonical millimeters", () => {
    expect(A4_PORTRAIT).toMatchObject({
      widthMm: 210,
      heightMm: 297,
      marginMm: 12,
      gridMm: 1,
    });
  });

  it("converts millimeters to CSS pixels at a deterministic zoom", () => {
    const metrics = getViewportMetrics(A4_PORTRAIT, 100);
    expect(metrics.pixelsPerMm).toBeCloseTo(CSS_PIXELS_PER_MM, 10);
    expect(metrics.pageWidthPx).toBeCloseTo(210 * CSS_PIXELS_PER_MM, 10);
    expect(metrics.pageHeightPx).toBeCloseTo(297 * CSS_PIXELS_PER_MM, 10);
  });

  it("changes only viewport scale when zoom changes", () => {
    const at100 = getViewportMetrics(A4_PORTRAIT, 100);
    const at50 = getViewportMetrics(A4_PORTRAIT, 50);
    expect(at50.pageWidthPx).toBeCloseTo(at100.pageWidthPx / 2, 10);
    expect(at50.pageHeightPx).toBeCloseTo(at100.pageHeightPx / 2, 10);
    expect(A4_PORTRAIT.widthMm).toBe(210);
    expect(A4_PORTRAIT.heightMm).toBe(297);
  });

  it("converts pointer pixels back to millimeters at the active zoom", () => {
    const metrics = getViewportMetrics(A4_PORTRAIT, 175);
    expect(screenPixelsToMm(24 * metrics.pixelsPerMm, metrics.pixelsPerMm)).toBeCloseTo(24, 10);
  });
});

describe("viewport fitting", () => {
  it("fits the whole page within both available dimensions", () => {
    const zoom = calculateFitZoom(A4_PORTRAIT, 900, 700, "page", 48);
    const metrics = getViewportMetrics(A4_PORTRAIT, zoom);
    expect(metrics.pageWidthPx).toBeLessThanOrEqual(900 - 96);
    expect(metrics.pageHeightPx).toBeLessThanOrEqual(700 - 96);
  });

  it("fits width independently of height", () => {
    const zoom = calculateFitZoom(A4_PORTRAIT, 900, 400, "width", 48);
    const metrics = getViewportMetrics(A4_PORTRAIT, zoom);
    expect(metrics.pageWidthPx).toBeCloseTo(900 - 96, -1);
    expect(metrics.pageHeightPx).toBeGreaterThan(400);
  });

  it("clamps zoom to the supported 25–400 percent range", () => {
    expect(clampZoom(1)).toBe(25);
    expect(clampZoom(800)).toBe(400);
  });
});
