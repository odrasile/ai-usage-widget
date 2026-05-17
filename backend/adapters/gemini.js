import { runGeminiUsagePty } from "../geminiPty.js";
import { getGeminiEnv } from "../geminiEnv.js";
import { classifyCliFailure } from "../cliFailure.js";
import { parseGeminiUsage } from "../parser.js";
import { execFileWithTimeout } from "../executor.js";
import { isWindows } from "../platform.js";
import { readyProvider, stateFromFailureKind, unavailableProvider } from "../providerState.js";

export async function getGeminiUsage(options = {}) {
  if (!isWindows()) {
    return getGeminiUsageFromPty(options);
  }

  // Try non-interactive mode with a simple probe prompt.
  // This is often enough to trigger a quota check or show the status line.
  const nonInteractiveResult = await execFileWithTimeout("gemini", ["-p", "hi"], {
    timeoutMs: 10_000,
    env: getGeminiEnv(),
    cwd: options.cwd
  });
  if (nonInteractiveResult.ok || /exhausted/i.test(nonInteractiveResult.stdout || nonInteractiveResult.stderr)) {
    const usage = parseGeminiUsage(nonInteractiveResult.stdout + (nonInteractiveResult.stderr || ""));
    if (usage) {
      return readyProvider("gemini", usage);
    }
  }

  // Fallback to PTY if needed
  return getGeminiUsageFromPty(options);
}

async function getGeminiUsageFromPty(options = {}) {
  const result = await runGeminiUsagePty({ timeoutMs: 35_000, authTimeoutMs: 50_000, cwd: options.cwd });

  if (!result.ok) {
    return summarizeGeminiFailure(result.stderr || result.stdout, result.debugLogPath);
  }

  const usage = parseGeminiUsage(result.stdout);
  return usage ? readyProvider("gemini", usage) : summarizeGeminiFailure(result.stdout, result.debugLogPath);
}

function summarizeGeminiFailure(message = "", logPath = "") {
  const normalized = String(message).trim();
  if (!normalized) {
    return unavailableProvider("gemini", "no_usage_capability", {
      status: "Gemini CLI detected; /usage unavailable",
      logPath
    });
  }

  const classified = classifyCliFailure("gemini", normalized);
  if (classified.kind !== "unavailable") {
    return unavailableProvider("gemini", stateFromFailureKind(classified.kind), {
      status: classified.status,
      detail: normalized,
      logPath
    });
  }

  if (/no output captured/i.test(normalized)) {
    return unavailableProvider("gemini", "no_output", {
      status: "Gemini CLI detected; no /usage output",
      detail: normalized,
      logPath
    });
  }

  if (/quota\s+not\s+visible|prompt\s+ready/i.test(normalized)) {
    return unavailableProvider("gemini", "no_usage_capability", {
      status: "Gemini CLI detected; quota not visible",
      detail: normalized,
      logPath
    });
  }

  return unavailableProvider("gemini", "parse_error", {
    status: "Gemini CLI detected; unexpected output",
    detail: normalized,
    logPath
  });
}
