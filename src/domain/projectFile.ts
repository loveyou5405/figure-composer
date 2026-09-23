import type { ImportedAsset, SupportedAssetKind } from "./asset";
import type { EditorDocument, AutoLayoutPreferences } from "./editorDocument";
import { DEFAULT_LABEL_SETTINGS, type ProjectLabelSettings } from "./labels";
import { A4_PORTRAIT } from "./page";
import { getPageMargins, validatePageMargins } from "./page";
import { getPowerPointReferenceSizeMm } from "./panel";
import type { PanelPreset, PanelTypeDefinition } from "./preset";
import { getProjectOwnershipErrors, normalizeProjectFigureIds, type FigureProject } from "./project";

export const PROJECT_SCHEMA_VERSION = "0.1.0";
export const PROJECT_FILE_EXTENSION = ".figproj";

export interface SerializedAssetReference {
  readonly id: string;
  readonly sourceName: string;
  readonly mimeType: string;
  readonly kind: SupportedAssetKind;
  readonly intrinsicWidthPx: number;
  readonly intrinsicHeightPx: number;
  readonly byteSize: number;
  readonly lastModified: number;
  readonly sourceReference?: string;
}

export interface FigureProjectFile {
  readonly schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  readonly savedAt: string;
  readonly project: FigureProject;
  readonly assets: readonly SerializedAssetReference[];
  readonly panelTypes: readonly PanelTypeDefinition[];
  readonly presets: readonly PanelPreset[];
  readonly layoutSettings: AutoLayoutPreferences;
}

export interface ProjectMigration {
  readonly from: string;
  readonly to: string;
  readonly migrate: (source: Record<string, unknown>) => Record<string, unknown>;
}

export function createProjectFile(document: EditorDocument, savedAt = new Date().toISOString()): FigureProjectFile {
  validateDocument(document);
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    savedAt,
    project: document.project,
    assets: document.assets.map(({ previewUrl: _previewUrl, missing: _missing, ...asset }) => ({
      ...asset,
      sourceReference: asset.sourceReference ?? asset.sourceName,
    })),
    panelTypes: document.types,
    presets: document.presets,
    layoutSettings: document.layoutSettings,
  };
}

export function serializeProjectFile(document: EditorDocument, savedAt?: string): string {
  return JSON.stringify(createProjectFile(document, savedAt), null, 2);
}

export function deserializeProjectFile(
  json: string,
  availableAssets: readonly ImportedAsset[] = [],
  migrations: readonly ProjectMigration[] = [],
): EditorDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("This project file is not valid JSON.");
  }
  const migrated = applyProjectMigrations(parsed, migrations);
  const file = parseProjectFile(migrated);
  const normalizedProject = normalizeProjectFigureIds(file.project);
  const liveByFingerprint = new Map(availableAssets.map((asset) => [assetFingerprint(asset), asset]));
  const assets: ImportedAsset[] = file.assets.map((reference) => {
      const live = liveByFingerprint.get(assetFingerprint(reference));
      return live
        ? { ...reference, previewUrl: live.previewUrl, missing: false }
        : { ...reference, previewUrl: "", missing: true };
    });
  const scaleReferenceByAssetId = new Map(assets.map((asset) => [
    asset.id,
    getPowerPointReferenceSizeMm(asset.intrinsicWidthPx, asset.intrinsicHeightPx),
  ]));
  const document: EditorDocument = {
    project: {
      ...normalizedProject,
      labelSettings: { ...DEFAULT_LABEL_SETTINGS, ...normalizedProject.labelSettings },
      pages: normalizedProject.pages.map((page) => ({
        ...page,
        panels: page.panels.map((panel) => ({
          ...panel,
          baseSizeMm: scaleReferenceByAssetId.get(panel.assetId) ?? panel.baseSizeMm,
        })),
      })),
    },
    assets,
    types: file.panelTypes,
    presets: file.presets,
    layoutSettings: file.layoutSettings,
  };
  validateDocument(document);
  return document;
}

export function applyProjectMigrations(
  source: unknown,
  migrations: readonly ProjectMigration[] = [],
): unknown {
  if (!isRecord(source)) throw new Error("Project file root must be an object.");
  let current = source;
  const visited = new Set<string>();
  while (current.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    if (visited.size >= 100) throw new Error("Project migration chain is too long.");
    const version = readString(current.schemaVersion, "schemaVersion");
    if (visited.has(version)) throw new Error("Project migration chain contains a cycle.");
    visited.add(version);
    const migration = migrations.find((candidate) => candidate.from === version);
    if (!migration) throw new Error(`Unsupported project schema version: ${version}.`);
    current = migration.migrate(current);
    if (!isRecord(current) || current.schemaVersion !== migration.to) {
      throw new Error(`Migration from ${version} did not produce ${migration.to}.`);
    }
  }
  return current;
}

export function validateDocument(document: EditorDocument): void {
  const errors = getProjectOwnershipErrors(document.project);
  const assetIds = new Set<string>();
  const typeIds = new Set<string>();
  const presetIds = new Set<string>();
  document.assets.forEach((asset) => {
    if (!asset.id || assetIds.has(asset.id)) errors.push(`Duplicate or empty asset ID: ${asset.id || "(empty)"}.`);
    assetIds.add(asset.id);
    if (!asset.sourceName || !["png", "jpeg", "svg", "tiff"].includes(asset.kind)
      || typeof asset.mimeType !== "string"
      || !Number.isFinite(asset.intrinsicWidthPx) || asset.intrinsicWidthPx <= 0
      || !Number.isFinite(asset.intrinsicHeightPx) || asset.intrinsicHeightPx <= 0
      || !Number.isFinite(asset.byteSize) || asset.byteSize < 0
      || !Number.isFinite(asset.lastModified) || asset.lastModified < 0) {
      errors.push(`Asset ${asset.id} has invalid metadata.`);
    }
  });
  document.types.forEach((type) => {
    if (!type.id || typeIds.has(type.id)) errors.push(`Duplicate or empty panel type ID: ${type.id || "(empty)"}.`);
    typeIds.add(type.id);
    if (!type.name || typeof type.presetId !== "string" || typeof type.isCustom !== "boolean") {
      errors.push(`Panel type ${type.id} has invalid metadata.`);
    }
  });
  document.presets.forEach((preset) => {
    if (!preset.id || presetIds.has(preset.id)) errors.push(`Duplicate or empty preset ID: ${preset.id || "(empty)"}.`);
    presetIds.add(preset.id);
    if (!Number.isFinite(preset.scalePercent) || preset.scalePercent <= 0 || typeof preset.lockAspectRatio !== "boolean") {
      errors.push(`Preset ${preset.id} has invalid settings.`);
    }
  });
  document.types.forEach((type) => {
    if (!presetIds.has(type.presetId)) errors.push(`Panel type ${type.id} references a missing preset.`);
  });
  document.project.pages.forEach((page) => page.panels.forEach((panel) => {
    const values = Object.values(panel.geometry);
    if (!values.every(Number.isFinite) || panel.geometry.widthMm <= 0 || panel.geometry.heightMm <= 0) {
      errors.push(`Panel ${panel.id} has invalid millimeter geometry.`);
    }
    if (!assetIds.has(panel.assetId)) errors.push(`Panel ${panel.id} references a missing asset record.`);
    if (!typeIds.has(panel.typeId)) errors.push(`Panel ${panel.id} references a missing panel type.`);
    if (!presetIds.has(panel.presetId)) errors.push(`Panel ${panel.id} references a missing preset.`);
    if (!isRecord(panel.label)
      || typeof panel.label.text !== "string"
      || !["auto", "manual"].includes(panel.label.mode)
      || typeof panel.label.visible !== "boolean"
      || !Number.isFinite(panel.label.offsetXmm)
      || !Number.isFinite(panel.label.offsetYmm)
      || !["automatic", "manual"].includes(panel.label.offsetMode)) {
      errors.push(`Panel ${panel.id} has invalid label metadata.`);
    }
  }));
  validateLabelSettings(document.project.labelSettings, errors);
  if (!["balanced", "compact", "equal-rows"].includes(document.layoutSettings.mode)
    || !Number.isFinite(document.layoutSettings.gapMm)
    || document.layoutSettings.gapMm < 0) errors.push("Auto Layout settings are invalid.");
  if (errors.length > 0) throw new Error(`Invalid project file: ${errors.join(" ")}`);
}

function parseProjectFile(source: unknown): FigureProjectFile {
  if (!isRecord(source)) throw new Error("Project file root must be an object.");
  const savedAt = readString(source.savedAt, "savedAt");
  if (Number.isNaN(Date.parse(savedAt))) throw new Error("Project savedAt timestamp is invalid.");
  if (!isRecord(source.project) || !Array.isArray(source.assets) || !Array.isArray(source.panelTypes)
    || !Array.isArray(source.presets) || !isRecord(source.layoutSettings)) {
    throw new Error("Project file is missing required document sections.");
  }
  if (typeof source.project.id !== "string" || typeof source.project.title !== "string"
    || !Array.isArray(source.project.pages) || !isRecord(source.project.labelSettings)) {
    throw new Error("Project metadata is invalid.");
  }
  source.project.pages.forEach((page, pageIndex) => {
    if (!isRecord(page) || typeof page.id !== "string" || typeof page.name !== "string"
      || !isRecord(page.definition) || !Array.isArray(page.panels)) {
      throw new Error(`Page ${pageIndex + 1} is invalid.`);
    }
    if ("figureId" in page && (typeof page.figureId !== "string" || !page.figureId.trim())) {
      throw new Error(`Page ${pageIndex + 1} Figure ID is invalid.`);
    }
    const definition = page.definition;
    if (![definition.widthMm, definition.heightMm, definition.marginMm, definition.gridMm].every(Number.isFinite)) {
      throw new Error(`Page ${pageIndex + 1} definition is invalid.`);
    }
    if (definition.marginsMm !== undefined) {
      if (!isRecord(definition.marginsMm)) throw new Error(`Page ${pageIndex + 1} safe margins are invalid.`);
      try {
        validatePageMargins(definition as unknown as typeof A4_PORTRAIT, getPageMargins(definition as unknown as typeof A4_PORTRAIT));
      } catch {
        throw new Error(`Page ${pageIndex + 1} safe margins are invalid.`);
      }
    }
    page.panels.forEach((panel, panelIndex) => {
      if (!isRecord(panel) || typeof panel.id !== "string" || typeof panel.pageId !== "string"
        || typeof panel.assetId !== "string" || typeof panel.typeId !== "string" || typeof panel.presetId !== "string"
        || !isRecord(panel.baseSizeMm) || !isRecord(panel.geometry) || !isRecord(panel.label)) {
        throw new Error(`Panel ${panelIndex + 1} on page ${pageIndex + 1} is invalid.`);
      }
    });
  });
  [...source.assets, ...source.panelTypes, ...source.presets].forEach((entry) => {
    if (!isRecord(entry)) throw new Error("Project collections must contain objects.");
  });
  const candidate = source as unknown as FigureProjectFile;
  if (candidate.schemaVersion !== PROJECT_SCHEMA_VERSION) throw new Error("Project schema migration did not complete.");
  return candidate;
}

function validateLabelSettings(settings: ProjectLabelSettings, errors: string[]): void {
  if (!settings || typeof settings.fontFamily !== "string"
    || ![settings.fontSizePt, settings.defaultOffsetXmm, settings.defaultOffsetYmm, settings.rowToleranceMm].every(Number.isFinite)
    || settings.fontSizePt <= 0 || settings.rowToleranceMm < 0
    || typeof settings.bold !== "boolean" || typeof settings.color !== "string"
    || !["continuous", "restart-per-page"].includes(settings.sequenceMode)
    || !["uppercase", "lowercase"].includes(settings.letterCase)) errors.push("Project label settings are invalid.");
}

function assetFingerprint(asset: Pick<SerializedAssetReference, "id" | "sourceName" | "byteSize" | "lastModified">): string {
  return `${asset.id}|${asset.sourceName}|${asset.byteSize}|${asset.lastModified}`;
}

function readString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Project ${name} must be a non-empty string.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
