import pty from "node-pty";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getPtyShellLaunch, augmentPath } from "./platform.js";
import { parseClaudeUsage } from "./parser.js";
import { preparePtyRuntime } from "./ptySupport.js";
import { closePtyChild } from "./ptyCleanup.js";

const ANSI_PATTERN = /\x1b\[[0-9;?]*[A-Za-z]/g;
const CONPTY_NOISE_PATTERN = /C:\\.*node-pty\\lib\\conpty_console_list_agent\.js[\s\S]*$/i;

export function runClaudeUsagePty(options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;

  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    let usageAttempted = false;
    let usageCommandCount = 0;
    let dismissedDialogHandled = false;
    const eventLog = [];
    let child;

    try {
      const launch = getPtyShellLaunch("claude");
      const env = augmentPath({ ...process.env });
      preparePtyRuntime();
      child = pty.spawn(launch.file, launch.args, {
        cols: 120,
        rows: 34,
        cwd: options.cwd ?? process.cwd(),
        env
      });
      eventLog.push(`${timestamp()} SPAWN claude`);
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error);
      resolve({
        ok: false,
        stdout: "",
        stderr: failureReason,
        code: null,
        debugLogPath: writeDebugLog({
          ok: false,
          rawOutput: output,
          cleanedOutput: "",
          failureReason,
          eventLog
        })
      });
      return;
    }

    const finish = async (ok) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      usageRetryTimers.forEach(clearTimeout);

      await closePtyChild(child, eventLog, {
        exitInput: "\u001b\r",
        killDelayMs: 250,
        timestamp
      });

      const cleanedOutput = cleanTerminalOutput(output);
      const failureReason = ok ? "" : buildFailureReason(output, usageAttempted);

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
    const usageRetryTimers = [2_500, 5_000, 8_500].map((delay) => setTimeout(() => {
      if (settled || hasClaudeUsage(output)) {
        return;
      }

      usageAttempted = sendUsageCommand(child, usageCommandCount, eventLog) || usageAttempted;
      if (usageAttempted) {
        usageCommandCount += 1;
      }
    }, delay));

    child.onData((chunk) => {
      eventLog.push(`${timestamp()} DATA ${truncate(chunk.replace(/\r/g, "\\r").replace(/\n/g, "\\n"), 220)}`);
      output += chunk;

      if (isReadyForUsageCommand(output) && !hasClaudeUsage(output) && usageCommandCount === 0) {
        usageAttempted = sendUsageCommand(child, usageCommandCount, eventLog) || usageAttempted;
        if (usageAttempted) {
          usageCommandCount += 1;
        }
      }

      if (!dismissedDialogHandled && /status dialog dismissed/i.test(output) && usageCommandCount < 2) {
        dismissedDialogHandled = true;
        eventLog.push(`${timestamp()} EVENT status-dialog-dismissed`);
        setTimeout(() => {
          if (settled || hasClaudeUsage(output)) {
            return;
          }

          usageAttempted = sendUsageCommand(child, usageCommandCount, eventLog) || usageAttempted;
          if (usageAttempted) {
            usageCommandCount += 1;
          }
        }, 250);
      }

      if (hasClaudeUsage(output)) {
        eventLog.push(`${timestamp()} EVENT usage-detected`);
        finish(true);
      }
    });

    child.onExit(() => {
      eventLog.push(`${timestamp()} EXIT`);
      finish(hasClaudeUsage(output));
    });
  });
}

function isReadyForUsageCommand(output) {
  return /Status\s+Config\s+Usage\s+Stats/i.test(output)
    || /Esc\s+to\s+cancel/i.test(output)
    || />\s*$/m.test(output);
}

function hasClaudeUsage(output) {
  const cleaned = cleanTerminalOutput(output);
  return parseClaudeUsage(cleaned) !== null;
}

function cleanTerminalOutput(value) {
  return value
    .replace(ANSI_PATTERN, "")
    .replace(/\r/g, "\n")
    .replace(CONPTY_NOISE_PATTERN, "")
    .replace(/[\u2502\u2500]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sendUsageCommand(child, usageCommandCount, eventLog) {
  if (usageCommandCount >= 2) {
    return false;
  }

  try {
    eventLog.push(`${timestamp()} WRITE <ENTER>`);
    child.write("\r");
  } catch {
    // Ignore prompt wake-up failures.
  }

  setTimeout(() => {
    try {
      eventLog.push(`${timestamp()} WRITE /usage`);
      child.write("/usage\r");
    } catch {
      // Ignore write failures here and let the normal timeout path handle it.
    }
  }, 150);

  return true;
}

function buildFailureReason(output, usageAttempted) {
  const cleaned = cleanTerminalOutput(output);
  if (!usageAttempted) {
    return cleaned ? `Prompt not ready: ${cleaned.slice(0, 140)}` : "Prompt not ready";
  }

  if (!cleaned) {
    return "No output captured";
  }

  return `Unexpected output: ${cleaned.slice(0, 160)}`;
}

function writeDebugLog({ ok, rawOutput, cleanedOutput, failureReason, eventLog }) {
  const logDir = path.join(os.tmpdir(), "ai-usage-widget");
  mkdirSync(logDir, { recursive: true });

  const logPath = path.join(logDir, "claude-debug.log");
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
