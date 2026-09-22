import { PROJECT_FILE_EXTENSION } from "../domain/projectFile";
import { PORTABLE_PROJECT_MIME } from "./portableProject";

export interface WritableFileStreamLike {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
}

export interface ProjectFileHandle {
  readonly name: string;
  createWritable(): Promise<WritableFileStreamLike>;
}

export interface FilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: readonly { description: string; accept: Record<string, readonly string[]> }[];
  }) => Promise<ProjectFileHandle>;
}

export interface SaveProjectResult {
  readonly handle: ProjectFileHandle | null;
  readonly cancelled: boolean;
  readonly usedDownloadFallback: boolean;
}

export async function saveProjectDocument(
  projectBlob: Blob,
  projectTitle: string,
  currentHandle: ProjectFileHandle | null,
  saveAs: boolean,
  hostWindow: FilePickerWindow = window,
): Promise<SaveProjectResult> {
  try {
    let handle = saveAs ? null : currentHandle;
    if (!handle && hostWindow.showSaveFilePicker) {
      handle = await hostWindow.showSaveFilePicker({
        suggestedName: `${safeFileName(projectTitle)}${PROJECT_FILE_EXTENSION}`,
        types: [{ description: "Portable Figure Composer project", accept: { [PORTABLE_PROJECT_MIME]: [PROJECT_FILE_EXTENSION] } }],
      });
    }
    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(projectBlob);
      await writable.close();
      return { handle, cancelled: false, usedDownloadFallback: false };
    }
    downloadProject(projectBlob, `${safeFileName(projectTitle)}${PROJECT_FILE_EXTENSION}`, hostWindow.document);
    return { handle: null, cancelled: false, usedDownloadFallback: true };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { handle: currentHandle, cancelled: true, usedDownloadFallback: false };
    }
    throw error;
  }
}

function downloadProject(blob: Blob, name: string, document: Document): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFileName(title: string): string {
  const safe = title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-");
  return safe || "Untitled figure";
}
