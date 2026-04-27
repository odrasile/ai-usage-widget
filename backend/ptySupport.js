import { chmodSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function preparePtyRuntime() {
  if (process.platform !== "darwin") {
    return;
  }

  const helper = resolveDarwinSpawnHelperPath();
  if (!helper || !existsSync(helper)) {
    return;
  }

  try {
    chmodSync(helper, 0o755);
  } catch {
    // If chmod is blocked, node-pty will surface the PTY failure to the adapter.
  }
}

function resolveDarwinSpawnHelperPath() {
  const backendDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.dirname(backendDir);
  const arch = process.arch === "arm64" ? "darwin-arm64" : "darwin-x64";

  return path.join(rootDir, "node_modules", "node-pty", "prebuilds", arch, "spawn-helper");
}
