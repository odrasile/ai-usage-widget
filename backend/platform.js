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

export function isWindows() {
  return process.platform === "win32";
}
