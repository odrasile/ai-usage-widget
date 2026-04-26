import { getClaudeUsage } from "./adapters/claude.js";
import { getCodexUsage } from "./adapters/codex.js";
import { getGeminiUsage } from "./adapters/gemini.js";
import { readConfig } from "./config.js";
import { detectProviders } from "./detector.js";

const ADAPTERS = {
  codex: getCodexUsage,
  claude: getClaudeUsage,
  gemini: getGeminiUsage
};

export async function getDetectedProviders() {
  return detectProviders();
}

export function getRefreshIntervalSec(projectRoot = process.cwd()) {
  const config = readConfig(projectRoot);
  return config.refresh_interval_sec;
}

export async function getProviderUsage(provider) {
  const adapter = ADAPTERS[provider];
  if (!adapter) {
    return {
      provider,
      available: false,
      usage: null,
      status: "Unsupported provider"
    };
  }

  try {
    const usage = await adapter();
    if (usage) {
      return usage;
    }

    return {
      provider,
      available: false,
      usage: null,
      status: "CLI detected; usage unavailable"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      provider,
      available: false,
      usage: null,
      status: `Error: ${message}`
    };
  }
}

export async function getUsageSnapshot(projectRoot = process.cwd()) {
  const detected = await getDetectedProviders();
  const providers = await Promise.all(detected.map((provider) => getProviderUsage(provider)));

  return {
    providers,
    refresh_interval_sec: getRefreshIntervalSec(projectRoot),
    updated_at: new Date().toISOString()
  };
}
