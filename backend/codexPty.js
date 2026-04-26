import pty from "node-pty";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getPtyShellLaunch, augmentPath } from "./platform.js";
import { parseCodexStatus } from "./parser.js";

const ANSI_PATTERN = /\x1b\[[0-9;?=>]*[ -/]*[@-~]/g;
const OSC_PATTERN = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const SINGLE_ESC_PATTERN = /\x1b[@-_]/g;

export function runCodexStatusPty(options = {}) {
  const timeoutMs = options.timeoutMs ?? 25_000;
  const settleAfterUsageMs = options.settleAfterUsageMs ?? 450;

  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    let statusAttempted = false;
    let readyTimer = null;
    let retryTimer = null;
    let settleTimer = null;
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
      if (readyTimer) {
        clearTimeout(readyTimer);
      }
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      if (settleTimer) {
        clearTimeout(settleTimer);
      }

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

    child.onData((chunk) => {
      eventLog.push(`${timestamp()} DATA ${truncate(chunk.replace(/\r/g, "\\r").replace(/\n/g, "\\n"), 220)}`);
      output += chunk;

      if (!statusAttempted && isReadyForStatusCommand(output)) {
        eventLog.push(`${timestamp()} EVENT codex-screen-ready`);
        if (readyTimer) {
          clearTimeout(readyTimer);
        }

        readyTimer = setTimeout(() => {
          if (settled || statusAttempted || hasCodexUsage(output)) {
            return;
          }

          eventLog.push(`${timestamp()} EVENT send-/status`);
          statusAttempted = sendStatusCommand(child, eventLog);
          if (statusAttempted) {
            retryTimer = setTimeout(() => {
              if (settled || hasCodexUsage(output)) {
                return;
              }

              const screen = currentCodexScreen(output);
              if (/›\s*\/status/i.test(screen)) {
                eventLog.push(`${timestamp()} EVENT retry-/status`);
                sendStatusCommand(child, eventLog);
              }
            }, 1800);
          }
        }, 500);
      }

      if (hasCodexUsage(output)) {
        if (settleTimer) {
          clearTimeout(settleTimer);
        }

        settleTimer = setTimeout(() => {
          eventLog.push(`${timestamp()} EVENT codex-usage-settled`);
          finish(true);
        }, settleAfterUsageMs);
      }
    });

    child.onExit(() => {
      eventLog.push(`${timestamp()} EXIT`);
      finish(hasCodexUsage(output));
    });
  });
}

function isReadyForStatusCommand(output) {
  const screen = currentCodexScreen(output);
  if (!/OpenAI Codex/i.test(screen)) {
    return false;
  }

  if (/Waiting for authentication/i.test(screen)) {
    return false;
  }

  const hasStableHeader = /model:\s+/i.test(screen) && /directory:\s+/i.test(screen);
  const hasReadySignal = /(Tip:|Heads up)/i.test(screen);
  const stillOnlyBooting = /Booting MCP server/i.test(screen) && !hasReadySignal;

  if (stillOnlyBooting) {
    return false;
  }

  return hasStableHeader && hasReadySignal;
}

function hasCodexUsage(output) {
  return parseCodexStatus(cleanTerminalOutput(output)) !== null;
}

function sendStatusCommand(child, eventLog) {
  try {
    eventLog.push(`${timestamp()} WRITE /status`);
    child.write("/status\r");
    return true;
  } catch {
    return false;
  }
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
  const screen = currentCodexScreen(output);
  const cleaned = cleanTerminalOutput(output);
  if (!cleaned) {
    return "No output captured";
  }

  if (parseCodexStatus(cleaned)) {
    return "";
  }

  if (!/OpenAI Codex/i.test(screen)) {
    return `Codex shell not ready: ${screen || cleaned}`.slice(0, 500);
  }

  if (/Waiting for authentication/i.test(screen)) {
    return "Waiting for authentication";
  }

  if (/Booting MCP server/i.test(screen) && !/(Tip:|Heads up)/i.test(screen)) {
    return `Booting MCP server: ${screen}`.slice(0, 500);
  }

  return cleaned;
}

function recentTerminalOutput(value, maxLength = 1400) {
  const cleaned = cleanTerminalOutput(value);
  return cleaned.length <= maxLength ? cleaned : cleaned.slice(-maxLength);
}

function currentCodexScreen(value) {
  const cleaned = cleanTerminalOutput(value);
  const markers = [
    cleaned.lastIndexOf("╭────────────────"),
    cleaned.lastIndexOf("│ >_ OpenAI Codex"),
    cleaned.lastIndexOf(">_ OpenAI Codex"),
    cleaned.lastIndexOf("OpenAI Codex")
  ].filter((index) => index >= 0);

  if (markers.length === 0) {
    return recentTerminalOutput(cleaned);
  }

  const start = Math.max(...markers);
  return cleaned.slice(start).trim();
}
