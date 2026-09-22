import { describe, expect, it } from "vitest";
import { A4_PORTRAIT } from "../src/domain/page";
import { getViewportMetrics } from "../src/domain/viewport";
import {
  applyManualScaleToPanel,
  applyPresetToPanel,
  applyPresetUpdateToPanels,
  applyTypeToPanels,
  createCustomTypeAndPreset,
  createDefaultPanelPresets,
  createDefaultPanelTypes,
  DEFAULT_TYPE_IDS,
  getPresetForType,
  inferPanelTypeIdFromFilename,
  isPanelFollowingPreset,
  markPanelManualResize,
  resetPanelToPreset,
  type PanelPreset,
} from "../src/domain/preset";
import { getPowerPointReferenceSizeMm, resizePanelGeometry, type Panel } from "../src/domain/panel";
import { createDefaultPanelLabel } from "../src/domain/labels";

const types = createDefaultPanelTypes();
const presets = createDefaultPanelPresets();
const other = getPresetForType(types, presets, DEFAULT_TYPE_IDS.OTHER);

function makePanel(id = "panel-a"): Panel {
  return {
    id,
    pageId: "page-1",
    assetId: `asset-${id}`,
    typeId: other.type.id,
    presetId: other.preset.id,
    baseSizeMm: { widthMm: 64, heightMm: 32 },
    geometry: { xMm: 20, yMm: 30, widthMm: 64, heightMm: 32 },
    aspectRatioLocked: true,
    manualScaleOverride: false,
    label: createDefaultPanelLabel(),
  };
}

describe("default scientific presets", () => {
  it("applies WB at 50% of stable base dimensions", () => {
    const wb = getPresetForType(types, presets, DEFAULT_TYPE_IDS.WB);
    const panel = applyPresetToPanel(makePanel(), wb.type.id, wb.preset, A4_PORTRAIT);
    expect(panel.geometry).toMatchObject({ widthMm: 32, heightMm: 16 });
    expect(panel.manualScaleOverride).toBe(false);
  });

  it("applies IF at 40% of stable base dimensions", () => {
    const item = getPresetForType(types, presets, DEFAULT_TYPE_IDS.IF);
    const panel = applyPresetToPanel(makePanel(), item.type.id, item.preset, A4_PORTRAIT);
    expect(panel.geometry).toMatchObject({ widthMm: 25.6, heightMm: 12.8 });
  });

  it("does not compound when the same preset is reapplied", () => {
    const wb = getPresetForType(types, presets, DEFAULT_TYPE_IDS.WB);
    const once = applyPresetToPanel(makePanel(), wb.type.id, wb.preset, A4_PORTRAIT);
    const twice = applyPresetToPanel(once, wb.type.id, wb.preset, A4_PORTRAIT);
    expect(twice.geometry.widthMm).toBe(32);
    expect(twice.geometry.heightMm).toBe(16);
  });

  it("recalculates from stable base dimensions when type changes", () => {
    const wb = getPresetForType(types, presets, DEFAULT_TYPE_IDS.WB);
    const image = getPresetForType(types, presets, DEFAULT_TYPE_IDS.IF);
    const asWb = applyPresetToPanel(makePanel(), wb.type.id, wb.preset, A4_PORTRAIT);
    const asIf = applyTypeToPanels(
      [asWb],
      new Set([asWb.id]),
      image.type,
      image.preset,
      A4_PORTRAIT,
    )[0];
    expect(asIf.geometry).toMatchObject({ widthMm: 25.6, heightMm: 12.8 });
    expect(asIf.baseSizeMm).toEqual({ widthMm: 64, heightMm: 32 });
  });
});

describe("manual override lifecycle", () => {
  it("maps a 60% editor scale to 60% of the PowerPoint 96 DPI reference size", () => {
    const reference = getPowerPointReferenceSizeMm(384, 192);
    const panel = { ...makePanel(), baseSizeMm: reference };
    const scaled = applyManualScaleToPanel(panel, 60, A4_PORTRAIT);
    expect(scaled.geometry.widthMm).toBe(60.96);
    expect(scaled.geometry.heightMm).toBe(30.48);
  });

  it("marks manual resize as an override", () => {
    const wb = getPresetForType(types, presets, DEFAULT_TYPE_IDS.WB);
    const following = applyPresetToPanel(makePanel(), wb.type.id, wb.preset, A4_PORTRAIT);
    const resizedGeometry = resizePanelGeometry(following.geometry, 6, 3, A4_PORTRAIT);
    const modified = markPanelManualResize(following, resizedGeometry);
    expect(modified.manualScaleOverride).toBe(true);
    expect(isPanelFollowingPreset(modified, wb.preset)).toBe(false);
  });

  it("supports direct manual scale and reset to exact preset geometry", () => {
    const wb = getPresetForType(types, presets, DEFAULT_TYPE_IDS.WB);
    const following = applyPresetToPanel(makePanel(), wb.type.id, wb.preset, A4_PORTRAIT);
    const modified = applyManualScaleToPanel(following, 73, A4_PORTRAIT);
    expect(modified.geometry).toMatchObject({ widthMm: 46.72, heightMm: 23.36 });
    expect(modified.manualScaleOverride).toBe(true);

    const reset = resetPanelToPreset(modified, wb.preset, A4_PORTRAIT);
    expect(reset.geometry).toMatchObject({ widthMm: 32, heightMm: 16 });
    expect(reset.manualScaleOverride).toBe(false);
    expect(isPanelFollowingPreset(reset, wb.preset)).toBe(true);
  });

  it("does not change preset geometry when viewport zoom changes", () => {
    const wb = getPresetForType(types, presets, DEFAULT_TYPE_IDS.WB);
    const panel = applyPresetToPanel(makePanel(), wb.type.id, wb.preset, A4_PORTRAIT);
    const geometryBeforeZoom = panel.geometry;
    getViewportMetrics(A4_PORTRAIT, 25);
    getViewportMetrics(A4_PORTRAIT, 400);
    expect(panel.geometry).toBe(geometryBeforeZoom);
  });
});

describe("filename inference", () => {
  it.each([
    ["Fig3A_WB.png", DEFAULT_TYPE_IDS.WB],
    ["Fig3B_if.svg", DEFAULT_TYPE_IDS.IF],
    ["Fig3C_IHC.jpg", DEFAULT_TYPE_IDS.IHC],
    ["Fig3D_Prism.svg", DEFAULT_TYPE_IDS.GRAPH],
    ["Fig3E_Graph.png", DEFAULT_TYPE_IDS.GRAPH],
    ["Fig3F_Flow.png", DEFAULT_TYPE_IDS.FLOW],
    ["Fig3G_Heatmap.svg", DEFAULT_TYPE_IDS.HEATMAP],
  ])("maps %s deterministically", (filename, expected) => {
    expect(inferPanelTypeIdFromFilename(filename)).toBe(expected);
  });

  it("falls back to Other without a known token", () => {
    expect(inferPanelTypeIdFromFilename("results-final.svg")).toBe(DEFAULT_TYPE_IDS.OTHER);
  });
});

describe("preset update policies", () => {
  const wb = getPresetForType(types, presets, DEFAULT_TYPE_IDS.WB);
  const nextWb: PanelPreset = { ...wb.preset, scalePercent: 45 };

  it("future only leaves every existing panel unchanged", () => {
    const existing = applyPresetToPanel(makePanel(), wb.type.id, wb.preset, A4_PORTRAIT);
    const result = applyPresetUpdateToPanels([existing], nextWb, "future-only", A4_PORTRAIT);
    expect(result[0]).toEqual(existing);
  });

  it("apply all updates matching panels while protecting manual overrides", () => {
    const following = applyPresetToPanel(makePanel("panel-following"), wb.type.id, wb.preset, A4_PORTRAIT);
    const protectedPanel = applyManualScaleToPanel(
      applyPresetToPanel(makePanel("panel-protected"), wb.type.id, wb.preset, A4_PORTRAIT),
      70,
      A4_PORTRAIT,
    );
    const result = applyPresetUpdateToPanels(
      [following, protectedPanel],
      nextWb,
      "apply-all",
      A4_PORTRAIT,
    );
    expect(result[0].geometry).toMatchObject({ widthMm: 28.8, heightMm: 14.4 });
    expect(result[0].manualScaleOverride).toBe(false);
    expect(result[1]).toEqual(protectedPanel);
  });

  it("uses tolerance for harmless drift but still catches real deviation", () => {
    const following = applyPresetToPanel(makePanel(), wb.type.id, wb.preset, A4_PORTRAIT);
    const harmless = {
      ...following,
      geometry: { ...following.geometry, widthMm: following.geometry.widthMm + 0.015 },
    };
    const deviation = {
      ...following,
      geometry: { ...following.geometry, widthMm: following.geometry.widthMm + 0.03 },
    };
    expect(isPanelFollowingPreset(harmless, wb.preset)).toBe(true);
    expect(isPanelFollowingPreset(deviation, wb.preset)).toBe(false);
  });
});

describe("custom type architecture", () => {
  it("adds custom type and preset records without changing the panel schema", () => {
    const custom = createCustomTypeAndPreset(types);
    expect(custom.type.isCustom).toBe(true);
    expect(custom.type.presetId).toBe(custom.preset.id);
    expect(custom.preset).toMatchObject({ scalePercent: 100, lockAspectRatio: true });
  });
});
