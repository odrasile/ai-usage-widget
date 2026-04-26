import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const command = args[0] ?? "";
const tauriArgs = [...args];

if (process.platform === "linux" && command === "dev" && !tauriArgs.includes("--no-watch")) {
  tauriArgs.push("--no-watch");
}

const child = spawn("npx", ["tauri", ...tauriArgs], {
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
