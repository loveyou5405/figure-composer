import { describe, expect, it } from "vitest";
import packageMetadata from "../package.json";
import tauriConfig from "../src-tauri/tauri.conf.json";
import { APP_DISPLAY_VERSION, APP_NAME_WITH_VERSION, APP_VERSION } from "../src/version";

describe("application version contract", () => {
  it("uses package metadata as the web application version source", () => {
    expect(APP_VERSION).toBe(packageMetadata.version);
    expect(APP_DISPLAY_VERSION).toBe("v1.0");
    expect(APP_NAME_WITH_VERSION).toBe("Figure Composer v1.0");
  });

  it("keeps the desktop launcher metadata and visible title in sync", () => {
    expect(tauriConfig.version).toBe(packageMetadata.version);
    expect(tauriConfig.app.windows[0].title).toContain(APP_DISPLAY_VERSION);
    expect(tauriConfig.build.frontendDist).toBe("../dist");
    expect(tauriConfig.build.devUrl).toBe("http://localhost:5173");
  });
});
