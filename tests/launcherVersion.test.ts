import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import packageMetadata from "../package.json";
import { APP_DISPLAY_VERSION } from "../src/version";

const root = resolve(import.meta.dirname, "..");

describe("versioned Windows preview controls", () => {
  it.each([
    `Figure Composer Launcher ${APP_DISPLAY_VERSION}.cmd`,
    `Close Figure Composer ${APP_DISPLAY_VERSION}.cmd`,
  ])("ships %s with the exact semantic version", (fileName) => {
    const filePath = resolve(root, fileName);
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, "utf8")).toContain(packageMetadata.version);
  });

  it("keeps start and stop ownership logic in dedicated scripts", () => {
    expect(existsSync(resolve(root, "scripts", "preview-launcher.mjs"))).toBe(true);
    expect(existsSync(resolve(root, "scripts", "preview-closer.mjs"))).toBe(true);
    expect(readFileSync(resolve(root, "scripts", "preview-closer.mjs"), "utf8")).not.toContain("taskkill");
  });
});
