import assert from "node:assert/strict";
import { delimiter } from "node:path";
import test from "node:test";
import { augmentPath, getLookupCommand, getShellLaunch } from "./platform.js";
import { preparePtyRuntime } from "./ptySupport.js";

test("uses a platform lookup command supported by the current OS", () => {
  const lookup = getLookupCommand();

  if (process.platform === "win32") {
    assert.equal(lookup.command, "where.exe");
  } else {
    assert.equal(lookup.command, "which");
  }
});

test("adds common macOS and Unix CLI install locations before the inherited PATH", () => {
  const env = augmentPath({ PATH: "/custom/bin" });
  const entries = env.PATH.split(delimiter);

  if (process.platform === "win32") {
    assert.equal(entries.at(-1), "/custom/bin");
    return;
  }

  assert.equal(entries.at(-1), "/custom/bin");
  assert.ok(entries.includes("/opt/homebrew/bin"));
  assert.ok(entries.includes("/usr/local/bin"));
  assert.ok(entries.includes("/opt/local/bin"));
  assert.ok(entries.some((entry) => entry.endsWith("/.volta/bin")));
  assert.ok(entries.some((entry) => entry.endsWith("/.asdf/shims")));
});

test("launches provider commands through a shell on Unix-like platforms", () => {
  const launch = getShellLaunch("codex --no-alt-screen");

  if (process.platform === "win32") {
    assert.match(launch.file, /cmd\.exe$/i);
    assert.deepEqual(launch.args.slice(0, 3), ["/d", "/s", "/c"]);
    return;
  }

  assert.ok(launch.file.endsWith("sh") || launch.file.endsWith("bash") || launch.file.endsWith("zsh"));
  assert.deepEqual(launch.args, ["-lc", "codex --no-alt-screen"]);
});

test("prepares the local PTY runtime without throwing", () => {
  assert.doesNotThrow(() => preparePtyRuntime());
});
