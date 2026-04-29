import { appendFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

let installed = false;

export function installBackendErrorHandlers() {
  if (installed) {
    return;
  }

  installed = true;

  process.on("uncaughtException", (error) => {
    if (isKnownWindowsPtyPipeError(error)) {
      writeEarlyBackendLog("suppressed uncaughtException", error);
      return;
    }

    writeEarlyBackendLog("uncaughtException", error);
    process.stderr.write(formatError(error));
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    if (isKnownWindowsPtyPipeError(reason)) {
      writeEarlyBackendLog("suppressed unhandledRejection", reason);
      return;
    }

    writeEarlyBackendLog("unhandledRejection", reason);
    process.stderr.write(formatError(reason));
    process.exit(1);
  });
}

export function writeEarlyBackendLog(context, error) {
  try {
    const logDir = path.join(os.tmpdir(), "ai-usage-widget");
    mkdirSync(logDir, { recursive: true });
    appendFileSync(
      path.join(logDir, "backend-early-errors.log"),
      [
        `timestamp=${new Date().toISOString()}`,
        `context=${context}`,
        `platform=${process.platform}`,
        `node=${process.version}`,
        formatError(error),
        ""
      ].join("\n"),
      "utf8"
    );
  } catch {
    // Early logging must never become the backend failure reason.
  }
}

function isKnownWindowsPtyPipeError(error) {
  if (process.platform !== "win32" || !error || typeof error !== "object") {
    return false;
  }

  const code = error.code;
  const syscall = error.syscall;
  const address = String(error.address ?? error.path ?? "");

  return ["EPERM", "ENOENT", "ECONNRESET", "ECONNREFUSED"].includes(code)
    && ["connect", "open", "read"].includes(syscall)
    && /^\\\\\.\\pipe\\conpty-[^-]+(?:\.[^-]+)?-(?:in|out)$/i.test(address);
}

function formatError(error) {
  if (error instanceof Error) {
    return `${error.stack || error.message}\n`;
  }

  return `${String(error)}\n`;
}
