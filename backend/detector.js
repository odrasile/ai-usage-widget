import { execFileWithTimeout } from "./executor.js";
import { getLookupCommand, augmentPath } from "./platform.js";

const PROVIDERS = ["codex", "claude", "gemini"];
const DETECTION_CACHE_TTL_MS = 5 * 60_000;

let cachedProviders = null;
let cacheExpiresAt = 0;
let pendingDetection = null;

export async function detectProviders() {
  const now = Date.now();
  if (cachedProviders && now < cacheExpiresAt) {
    return cachedProviders;
  }

  if (pendingDetection) {
    return pendingDetection;
  }

  pendingDetection = detectProvidersUncached();
  try {
    const providers = await pendingDetection;
    cachedProviders = providers;
    cacheExpiresAt = Date.now() + DETECTION_CACHE_TTL_MS;
    return providers;
  } finally {
    pendingDetection = null;
  }
}

async function detectProvidersUncached() {
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
