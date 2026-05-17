import { runClaudeUsagePty } from "../claudePty.js";
import { classifyCliFailure } from "../cliFailure.js";
import { parseClaudeUsage } from "../parser.js";
import { readyProvider, stateFromFailureKind, unavailableProvider } from "../providerState.js";

export async function getClaudeUsage(options = {}) {
  const result = await runClaudeUsagePty({ timeoutMs: 30_000, cwd: options.cwd });

  if (!result.ok) {
    return summarizeClaudeFailure(result.stderr, result.debugLogPath);
  }

  const usage = parseClaudeUsage(result.stdout);
  return usage ? readyProvider("claude", usage) : summarizeClaudeFailure(result.stdout, result.debugLogPath);
}

function summarizeClaudeFailure(message = "", logPath = "") {
  const normalized = String(message).trim();
  if (!normalized) {
    return unavailableProvider("claude", "no_usage_capability", {
      status: "Claude Code CLI detected; /usage unavailable",
      logPath
    });
  }

  const classified = classifyCliFailure("claude", normalized);
  if (classified.kind !== "unavailable") {
    return unavailableProvider("claude", stateFromFailureKind(classified.kind), {
      status: classified.status,
      detail: normalized,
      logPath
    });
  }

  if (isClaudeSetupScreen(normalized)) {
    return unavailableProvider("claude", "setup_required", {
      status: "Claude Code CLI detected; setup required",
      detail: normalized,
      logPath
    });
  }

  if (/prompt not ready/i.test(normalized)) {
    return unavailableProvider("claude", "prompt_not_ready", {
      status: "Claude Code CLI detected; prompt not ready",
      detail: normalized,
      logPath
    });
  }

  if (/no output captured/i.test(normalized)) {
    return unavailableProvider("claude", "no_output", {
      status: "Claude Code CLI detected; no /usage output",
      detail: normalized,
      logPath
    });
  }

  return unavailableProvider("claude", "parse_error", {
    status: "Claude Code CLI detected; unexpected output",
    detail: normalized,
    logPath
  });
}

function isClaudeSetupScreen(value) {
  return /welcome\s*to\s*claude\s*code/i.test(value)
    || /welcometoClaudeCode/i.test(value)
    || /let'?s\s*get\s*started/i.test(value)
    || /let'?sgetstarted/i.test(value)
    || /choose\s*the\s*text\s*style/i.test(value)
    || /choosethetextstyle/i.test(value)
    || /syntax\s*theme/i.test(value)
    || /syntaxtheme/i.test(value)
    || /\/init/i.test(value);
}
