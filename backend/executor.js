import { execFile } from "node:child_process";

const ALLOWED_COMMANDS = new Set(["where.exe", "codex", "claude"]);

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

  return new Promise((resolve) => {
    let child;
    const invocation = getInvocation(command, args);

    try {
      child = execFile(
        invocation.command,
        invocation.args,
        {
          timeout: timeoutMs,
          windowsHide: true,
          maxBuffer: 1024 * 1024
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
  if (process.platform !== "win32" || command === "where.exe") {
    return { command, args };
  }

  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", [command, ...args].map(quoteCmdPart).join(" ")]
  };
}

function quoteCmdPart(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}
