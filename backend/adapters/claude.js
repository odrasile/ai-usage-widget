import { execFileWithTimeout } from "../executor.js";
import { parseClaudeUsage } from "../parser.js";

export async function getClaudeUsage() {
  const result = await execFileWithTimeout("claude", [], {
    input: "/usage\n",
    timeoutMs: 8000
  });

  if (!result.ok) {
    return {
      provider: "claude",
      available: false,
      usage: null,
      status: "CLI detected; usage command failed"
    };
  }

  const usage = parseClaudeUsage(result.stdout);
  return usage ? { provider: "claude", available: true, usage } : {
    provider: "claude",
    available: false,
    usage: null,
    status: "CLI detected; usage output not recognized"
  };
}
