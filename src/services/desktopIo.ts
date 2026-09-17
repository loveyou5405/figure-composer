export interface DesktopPickedFile {
  readonly file: File;
  readonly path: string;
}

export interface DesktopSaveResult {
  readonly cancelled: boolean;
  readonly path: string | null;
}

interface TauriWindow extends Window {
  readonly __TAURI_INTERNALS__?: unknown;
}

export function isDesktopRuntime(hostWindow: Window = window): boolean {
  return Boolean((hostWindow as TauriWindow).__TAURI_INTERNALS__);
}

export async function pickDesktopProject(): Promise<DesktopPickedFile | null> {
  const paths = await pickPaths(false, [{ name: "Figure Composer project", extensions: ["figproj"] }]);
  return paths[0] ? readDesktopFile(paths[0], "application/json") : null;
}

export async function pickDesktopAssets(multiple = true): Promise<DesktopPickedFile[]> {
  const paths = await pickPaths(multiple, [{ name: "Figure assets", extensions: ["png", "jpg", "jpeg", "svg", "tif", "tiff"] }]);
  return Promise.all(paths.map((path) => readDesktopFile(path, mimeForPath(path))));
}

export async function pickDesktopSource(): Promise<DesktopPickedFile | null> {
  const files = await pickDesktopAssets(false);
  return files[0] ?? null;
}

export function readDesktopPath(path: string, type = mimeForPath(path)): Promise<DesktopPickedFile> {
  return readDesktopFile(path, type);
}

export async function saveDesktopText(
  contents: string,
  suggestedName: string,
  currentPath: string | null,
  saveAs: boolean,
): Promise<DesktopSaveResult> {
  const path = !saveAs && currentPath ? currentPath : await chooseSavePath(suggestedName, "Figure Composer project", ["figproj"]);
  if (!path) return { cancelled: true, path: currentPath };
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  await writeTextFile(path, contents);
  return { cancelled: false, path };
}

export async function saveDesktopBlob(
  blob: Blob,
  suggestedName: string,
): Promise<DesktopSaveResult> {
  const path = await chooseSavePath(suggestedName, "PowerPoint presentation", ["pptx"]);
  if (!path) return { cancelled: true, path: null };
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  return { cancelled: false, path };
}

async function pickPaths(
  multiple: boolean,
  filters: readonly { name: string; extensions: string[] }[],
): Promise<string[]> {
  if (!isDesktopRuntime()) return [];
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({ multiple, directory: false, filters: [...filters] });
  if (!selected) return [];
  return Array.isArray(selected) ? selected : [selected];
}

async function chooseSavePath(suggestedName: string, name: string, extensions: string[]): Promise<string | null> {
  if (!isDesktopRuntime()) return null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({ defaultPath: suggestedName, filters: [{ name, extensions }] });
}

async function readDesktopFile(path: string, type: string): Promise<DesktopPickedFile> {
  const { readFile, stat } = await import("@tauri-apps/plugin-fs");
  const [bytes, metadata] = await Promise.all([readFile(path), stat(path)]);
  const file = new File([bytes], baseName(path), {
    type,
    lastModified: metadata.mtime ? new Date(metadata.mtime).getTime() : Date.now(),
  });
  return { file, path };
}

function baseName(path: string): string {
  return path.split(/[\\/]/).at(-1) || "file";
}

function mimeForPath(path: string): string {
  const extension = path.split(".").at(-1)?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "tif" || extension === "tiff") return "image/tiff";
  return "application/octet-stream";
}
