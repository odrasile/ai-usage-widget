import { installBackendErrorHandlers, writeEarlyBackendLog } from "./runtimeErrors.js";

installBackendErrorHandlers();

const command = process.argv[2] ?? "snapshot";
const projectRoot = process.argv[3] ?? process.cwd();
const provider = process.argv[4] ?? "";

if (!["snapshot", "detect", "provider", "refresh-interval"].includes(command)) {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
} else {
  try {
    const {
      getDetectedProviders,
      getProviderUsage,
      getRefreshIntervalSec,
      getUsageSnapshot
    } = await import("./model.js");
    let payload;
    if (command === "snapshot") {
      payload = await getUsageSnapshot(projectRoot);
    } else if (command === "detect") {
      payload = await getDetectedProviders();
    } else if (command === "provider") {
      payload = await getProviderUsage(provider);
    } else {
      payload = { refresh_interval_sec: getRefreshIntervalSec(projectRoot) };
    }

    await writeStream(process.stdout, JSON.stringify(payload));
    process.exit(0);
  } catch (error) {
    writeEarlyBackendLog(`command ${command}`, error);
    const message = error instanceof Error ? error.message : String(error);
    await writeStream(process.stderr, message);
    process.exit(1);
  }
}

function writeStream(stream, value) {
  return new Promise((resolve, reject) => {
    stream.write(value, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
