export const HISTORY_LIMIT = 200;

export interface HistoryEntry<T> {
  readonly snapshot: T;
  readonly label: string;
}

export interface HistoryState<T> {
  readonly past: readonly HistoryEntry<T>[];
  readonly present: T;
  readonly future: readonly HistoryEntry<T>[];
}

export function createHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [] };
}

export function commitHistory<T>(
  history: HistoryState<T>,
  next: T,
  label: string,
  limit = HISTORY_LIMIT,
): HistoryState<T> {
  if (next === history.present) return history;
  return {
    past: [...history.past, { snapshot: history.present, label }].slice(-limit),
    present: next,
    future: [],
  };
}

/** Replace a live interaction preview without creating a history entry. */
export function previewHistory<T>(history: HistoryState<T>, next: T): HistoryState<T> {
  return next === history.present ? history : { ...history, present: next };
}

/** Commit one pointer gesture after any number of preview frames. */
export function finalizePreviewHistory<T>(
  history: HistoryState<T>,
  before: T,
  label: string,
  limit = HISTORY_LIMIT,
): HistoryState<T> {
  if (history.present === before) return history;
  return {
    past: [...history.past, { snapshot: before, label }].slice(-limit),
    present: history.present,
    future: [],
  };
}

export function undoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  const entry = history.past.at(-1);
  if (!entry) return history;
  return {
    past: history.past.slice(0, -1),
    present: entry.snapshot,
    future: [{ snapshot: history.present, label: entry.label }, ...history.future],
  };
}

export function redoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  const entry = history.future[0];
  if (!entry) return history;
  return {
    past: [...history.past, { snapshot: history.present, label: entry.label }].slice(-HISTORY_LIMIT),
    present: entry.snapshot,
    future: history.future.slice(1),
  };
}

export function replaceHistory<T>(present: T): HistoryState<T> {
  return createHistory(present);
}

export function canUndo<T>(history: HistoryState<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: HistoryState<T>): boolean {
  return history.future.length > 0;
}
