import { execFileWithTimeout } from "./executor.js";
import { getLookupCommand } from "./platform.js";

const PROVIDERS = ["codex", "claude"];

export async function detectProviders() {
  const detected = [];
  const lookup = getLookupCommand();

  for (const provider of PROVIDERS) {
    const result = await execFileWithTimeout(lookup.command, [...lookup.args, provider], { timeoutMs: 3000 });
    if (result.ok && result.stdout.trim().length > 0) {
      detected.push(provider);
    }
  }

  return detected;
}
