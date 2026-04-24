import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { getLookupCommand, getShellLaunch, isWindows } from "./platform.js";

const ALLOWED_COMMANDS = new Set(["where.exe", "which", "codex", "claude", "gemini"]);

export function execFileWithTimeout(command, args = [], options = {}) {
  if (!ALLOWED_COMMANDS.has(command)) {
    return Promise.resolve({
      ok: false,
      stdout: "",
      stderr: `Command not allowed: ${command}`,
      code: null
    });
  }

  const timeoutMs = options.timeoutMs ?? 8000;
  const env = { ...process.env };

  // In Linux, double-clicking AppImage often misses the user's PATH where npm globals are.
  if (!isWindows()) {
    const home = os.homedir();
    const commonPaths = [
      path.join(home, ".npm-global", "bin"),
      path.join(home, ".local", "bin"),
      "/usr/local/bin"
    ];
    
    const currentPath = env.PATH || "";
    env.PATH = [...commonPaths, ...currentPath.split(":")].join(":");
  }

  return new Promise((resolve) => {
    let child;
    const invocation = getInvocation(command, args);

    try {
      child = execFile(
        invocation.command,
        invocation.args,
        {
          timeout: timeoutMs,
          windowsHide: isWindows(),
          maxBuffer: 1024 * 1024,
          env
        },
        (error, stdout, stderr) => {
          resolve({
            ok: !error,
            stdout: String(stdout ?? ""),
            stderr: String(stderr ?? ""),
            code: error && typeof error.code === "number" ? error.code : 0
          });
        }
      );
    } catch (error) {
      resolve({
        ok: false,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        code: null
      });
      return;
    }

    if (options.input) {
      child.stdin?.write(options.input);
      child.stdin?.end();
    }
  });
}

function getInvocation(command, args) {
  if (command === "where.exe" || command === "which") {
    return { command, args };
  }

  const commandLine = [command, ...args].map(quoteShellPart).join(" ");
  return getShellLaunch(commandLine);
}

function quoteShellPart(value) {
  if (isWindows()) {
    return `"${String(value).replace(/"/g, '\\"')}"`;
  }

  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
