let fallbackSequence = 0;

export function createStableId(prefix: "project" | "figure" | "page" | "asset" | "panel" | "type" | "preset"): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;

  fallbackSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackSequence.toString(36)}`;
}
