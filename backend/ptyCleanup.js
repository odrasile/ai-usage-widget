import { readFileSync } from "node:fs";

export function closePtyChild(child, eventLog, options = {}) {
  const exitInput = options.exitInput ?? "";
  const exitGraceMs = options.exitGraceMs ?? options.killDelayMs ?? 250;
  const terminateGraceMs = options.terminateGraceMs ?? 1000;
  const killGraceMs = options.killGraceMs ?? 500;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());

  return new Promise(async (resolve) => {
    let done = false;
    let exitSubscription = null;
    let exitResolver = null;

    const waitForExit = () => new Promise((exitResolve) => {
      exitResolver = exitResolve;
    });

    const exitPromise = waitForExit();

    const finish = () => {
      if (done) {
        return;
      }

      done = true;
      try {
        exitSubscription?.dispose?.();
      } catch {
        // Some node-pty versions do not expose a disposable subscription.
      }
      exitResolver?.();
      resolve();
    };

    try {
      exitSubscription = child.onExit(() => finish());
    } catch {
      // If exit subscription fails, the timed kill path still closes the PTY.
    }

    if (exitInput) {
      try {
        eventLog.push(`${timestamp()} WRITE ${formatControlInput(exitInput)}`);
        child.write(exitInput);
      } catch {
        // Continue to the kill path; writes can fail if the process already exited.
      }
    }

    await waitForExitOrTimeout(exitPromise, exitGraceMs);
    if (done) {
      return;
    }

    terminatePtyTree(child, eventLog, timestamp, "SIGTERM");
    await waitForExitOrTimeout(exitPromise, terminateGraceMs);
    if (done) {
      return;
    }

    terminatePtyTree(child, eventLog, timestamp, "SIGKILL");
    await waitForExitOrTimeout(exitPromise, killGraceMs);
    finish();
  });
}

function terminatePtyTree(child, eventLog, timestamp, signal) {
  if (process.platform === "win32") {
    try {
      eventLog.push(`${timestamp()} KILL child`);
      child.kill();
    } catch (error) {
      if (!isMissingProcessError(error)) {
        eventLog.push(`${timestamp()} KILL child-failed: ${formatError(error)}`);
      }
    }
    return;
  }

  const pid = Number(child.pid);

  if (Number.isInteger(pid) && pid > 0) {
    if (isOwnProcessGroup(pid)) {
      try {
        eventLog.push(`${timestamp()} KILL process-group ${pid} ${signal}`);
        process.kill(-pid, signal);
        return;
      } catch (error) {
        if (!isMissingProcessError(error)) {
          eventLog.push(`${timestamp()} KILL process-group-failed ${pid} ${signal}: ${formatError(error)}`);
        }
      }
    } else {
      eventLog.push(`${timestamp()} SKIP process-group ${pid} ${signal}: pid is not its own process group`);
    }
  }

  try {
    eventLog.push(`${timestamp()} KILL child ${signal}`);
    child.kill(signal);
  } catch (error) {
    if (!isMissingProcessError(error)) {
      eventLog.push(`${timestamp()} KILL child-failed ${signal}: ${formatError(error)}`);
    }
  }
}

function waitForExitOrTimeout(exitPromise, timeoutMs) {
  return Promise.race([
    exitPromise,
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);
}

function isMissingProcessError(error) {
  return error?.code === "ESRCH";
}

function isOwnProcessGroup(pid) {
  if (process.platform !== "linux") {
    return false;
  }

  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const endOfCommand = stat.lastIndexOf(")");
    if (endOfCommand === -1) {
      return false;
    }

    const fields = stat.slice(endOfCommand + 2).trim().split(/\s+/);
    const processGroupId = Number(fields[2]);
    return Number.isInteger(processGroupId) && processGroupId === pid;
  } catch {
    return false;
  }
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function formatControlInput(value) {
  if (value === "\u001b\r") {
    return "<ESC>";
  }

  return value.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}
