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
  const pid = Number(child.pid);

  if (Number.isInteger(pid) && pid > 0 && process.platform !== "win32") {
    try {
      eventLog.push(`${timestamp()} KILL process-group ${pid} ${signal}`);
      process.kill(-pid, signal);
      return;
    } catch (error) {
      if (!isMissingProcessError(error)) {
        eventLog.push(`${timestamp()} KILL process-group-failed ${pid} ${signal}: ${formatError(error)}`);
      }
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

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function formatControlInput(value) {
  if (value === "\u001b\r") {
    return "<ESC>";
  }

  return value.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}
