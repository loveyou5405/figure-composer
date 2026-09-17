import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import net from "node:net";

export const root = resolve(import.meta.dirname, "..");
export const runtimeDirectory = resolve(root, ".figure-composer-runtime");
export const statePath = resolve(runtimeDirectory, "preview-state.json");
export const logPath = resolve(runtimeDirectory, "preview.log");
export const previewUrl = "http://127.0.0.1:5173/";

export function readPackageVersion() {
  return JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
}

export function readRuntimeState() {
  if (!existsSync(statePath)) return null;

  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    if (
      typeof state?.token !== "string" ||
      typeof state?.pipeName !== "string" ||
      typeof state?.version !== "string" ||
      state?.root !== root
    ) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function writeRuntimeState(state) {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function removeOwnedRuntimeState(token) {
  const current = readRuntimeState();
  if (current?.token !== token) return false;

  try {
    rmSync(runtimeDirectory, { force: true, recursive: true, maxRetries: 4, retryDelay: 150 });
    return true;
  } catch {
    return false;
  }
}

export function sendRuntimeCommand(state, command, timeoutMs = 2_000) {
  return new Promise((resolveCommand, rejectCommand) => {
    let settled = false;
    let response = "";
    const socket = net.createConnection(state.pipeName);

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) rejectCommand(error);
      else resolveCommand(value);
    };

    socket.setEncoding("utf8");
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => socket.write(`${JSON.stringify({ command, token: state.token })}\n`));
    socket.on("data", (chunk) => {
      response += chunk;
    });
    socket.on("end", () => {
      try {
        finish(null, JSON.parse(response.trim()));
      } catch {
        finish(new Error("The launcher returned an invalid response."));
      }
    });
    socket.on("timeout", () => finish(new Error("The launcher did not respond in time.")));
    socket.on("error", (error) => finish(error));
  });
}
