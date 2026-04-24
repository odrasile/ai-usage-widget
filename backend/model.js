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

export async function getUsageSnapshot(projectRoot = process.cwd()) {
  const config = readConfig(projectRoot);
  const detected = await detectProviders();
  const providers = (await Promise.all(detected.map(async (provider) => {
    const adapter = ADAPTERS[provider];
    if (!adapter) {
      return null;
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
  }))).filter(Boolean);

  return {
    providers,
    refresh_interval_sec: config.refresh_interval_sec,
    updated_at: new Date().toISOString()
  };
}
