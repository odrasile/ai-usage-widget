import pty from "node-pty";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getPtyShellLaunch, augmentPath } from "./platform.js";
import { parseCodexStatus } from "./parser.js";

const ANSI_PATTERN = /\x1b\[[0-9;?]*[A-Za-z]/g;
const OSC_PATTERN = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const SINGLE_ESC_PATTERN = /\x1b[@-_]/g;

export function runCodexStatusPty(options = {}) {
  const timeoutMs = options.timeoutMs ?? 15_000;

  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    let statusCommandCount = 0;
    let statusAttempted = false;
    const eventLog = [];
    const launch = getPtyShellLaunch("codex --no-alt-screen");
    const env = augmentPath({ ...process.env });

    const child = pty.spawn(
      launch.file,
      launch.args,
      {
        cols: 120,
        rows: 34,
        cwd: options.cwd ?? process.cwd(),
        env
      }
    );
    eventLog.push(`${timestamp()} SPAWN codex`);

    const finish = (ok) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);

      try {
        eventLog.push(`${timestamp()} WRITE /quit`);
        child.write("/quit\r");
        child.kill();
      } catch {
        // Process may already be gone.
      }

      const cleanedOutput = cleanTerminalOutput(output);
      const failureReason = ok ? "" : buildFailureReason(output);

      resolve({
        ok,
        stdout: cleanedOutput,
        stderr: failureReason,
        code: ok ? 0 : null,
        debugLogPath: writeDebugLog({
          ok,
          rawOutput: output,
          cleanedOutput,
          failureReason,
          eventLog
        })
      });
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    const retryTimers = [2_500, 5_000, 8_000].map((delay) => setTimeout(() => {
      if (settled || hasCodexUsage(output)) {
        return;
      }

      statusAttempted = sendStatusCommand(child, statusCommandCount) || statusAttempted;
      if (statusAttempted) {
        statusCommandCount += 1;
      }
    }, delay));

    child.onData((chunk) => {
      eventLog.push(`${timestamp()} DATA ${truncate(chunk.replace(/\r/g, "\\r").replace(/\n/g, "\\n"), 220)}`);
      output += chunk;

      if (isReadyForStatusCommand(output) && !hasCodexUsage(output) && statusCommandCount === 0) {
        statusAttempted = sendStatusCommand(child, statusCommandCount) || statusAttempted;
        if (statusAttempted) {
          statusCommandCount += 1;
        }
      }

      if (hasCodexUsage(output)) {
        finish(true);
      }
    });

    child.onExit(() => {
      eventLog.push(`${timestamp()} EXIT`);
      retryTimers.forEach(clearTimeout);
      finish(hasCodexUsage(output));
    });
  });
}

function isReadyForStatusCommand(output) {
  const cleaned = cleanTerminalOutput(output);
  if (!/OpenAI Codex/i.test(cleaned)) {
    return false;
  }

  if (/Booting MCP server/i.test(cleaned) || /Waiting for authentication/i.test(cleaned)) {
    return false;
  }

  return /(?:^|\n)[›>]\s*$/m.test(cleaned)
    || /Use \/skills to list available skills/i.test(cleaned);
}

function hasCodexUsage(output) {
  return parseCodexStatus(cleanTerminalOutput(output)) !== null;
}

function sendStatusCommand(child, statusCommandCount) {
  if (statusCommandCount >= 3) {
    return false;
  }

  try {
    child.write("\r");
  } catch {
    // Ignore prompt wake-up failures.
  }

  setTimeout(() => {
    try {
      child.write("\u0015");
      child.write("/status\r");
    } catch {
      // Ignore write failures here and let timeout handle it.
    }
  }, 250);

  return true;
}

function writeDebugLog({ ok, rawOutput, cleanedOutput, failureReason, eventLog }) {
  const logDir = path.join(os.tmpdir(), "ai-usage-widget");
  mkdirSync(logDir, { recursive: true });

  const logPath = path.join(logDir, "codex-debug.log");
  const body = [
    `timestamp=${new Date().toISOString()}`,
    `ok=${ok}`,
    `failure_reason=${failureReason || ""}`,
    "",
    "[events]",
    ...eventLog,
    "",
    "[cleaned_output]",
    cleanedOutput,
    "",
    "[raw_output]",
    rawOutput
  ].join("\n");

  writeFileSync(logPath, body, "utf8");
  return logPath;
}

function truncate(value, maxLength) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}

function timestamp() {
  return new Date().toISOString();
}

function cleanTerminalOutput(value) {
  return value
    .replace(OSC_PATTERN, "")
    .replace(ANSI_PATTERN, "")
    .replace(SINGLE_ESC_PATTERN, "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function buildFailureReason(output) {
  const cleaned = cleanTerminalOutput(output);
  if (!cleaned) {
    return "No output captured";
  }

  if (parseCodexStatus(cleaned)) {
    return "";
  }

  return cleaned;
}
