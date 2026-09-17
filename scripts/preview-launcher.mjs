import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { request } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import net from "node:net";
import {
  logPath,
  previewUrl,
  readPackageVersion,
  readRuntimeState,
  removeOwnedRuntimeState,
  root,
  runtimeDirectory,
  sendRuntimeCommand,
  writeRuntimeState,
} from "./preview-runtime.mjs";

const args = process.argv.slice(2);
const supervise = args.includes("--supervise");
const noOpen = args.includes("--no-open");
const expectedVersion = args.find((argument) => /^\d+\.\d+\.\d+$/.test(argument));
const version = readPackageVersion();

if (expectedVersion && expectedVersion !== version) {
  console.error(`This launcher is for ${expectedVersion}, but the application is ${version}. Regenerate the launchers.`);
  process.exit(2);
}

function openPreview() {
  const opener = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", previewUrl], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  opener.unref();
}

async function isPreviewReady() {
  return new Promise((resolveReady) => {
    const probe = request(previewUrl, { method: "HEAD", timeout: 800 }, (response) => {
      response.resume();
      resolveReady(Boolean(response.statusCode && response.statusCode < 500));
    });
    probe.on("timeout", () => {
      probe.destroy();
      resolveReady(false);
    });
    probe.on("error", () => resolveReady(false));
    probe.end();
  });
}

async function waitForManagedPreview(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = readRuntimeState();
    if (state?.version === version) {
      try {
        const response = await sendRuntimeCommand(state, "ping", 500);
        if (response?.status === "ready" && (await isPreviewReady())) return true;
      } catch {
        // The supervisor may still be opening its pipe or starting Vite.
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  return false;
}

async function runLauncher() {
  const existing = readRuntimeState();
  if (existing) {
    try {
      const response = await sendRuntimeCommand(existing, "ping");
      if (response?.status === "ready") {
        if (existing.version !== version) {
          throw new Error(
            `Figure Composer ${existing.displayVersion ?? `v${existing.version}`} is already running. Close it with its matching closer before starting v${version}.`,
          );
        }
        if (!noOpen) openPreview();
        console.log(`Figure Composer v${version} is already running at ${previewUrl}`);
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("is already running")) throw error;
      removeOwnedRuntimeState(existing.token);
    }
  }

  mkdirSync(runtimeDirectory, { recursive: true });
  const supervisor = spawn(process.execPath, [import.meta.filename, version, "--supervise"], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  supervisor.unref();

  const ready = await waitForManagedPreview();
  if (!ready) {
    const state = readRuntimeState();
    if (state?.version === version) {
      try {
        await sendRuntimeCommand(state, "close");
      } catch {
        // The supervisor owns cleanup; never terminate a PID read from a stale state file.
      }
    }
    throw new Error(`Figure Composer did not start. See ${logPath}`);
  }

  if (!noOpen) openPreview();
  console.log(`Figure Composer v${version} started at ${previewUrl}`);
}

function runSupervisor() {
  mkdirSync(runtimeDirectory, { recursive: true });
  const token = randomUUID();
  const pipeName = `\\\\.\\pipe\\FigureComposer-${token}`;
  const logDescriptor = openSync(logPath, "a");
  const serverProcess = spawn(
    process.execPath,
    [resolve(root, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", "5173", "--strictPort"],
    {
      cwd: root,
      detached: false,
      stdio: ["ignore", logDescriptor, logDescriptor],
      windowsHide: true,
    },
  );

  let shuttingDown = false;
  let controlServer;

  const cleanup = () => {
    try {
      closeSync(logDescriptor);
    } catch {
      // Already closed during a previous cleanup path.
    }
    removeOwnedRuntimeState(token);
  };

  const stopOwnedServer = () => {
    if (serverProcess.pid) {
      spawnSync("taskkill.exe", ["/PID", String(serverProcess.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    }
  };

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopOwnedServer();
    controlServer?.close(() => {
      cleanup();
      process.exit(0);
    });
    setTimeout(() => {
      cleanup();
      process.exit(0);
    }, 2_000).unref();
  };

  controlServer = net.createServer((socket) => {
    let requestText = "";
    let handled = false;
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      requestText += chunk;
      if (handled || !requestText.includes("\n")) return;
      handled = true;
      try {
        const message = JSON.parse(requestText.trim());
        if (message.token !== token) {
          socket.end(`${JSON.stringify({ status: "denied" })}\n`);
          return;
        }
        if (message.command === "ping") {
          socket.end(`${JSON.stringify({ status: "ready", version })}\n`);
          return;
        }
        if (message.command === "close") {
          socket.end(`${JSON.stringify({ status: "closing", version })}\n`, () => setImmediate(shutdown));
          return;
        }
        socket.end(`${JSON.stringify({ status: "unknown-command" })}\n`);
      } catch {
        socket.end(`${JSON.stringify({ status: "invalid-request" })}\n`);
      }
    });
  });

  controlServer.on("error", shutdown);
  controlServer.listen(pipeName, () => {
    writeRuntimeState({
      version,
      displayVersion: `v${version}`,
      root,
      url: previewUrl,
      token,
      pipeName,
      supervisorPid: process.pid,
      serverPid: serverProcess.pid,
      startedAt: new Date().toISOString(),
    });
  });

  serverProcess.on("error", shutdown);
  serverProcess.on("exit", () => {
    if (!shuttingDown) shutdown();
  });
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (supervise) {
  runSupervisor();
} else {
  runLauncher().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
