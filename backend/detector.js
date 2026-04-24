import { execFileWithTimeout } from "./executor.js";
import { getLookupCommand, augmentPath } from "./platform.js";

const PROVIDERS = ["codex", "claude", "gemini"];

export async function detectProviders() {
  const detected = [];
  const lookup = getLookupCommand();
  const env = augmentPath({ ...process.env });

  for (const provider of PROVIDERS) {
    const result = await execFileWithTimeout(lookup.command, [...lookup.args, provider], { 
      timeoutMs: 3000,
      env 
    });
    if (result.ok && result.stdout.trim().length > 0) {
      detected.push(provider);
    }
  }

  return detected;
}
