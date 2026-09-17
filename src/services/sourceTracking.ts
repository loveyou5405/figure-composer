import type { ImportedAsset } from "../domain/asset";
import {
  getAssetFingerprint,
  getFileFingerprint,
  sourceFingerprintChanged,
} from "../domain/source";

export type SourceCheckStatus = "unchanged" | "changed" | "missing" | "unavailable";

export interface SourceBinding {
  /** Snapshot bindings cannot observe later disk changes in a browser sandbox. */
  readonly capability: "snapshot" | "refreshable";
  readonly getFile: () => Promise<File>;
}

export interface SourceCheckResult {
  readonly assetId: string;
  readonly status: SourceCheckStatus;
  readonly file?: File;
  readonly message?: string;
}

export interface SourceCheckSummary {
  readonly changed: number;
  readonly missing: number;
  readonly unchanged: number;
  readonly unavailable: number;
}

export function createSnapshotSourceBinding(file: File): SourceBinding {
  return { capability: "snapshot", getFile: async () => file };
}

export async function checkAssetSources(
  assets: readonly ImportedAsset[],
  bindings: ReadonlyMap<string, SourceBinding>,
): Promise<SourceCheckResult[]> {
  return Promise.all(assets.map(async (asset): Promise<SourceCheckResult> => {
    const binding = bindings.get(asset.id);
    if (!binding) {
      return asset.missing
        ? { assetId: asset.id, status: "missing", message: "Relink this source to restore its preview." }
        : { assetId: asset.id, status: "unavailable", message: "This browser import cannot be checked again automatically." };
    }
    if (binding.capability === "snapshot") {
      return asset.missing
        ? { assetId: asset.id, status: "missing", message: "Relink this source to restore its preview." }
        : { assetId: asset.id, status: "unavailable", message: "Reselect the file to refresh it explicitly." };
    }
    try {
      const file = await binding.getFile();
      return {
        assetId: asset.id,
        status: sourceFingerprintChanged(getAssetFingerprint(asset), getFileFingerprint(file)) ? "changed" : "unchanged",
        file,
      };
    } catch (error) {
      const missing = typeof error === "object" && error !== null && "name" in error && error.name === "NotFoundError";
      return {
        assetId: asset.id,
        status: missing ? "missing" : "unavailable",
        message: missing ? "The linked source could not be found." : "The linked source could not be checked.",
      };
    }
  }));
}

export function summarizeSourceChecks(results: readonly SourceCheckResult[]): SourceCheckSummary {
  return results.reduce<SourceCheckSummary>((summary, result) => ({
    ...summary,
    [result.status]: summary[result.status] + 1,
  }), { changed: 0, missing: 0, unchanged: 0, unavailable: 0 });
}
