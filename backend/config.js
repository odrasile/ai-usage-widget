import fs from "node:fs";
import path from "node:path";

const DEFAULT_INTERVAL_SEC = 120;

export function readConfig(projectRoot = process.cwd()) {
  const configPath = path.join(projectRoot, "config.json");

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const refreshInterval = Number(config.refresh_interval_sec);

    return {
      refresh_interval_sec: clampInterval(refreshInterval)
    };
  } catch {
    return {
      refresh_interval_sec: DEFAULT_INTERVAL_SEC
    };
  }
}

function clampInterval(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_INTERVAL_SEC;
  }

  return Math.min(120, Math.max(30, value));
}
