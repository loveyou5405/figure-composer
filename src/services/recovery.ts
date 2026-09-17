import type { ImportedAsset } from "../domain/asset";
import type { EditorDocument } from "../domain/editorDocument";
import { deserializeProjectFile, serializeProjectFile } from "../domain/projectFile";

export const RECOVERY_STORAGE_KEY = "figure-composer:recovery:v1";
export const AUTOSAVE_DELAY_MS = 750;

export function writeRecovery(storage: Pick<Storage, "setItem">, document: EditorDocument): void {
  storage.setItem(RECOVERY_STORAGE_KEY, serializeProjectFile(document));
}

export function readRecovery(
  storage: Pick<Storage, "getItem">,
  availableAssets: readonly ImportedAsset[] = [],
): EditorDocument | null {
  const value = storage.getItem(RECOVERY_STORAGE_KEY);
  return value ? deserializeProjectFile(value, availableAssets) : null;
}

export function clearRecovery(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(RECOVERY_STORAGE_KEY);
}

export function scheduleRecovery(
  storage: Pick<Storage, "setItem">,
  document: EditorDocument,
  onComplete?: () => void,
  onError?: (error: unknown) => void,
  delayMs = AUTOSAVE_DELAY_MS,
): () => void {
  const timer = globalThis.setTimeout(() => {
    try {
      writeRecovery(storage, document);
      onComplete?.();
    } catch (error) {
      onError?.(error);
    }
  }, delayMs);
  return () => globalThis.clearTimeout(timer);
}
