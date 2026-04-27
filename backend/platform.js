import os from "node:os";
import path from "node:path";
import { readdirSync } from "node:fs";

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
    const appData = env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const commonPaths = [
      path.join(appData, "npm"),
      path.join(localAppData, "Programs", "nodejs"),
      path.join(os.homedir(), ".cargo", "bin")
    ];

    const currentPath = env.PATH || "";
    return {
      ...env,
      PATH: [...commonPaths, ...currentPath.split(";")].join(";")
    };
  }

  const home = os.homedir();
  const commonPaths = [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    ...getNvmNodeBinPaths(home),
    path.join(home, ".volta", "bin"),
    path.join(home, ".asdf", "shims"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".local", "bin"),
    path.join(home, ".cargo", "bin"),
    "/usr/local/bin",
    "/usr/local/sbin",
    "/opt/local/bin",
    "/opt/local/sbin"
  ];

  const currentPath = env.PATH || "";
  return {
    ...env,
    PATH: [...commonPaths, ...currentPath.split(":")].join(":")
  };
}

function getNvmNodeBinPaths(home) {
  const versionsDir = path.join(home, ".nvm", "versions", "node");
  try {
    return readdirSync(versionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(versionsDir, entry.name, "bin"));
  } catch {
    return [];
  }
}

export function isWindows() {
  return process.platform === "win32";
}
