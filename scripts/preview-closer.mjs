import {
  readPackageVersion,
  readRuntimeState,
  sendRuntimeCommand,
} from "./preview-runtime.mjs";

const version = readPackageVersion();
const expectedVersion = process.argv.slice(2).find((argument) => /^\d+\.\d+\.\d+$/.test(argument));

if (expectedVersion && expectedVersion !== version) {
  console.error(`This closer is for ${expectedVersion}, but the application is ${version}. Regenerate the launchers.`);
  process.exit(2);
}

const state = readRuntimeState();
if (!state) {
  console.log(`Figure Composer v${version} is not running.`);
  process.exit(0);
}

if (state.version !== version) {
  console.error(`The running preview reports ${state.version}; use its matching closer.`);
  process.exit(2);
}

try {
  const response = await sendRuntimeCommand(state, "close");
  if (response?.status !== "closing") throw new Error("The launcher refused the close request.");
  console.log(`Figure Composer v${version} is closing.`);
} catch {
  console.error(`Figure Composer v${version} did not respond to the close request. No unrelated process was terminated.`);
  process.exitCode = 1;
}
