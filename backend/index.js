import { getUsageSnapshot } from "./model.js";

const command = process.argv[2] ?? "snapshot";
const projectRoot = process.argv[3] ?? process.cwd();

if (command !== "snapshot") {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

try {
  const snapshot = await getUsageSnapshot(projectRoot);
  process.stdout.write(JSON.stringify(snapshot), () => process.exit(0));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(message, () => process.exit(1));
}
