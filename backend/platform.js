import os from "node:os";
import path from "node:path";

export function getLookupCommand() {
  return process.platform === "win32"
    ? { command: "where.exe", args: [] }
    : { command: "which", args: [] };
}

export function getShellLaunch(commandLine) {
  if (process.platform === "win32") {
    return {
      file: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", commandLine]
    };
  }

  return {
    file: process.env.SHELL || "/bin/bash",
    args: ["-lc", commandLine]
  };
}

export function getPtyShellLaunch(commandLine) {
  return getShellLaunch(commandLine);
}

export function getRawLaunch(command, args = []) {
  return {
    file: command,
    args
  };
}

export function augmentPath(env) {
  if (process.platform === "win32") {
    return env;
  }

  const home = os.homedir();
  const commonPaths = [
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".local", "bin"),
    "/usr/local/bin"
  ];

  const currentPath = env.PATH || "";
  return {
    ...env,
    PATH: [...commonPaths, ...currentPath.split(":")].join(":")
  };
}

export function isWindows() {
  return process.platform === "win32";
}
