import { getDetectedProviders, getProviderUsage, getRefreshIntervalSec, getUsageSnapshot } from "./model.js";

const command = process.argv[2] ?? "snapshot";
const projectRoot = process.argv[3] ?? process.cwd();
const provider = process.argv[4] ?? "";

if (!["snapshot", "detect", "provider", "refresh-interval"].includes(command)) {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

try {
  if (command === "snapshot") {
    const snapshot = await getUsageSnapshot(projectRoot);
    process.stdout.write(JSON.stringify(snapshot), () => process.exit(0));
  } else if (command === "detect") {
    const detected = await getDetectedProviders();
    process.stdout.write(JSON.stringify(detected), () => process.exit(0));
  } else if (command === "provider") {
    const usage = await getProviderUsage(provider);
    process.stdout.write(JSON.stringify(usage), () => process.exit(0));
  } else {
    const refreshIntervalSec = getRefreshIntervalSec(projectRoot);
    process.stdout.write(JSON.stringify({ refresh_interval_sec: refreshIntervalSec }), () => process.exit(0));
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(message, () => process.exit(1));
}
