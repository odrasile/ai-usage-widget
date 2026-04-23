import { execFileWithTimeout } from "./executor.js";

const PROVIDERS = ["codex", "claude"];

export async function detectProviders() {
  const detected = [];

  for (const provider of PROVIDERS) {
    const result = await execFileWithTimeout("where.exe", [provider], { timeoutMs: 3000 });
    if (result.ok && result.stdout.trim().length > 0) {
      detected.push(provider);
    }
  }

  return detected;
}
