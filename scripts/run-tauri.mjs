import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

const args = process.argv.slice(2);
const command = args[0] ?? "";
const tauriArgs = [...args];

if (process.platform === "linux" && command === "dev" && !tauriArgs.includes("--no-watch")) {
  tauriArgs.push("--no-watch");
}

const launch = resolveTauriLaunch(tauriArgs);
const child = spawn(launch.file, launch.args, {
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    ...(process.platform === "linux"
      ? {
          CHOKIDAR_USEPOLLING: "true",
          CHOKIDAR_INTERVAL: "350"
        }
      : {})
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

function resolveTauriLaunch(tauriArgs) {
  const localBin = process.platform === "win32"
    ? join(process.cwd(), "node_modules", ".bin", "tauri.cmd")
    : join(process.cwd(), "node_modules", ".bin", "tauri");

  if (existsSync(localBin)) {
    if (process.platform === "win32") {
      return {
        file: process.env.ComSpec || "cmd.exe",
        args: ["/d", "/s", "/c", localBin, ...tauriArgs]
      };
    }

    return {
      file: localBin,
      args: tauriArgs
    };
  }

  if (process.platform === "win32") {
    return {
      file: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "npx", "tauri", ...tauriArgs]
    };
  }

  return {
    file: findExecutableInPath("npx") ?? "npx",
    args: ["tauri", ...tauriArgs]
  };
}

function findExecutableInPath(name) {
  const pathValue = process.env.PATH ?? "";
  for (const segment of pathValue.split(delimiter)) {
    if (!segment) {
      continue;
    }

    const candidate = join(segment, name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
