import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  commitHistory,
  createHistory,
  finalizePreviewHistory,
  previewHistory,
  redoHistory,
  undoHistory,
} from "../src/domain/history";

describe("editor transaction history", () => {
  it("undoes and redoes a committed document snapshot", () => {
    const initial = { geometry: { xMm: 10, yMm: 20 } };
    const moved = { geometry: { xMm: 15, yMm: 24 } };
    const committed = commitHistory(createHistory(initial), moved, "Move panel");
    expect(canUndo(committed)).toBe(true);
    const undone = undoHistory(committed);
    expect(undone.present).toBe(initial);
    expect(canRedo(undone)).toBe(true);
    expect(redoHistory(undone).present).toBe(moved);
  });

  it("records an entire pointer gesture as one history entry", () => {
    const before = { xMm: 10 };
    let history = createHistory(before);
    history = previewHistory(history, { xMm: 11 });
    history = previewHistory(history, { xMm: 12 });
    history = previewHistory(history, { xMm: 18 });
    history = finalizePreviewHistory(history, before, "Move panel");
    expect(history.past).toHaveLength(1);
    expect(history.past[0]).toEqual({ snapshot: before, label: "Move panel" });
    expect(history.present.xMm).toBe(18);
  });

  it("clears redo after a divergent operation", () => {
    const committed = commitHistory(createHistory(0), 1, "First");
    const undone = undoHistory(committed);
    expect(commitHistory(undone, 2, "Divergent").future).toEqual([]);
  });

  it("does not add no-op reference commits", () => {
    const value = { project: "same" };
    const history = createHistory(value);
    expect(commitHistory(history, value, "No-op")).toBe(history);
    expect(finalizePreviewHistory(history, value, "No-op")).toBe(history);
  });

  it("keeps only the latest 200 undo entries", () => {
    let history = createHistory(0);
    for (let index = 1; index <= HISTORY_LIMIT + 25; index += 1) {
      history = commitHistory(history, index, `Edit ${index}`);
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0].snapshot).toBe(25);
    expect(history.present).toBe(225);
  });
});
