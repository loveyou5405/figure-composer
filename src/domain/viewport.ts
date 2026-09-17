import type { PageDefinition } from "./page";

export const CSS_PIXELS_PER_INCH = 96;
export const MILLIMETERS_PER_INCH = 25.4;
export const CSS_PIXELS_PER_MM = CSS_PIXELS_PER_INCH / MILLIMETERS_PER_INCH;
export const MIN_ZOOM_PERCENT = 25;
export const MAX_ZOOM_PERCENT = 400;

export interface ViewportMetrics {
  readonly pixelsPerMm: number;
  readonly pageWidthPx: number;
  readonly pageHeightPx: number;
}

export function clampZoom(zoomPercent: number): number {
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, zoomPercent));
}

export function getViewportMetrics(
  page: PageDefinition,
  zoomPercent: number,
): ViewportMetrics {
  const normalizedZoom = clampZoom(zoomPercent);
  const pixelsPerMm = CSS_PIXELS_PER_MM * (normalizedZoom / 100);

  return {
    pixelsPerMm,
    pageWidthPx: page.widthMm * pixelsPerMm,
    pageHeightPx: page.heightMm * pixelsPerMm,
  };
}

export function screenPixelsToMm(pixels: number, pixelsPerMm: number): number {
  if (!Number.isFinite(pixels) || !Number.isFinite(pixelsPerMm) || pixelsPerMm <= 0) {
    throw new Error("Screen distance must be finite and pixels-per-millimeter must be positive.");
  }
  return pixels / pixelsPerMm;
}

export function calculateFitZoom(
  page: PageDefinition,
  viewportWidthPx: number,
  viewportHeightPx: number,
  mode: "page" | "width",
  paddingPx = 48,
): number {
  const availableWidth = Math.max(0, viewportWidthPx - paddingPx * 2);
  const availableHeight = Math.max(0, viewportHeightPx - paddingPx * 2);
  const widthZoom = (availableWidth / (page.widthMm * CSS_PIXELS_PER_MM)) * 100;
  const heightZoom = (availableHeight / (page.heightMm * CSS_PIXELS_PER_MM)) * 100;
  const rawZoom = mode === "width" ? widthZoom : Math.min(widthZoom, heightZoom);

  return Math.floor(clampZoom(rawZoom));
}
