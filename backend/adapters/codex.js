import { runCodexStatusPty } from "../codexPty.js";
import { execFileWithTimeout } from "../executor.js";
import { parseCodexStatus } from "../parser.js";

export async function getCodexUsage() {
  const result = await runCodexStatusPty({ timeoutMs: 15_000 });
  if (!result.ok) {
    const login = await execFileWithTimeout("codex", ["login", "status"], { timeoutMs: 8000 });
    const loginStatus = login.ok ? login.stdout.trim() : "CLI detected";

    return {
      provider: "codex",
      available: false,
      usage: null,
      status: `${loginStatus}; /status unavailable`
    };
  }

  const usage = parseCodexStatus(result.stdout);
  return usage ? { provider: "codex", available: true, usage } : {
    provider: "codex",
    available: false,
    usage: null,
    status: "CLI detected; usage output not recognized"
  };
}
