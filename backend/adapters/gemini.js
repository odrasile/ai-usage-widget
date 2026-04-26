import { runGeminiUsagePty } from "../geminiPty.js";
import { classifyCliFailure } from "../cliFailure.js";
import { parseGeminiUsage } from "../parser.js";
import { execFileWithTimeout } from "../executor.js";
import { isWindows } from "../platform.js";

export async function getGeminiUsage() {
  if (!isWindows()) {
    return getGeminiUsageFromPty();
  }

  // Try non-interactive mode with a simple probe prompt.
  // This is often enough to trigger a quota check or show the status line.
  const nonInteractiveResult = await execFileWithTimeout("gemini", ["-p", "hi"], { timeoutMs: 10_000 });
  if (nonInteractiveResult.ok || /exhausted/i.test(nonInteractiveResult.stdout || nonInteractiveResult.stderr)) {
    const usage = parseGeminiUsage(nonInteractiveResult.stdout + (nonInteractiveResult.stderr || ""));
    if (usage) {
      return { provider: "gemini", available: true, usage };
    }
  }

  // Fallback to PTY if needed
  return getGeminiUsageFromPty();
}

async function getGeminiUsageFromPty() {
  const result = await runGeminiUsagePty({ timeoutMs: 35_000, authTimeoutMs: 50_000 });
  const logSuffix = result.debugLogPath ? ` Log: ${result.debugLogPath}` : "";

  if (!result.ok) {
    return {
      provider: "gemini",
      available: false,
      usage: null,
      status: `${summarizeGeminiFailure(result.stderr || result.stdout)}${logSuffix}`
    };
  }

  const usage = parseGeminiUsage(result.stdout);
  return usage ? { provider: "gemini", available: true, usage } : {
    provider: "gemini",
    available: false,
    usage: null,
    status: `${summarizeGeminiFailure(result.stdout)}${logSuffix}`
  };
}

function summarizeGeminiFailure(message = "") {
  const normalized = String(message).trim();
  if (!normalized) {
    return "Gemini CLI detected; /usage unavailable";
  }

  const classified = classifyCliFailure("gemini", normalized);
  if (classified.kind !== "unavailable") {
    return classified.status;
  }

  if (/no output captured/i.test(normalized)) {
    return "Gemini CLI detected; no /usage output";
  }

  return "Gemini CLI detected; unexpected output";
}
