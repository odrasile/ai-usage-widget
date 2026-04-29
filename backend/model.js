import { readConfig } from "./config.js";
import { detectProviders } from "./detector.js";

const ADAPTERS = {
  codex: () => import("./adapters/codex.js").then((module) => module.getCodexUsage),
  claude: () => import("./adapters/claude.js").then((module) => module.getClaudeUsage),
  gemini: () => import("./adapters/gemini.js").then((module) => module.getGeminiUsage)
};

export async function getDetectedProviders() {
  return detectProviders();
}

export function getRefreshIntervalSec(projectRoot = process.cwd()) {
  const config = readConfig(projectRoot);
  return config.refresh_interval_sec;
}

export async function getProviderUsage(provider) {
  const loadAdapter = ADAPTERS[provider];
  if (!loadAdapter) {
    return {
      provider,
      available: false,
      usage: null,
      status: "Unsupported provider"
    };
  }

  try {
    const adapter = await loadAdapter();
    const usage = await adapter({ cwd: getCliCwd() });
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

function getCliCwd() {
  return process.env.AI_USAGE_WIDGET_CLI_CWD || process.cwd();
}
