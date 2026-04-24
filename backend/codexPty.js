import pty from "node-pty";
import { getPtyShellLaunch, augmentPath } from "./platform.js";

const ANSI_PATTERN = /\x1b\[[0-9;?]*[A-Za-z]/g;

export function runCodexStatusPty(options = {}) {
  const timeoutMs = options.timeoutMs ?? 15_000;

  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    const launch = getPtyShellLaunch("codex --no-alt-screen");
    const env = augmentPath({ ...process.env });

    const child = pty.spawn(
      launch.file,
      launch.args,
      {
        cols: 120,
        rows: 34,
        cwd: options.cwd ?? process.cwd(),
        env
      }
    );

    const finish = (ok) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);

      try {
        child.write("/quit\r");
        child.kill();
      } catch {
        // Process may already be gone.
      }

      resolve({
        ok,
        stdout: cleanTerminalOutput(output),
        stderr: "",
        code: ok ? 0 : null
      });
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    child.onData((chunk) => {
      output += chunk;

      if (/OpenAI Codex/i.test(output) && !/\/status\r?\n/i.test(output)) {
        child.write("/status\r");
      }

      if (/5h limit:/i.test(output) && /Weekly limit:/i.test(output)) {
        finish(true);
      }
    });

    child.onExit(() => finish(/5h limit:/i.test(output) && /Weekly limit:/i.test(output)));
  });
}

function cleanTerminalOutput(value) {
  return value
    .replace(ANSI_PATTERN, "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}
