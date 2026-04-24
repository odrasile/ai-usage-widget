import { runClaudeUsagePty } from "../claudePty.js";
import { parseClaudeUsage } from "../parser.js";

export async function getClaudeUsage() {
  const result = await runClaudeUsagePty({ timeoutMs: 30_000 });
  const logSuffix = result.debugLogPath ? ` Log: ${result.debugLogPath}` : "";

  if (!result.ok) {
    return {
      provider: "claude",
      available: false,
      usage: null,
      status: `${summarizeClaudeFailure(result.stderr)}${logSuffix}`
    };
  }

  const usage = parseClaudeUsage(result.stdout);
  return usage ? { provider: "claude", available: true, usage } : {
    provider: "claude",
    available: false,
    usage: null,
    status: `${summarizeClaudeFailure(result.stdout)}${logSuffix}`
  };
}

function summarizeClaudeFailure(message = "") {
  const normalized = String(message).trim();
  if (!normalized) {
    return "Claude Code CLI detected; /usage unavailable";
  }

  if (/welcome\s+back|\/init|claudecode/i.test(normalized)) {
    return "Claude Code CLI detected; waiting at welcome screen";
  }

  if (/prompt not ready/i.test(normalized)) {
    return "Claude Code CLI detected; prompt not ready";
  }

  if (/no output captured/i.test(normalized)) {
    return "Claude Code CLI detected; no /usage output";
  }

  return "Claude Code CLI detected; unexpected output";
}
