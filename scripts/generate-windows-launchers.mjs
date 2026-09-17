import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
const displayVersion = `v${version.replace(/\.0$/, "")}`;
const launcherName = `Figure Composer Launcher ${displayVersion}.cmd`;
const closerName = `Close Figure Composer ${displayVersion}.cmd`;

const createCommand = (scriptName, actionName) => `@echo off\r
setlocal\r
cd /d "%~dp0"\r
where node.exe >nul 2>&1\r
if errorlevel 1 (\r
  echo Figure Composer ${displayVersion} requires Node.js 20 or newer for this preview ${actionName}.\r
  pause\r
  exit /b 1\r
)\r
start "${actionName === "launcher" ? "Figure Composer" : "Close Figure Composer"} ${displayVersion}" /min /wait node.exe "%~dp0scripts\\${scriptName}" ${version}\r
endlocal\r
`;

for (const fileName of readdirSync(root)) {
  if (/^(Figure Composer Launcher|Close Figure Composer) v\d+\.\d+(?:\.\d+)?\.(?:cmd|vbs)$/.test(fileName)) {
    rmSync(resolve(root, fileName));
  }
}

writeFileSync(resolve(root, launcherName), createCommand("preview-launcher.mjs", "launcher"), "utf8");
writeFileSync(resolve(root, closerName), createCommand("preview-closer.mjs", "closer"), "utf8");
console.log(`Generated ${launcherName} and ${closerName}`);
