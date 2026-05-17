import { runCodexStatusPty } from "../codexPty.js";
import { classifyCliFailure } from "../cliFailure.js";
import { execFileWithTimeout } from "../executor.js";
import { parseCodexStatus } from "../parser.js";

export async function getCodexUsage(options = {}) {
  const result = await runCodexStatusPty({ timeoutMs: 35_000, cwd: options.cwd });
  const parsedFromOutput = parseCodexStatus(result.stdout);
  if (parsedFromOutput) {
    return { provider: "codex", available: true, usage: parsedFromOutput };
  }

  if (!result.ok) {
    const failure = classifyCliFailure("codex", `${result.stderr}\n${result.stdout}`);
    if (failure.kind !== "unavailable") {
      return {
        provider: "codex",
        available: false,
        usage: null,
        status: failure.status,
        ...(result.debugLogPath ? { log_path: result.debugLogPath } : {})
      };
    }

    const login = await execFileWithTimeout("codex", ["login", "status"], {
      timeoutMs: 8000,
      cwd: options.cwd
    });
    const loginOutput = login.ok ? login.stdout.trim() : login.stderr.trim();
    const loginFailure = classifyCliFailure("codex", loginOutput);
    const loginStatus = loginFailure.kind === "update_required"
      ? loginFailure.status
      : (login.ok ? login.stdout.trim() : "CLI detected");

    return {
      provider: "codex",
      available: false,
      usage: null,
      status: `${loginStatus}; /status unavailable`,
      ...(result.debugLogPath ? { log_path: result.debugLogPath } : {})
    };
  }

  return {
    provider: "codex",
    available: false,
    usage: null,
    status: classifyCliFailure("codex", result.stdout).status,
    ...(result.debugLogPath ? { log_path: result.debugLogPath } : {})
  };
}
