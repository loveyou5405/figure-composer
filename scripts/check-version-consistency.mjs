import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(readFileSync(resolve(root, "src-tauri", "tauri.conf.json"), "utf8"));
const cargo = readFileSync(resolve(root, "src-tauri", "Cargo.toml"), "utf8");
const history = readFileSync(resolve(root, "VERSION_HISTORY.md"), "utf8");
const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
const version = packageJson.version;
const displayVersion = `v${version.replace(/\.0$/, "")}`;
const launcherName = `Figure Composer Launcher ${displayVersion}.cmd`;
const closerName = `Close Figure Composer ${displayVersion}.cmd`;
const cargoVersion = cargo.match(/\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/)?.[1];
const errors = [];

if (tauriConfig.version !== version) errors.push(`tauri.conf.json is ${tauriConfig.version}, expected ${version}`);
if (cargoVersion !== version) errors.push(`Cargo.toml is ${cargoVersion ?? "missing"}, expected ${version}`);
if (!tauriConfig.app.windows.some((window) => window.title.includes(displayVersion))) {
  errors.push(`desktop window title must include ${displayVersion}`);
}
if (!history.includes(`## ${displayVersion}`)) errors.push(`VERSION_HISTORY.md is missing ${displayVersion}`);
if (!changelog.includes(`## [${version}]`)) errors.push(`CHANGELOG.md is missing [${version}]`);
for (const fileName of [launcherName, closerName]) {
  const filePath = resolve(root, fileName);
  if (!existsSync(filePath)) {
    errors.push(`${fileName} is missing; run npm run launcher:generate`);
  } else if (!readFileSync(filePath, "utf8").includes(version)) {
    errors.push(`${fileName} does not contain ${version}`);
  }
}
const expectedPreviewControls = new Set([launcherName, closerName]);
for (const fileName of readdirSync(root)) {
  if (
    /^(Figure Composer Launcher|Close Figure Composer) v\d+\.\d+(?:\.\d+)?\.(?:cmd|vbs)$/.test(fileName) &&
    !expectedPreviewControls.has(fileName)
  ) {
    errors.push(`${fileName} is stale; run npm run launcher:generate`);
  }
}
if (!existsSync(resolve(root, "specs", "releases", `v${version}.md`))) {
  errors.push(`specs/releases/v${version}.md is missing`);
}

if (errors.length) {
  console.error(`Version consistency check failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(`Version consistency check passed: ${displayVersion} (${version})`);
