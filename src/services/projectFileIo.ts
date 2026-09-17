import type { EditorDocument } from "../domain/editorDocument";
import { PROJECT_FILE_EXTENSION, serializeProjectFile } from "../domain/projectFile";

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
  document: EditorDocument,
  currentHandle: ProjectFileHandle | null,
  saveAs: boolean,
  hostWindow: FilePickerWindow = window,
): Promise<SaveProjectResult> {
  const json = serializeProjectFile(document);
  try {
    let handle = saveAs ? null : currentHandle;
    if (!handle && hostWindow.showSaveFilePicker) {
      handle = await hostWindow.showSaveFilePicker({
        suggestedName: `${safeFileName(document.project.title)}${PROJECT_FILE_EXTENSION}`,
        types: [{ description: "Figure Composer project", accept: { "application/json": [PROJECT_FILE_EXTENSION] } }],
      });
    }
    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return { handle, cancelled: false, usedDownloadFallback: false };
    }
    downloadProject(json, `${safeFileName(document.project.title)}${PROJECT_FILE_EXTENSION}`, hostWindow.document);
    return { handle: null, cancelled: false, usedDownloadFallback: true };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { handle: currentHandle, cancelled: true, usedDownloadFallback: false };
    }
    throw error;
  }
}

export async function readProjectText(file: File): Promise<string> {
  return file.text();
}

function downloadProject(json: string, name: string, document: Document): void {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
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
