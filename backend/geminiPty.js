import pty from "node-pty";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getPtyShellLaunch, augmentPath, isWindows } from "./platform.js";
import { parseGeminiUsage } from "./parser.js";
import { preparePtyRuntime } from "./ptySupport.js";
import { closePtyChild } from "./ptyCleanup.js";

const ANSI_PATTERN = /\x1b\[[0-9;?=>]*[ -/]*[@-~]/g;
const CONPTY_NOISE_PATTERN = /C:\\.*node-pty\\lib\\conpty_console_list_agent\.js[\s\S]*$/i;
const OSC_PATTERN = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const SINGLE_ESC_PATTERN = /\x1b[@-_]/g;
const GEMINI_KEYRING_BYPASS_VALUE = "1";

export function runGeminiUsagePty(options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const authTimeoutMs = options.authTimeoutMs ?? 45_000;
  const readyTimeoutMs = options.readyTimeoutMs ?? Math.max(timeoutMs, 35_000);

  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    let authWaitExtended = false;
    let readyWaitExtended = false;
    const eventLog = [];
    let child;
    let timer;

    try {
      const launch = getPtyShellLaunch("gemini");
      const env = getGeminiEnv(process.env);
      preparePtyRuntime();
      child = pty.spawn(launch.file, launch.args, {
        cols: 120,
        rows: 34,
        cwd: options.cwd ?? process.cwd(),
        env,
        ...(isWindows() ? { hide: true } : {})
      });
      eventLog.push(`${timestamp()} SPAWN gemini`);
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
      clearTimeout(minWaitTimer);

      await closePtyChild(child, eventLog, {
        exitInput: "\u001b\r",
        killDelayMs: 250,
        timestamp
      });

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

    timer = setTimeout(() => finish(false), timeoutMs);
    const minWaitTimer = setTimeout(() => {
      if (hasGeminiUsage(output)) {
        finish(true);
      }
    }, 3000);

    child.onData((chunk) => {
      eventLog.push(`${timestamp()} DATA ${truncate(chunk.replace(/\r/g, "\\r").replace(/\n/g, "\\n"), 220)}`);
      output += chunk;

      if (!authWaitExtended && isWaitingForAuthentication(output)) {
        authWaitExtended = true;
        clearTimeout(timer);
        timer = setTimeout(() => finish(false), authTimeoutMs);
        eventLog.push(`${timestamp()} EVENT auth-wait-timeout-extended ${authTimeoutMs}ms`);
      }

      if (!readyWaitExtended && showsReadyPrompt(output)) {
        readyWaitExtended = true;
        clearTimeout(timer);
        timer = setTimeout(() => finish(false), readyTimeoutMs);
        eventLog.push(`${timestamp()} EVENT ready-timeout-extended ${readyTimeoutMs}ms`);
      }

      if (hasQuota(output)) {
        eventLog.push(`${timestamp()} EVENT quota-detected`);
        finish(true);
      }

      if (hasGeminiUsage(output)) {
        eventLog.push(`${timestamp()} EVENT gemini-usage-detected`);
        finish(true);
      }
    });

    child.onExit(() => {
      eventLog.push(`${timestamp()} EXIT`);
      finish(hasGeminiUsage(output));
    });
  });
}

function hasGeminiUsage(output) {
  const cleaned = cleanTerminalOutput(output);
  return parseGeminiUsage(cleaned) !== null;
}

function hasQuota(output) {
  const cleaned = cleanTerminalOutput(output);
  return /(\d+(?:\.\d+)?)\s*%\s*used/i.test(cleaned);
}

function isWaitingForAuthentication(output) {
  return /waiting for authentication/i.test(cleanTerminalOutput(output));
}

function showsReadyPrompt(output) {
  const cleaned = cleanTerminalOutput(output);
  return /ready\s*\(.*\)/i.test(cleaned) || /Gemini CLI/i.test(cleaned);
}

function cleanTerminalOutput(value) {
  return value
    .replace(OSC_PATTERN, "")
    .replace(ANSI_PATTERN, "")
    .replace(/\r/g, "\n")
    .replace(CONPTY_NOISE_PATTERN, "")
    .replace(SINGLE_ESC_PATTERN, "")
    .replace(/(?:^|\s)[><?][a-z0-9;?:\\/_-]+/gi, " ")
    .replace(/[\u2502\u2500]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFailureReason(output) {
  const cleaned = cleanTerminalOutput(output);
  if (/waiting for authentication/i.test(cleaned)) {
    return "Waiting for authentication";
  }

  if (/ready\s*\(.*\)/i.test(cleaned) || /Gemini CLI/i.test(cleaned)) {
    return "Gemini prompt ready; quota not visible yet";
  }

  if (!cleaned) {
    return "No output captured";
  }

  return `Unexpected output: ${cleaned.slice(0, 160)}`;
}

function writeDebugLog({ ok, rawOutput, cleanedOutput, failureReason, eventLog }) {
  const logDir = path.join(os.tmpdir(), "ai-usage-widget");
  mkdirSync(logDir, { recursive: true });

  const logPath = path.join(logDir, "gemini-debug.log");
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

export function getGeminiEnv(baseEnv = process.env) {
  return augmentPath({
    ...baseEnv,
    GEMINI_API_KEY: baseEnv.GEMINI_API_KEY || GEMINI_KEYRING_BYPASS_VALUE
  });
}
