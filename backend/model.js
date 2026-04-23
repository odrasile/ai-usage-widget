import { getClaudeUsage } from "./adapters/claude.js";
import { getCodexUsage } from "./adapters/codex.js";
import { readConfig } from "./config.js";
import { detectProviders } from "./detector.js";

const ADAPTERS = {
  codex: getCodexUsage,
  claude: getClaudeUsage
};

export async function getUsageSnapshot(projectRoot = process.cwd()) {
  const config = readConfig(projectRoot);
  const detected = await detectProviders();
  const providers = [];

  for (const provider of detected) {
    const adapter = ADAPTERS[provider];
    if (!adapter) {
      continue;
    }

    try {
      const usage = await adapter();
      if (usage) {
        providers.push(usage);
      } else {
        providers.push({
          provider,
          available: false,
          usage: null,
          status: "CLI detected; usage unavailable"
        });
      }
    } catch {
      providers.push({
        provider,
        available: false,
        usage: null,
        status: "CLI detected; usage unavailable"
      });
    }
  }

  return {
    providers,
    refresh_interval_sec: config.refresh_interval_sec,
    updated_at: new Date().toISOString()
  };
}
