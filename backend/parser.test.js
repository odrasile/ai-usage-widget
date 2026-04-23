import assert from "node:assert/strict";
import test from "node:test";
import { parseClaudeUsage, parseCodexStatus } from "./parser.js";

test("parses codex status with 5h, weekly and reset values", () => {
  const usage = parseCodexStatus("5h remaining: 64%\nWeekly remaining: 82%\nReset in 2h 10m");

  assert.equal(usage.primary.percent_left, 64);
  assert.equal(usage.primary.reset, "2h 10m");
  assert.equal(usage.weekly.percent_left, 82);
});

test("parses codex slash status terminal output", () => {
  const usage = parseCodexStatus("5h limit: [████░░] 61% left (resets 20:45)\nWeekly limit: [████░░] 81% left (resets 09:24 on 29 Apr)");

  assert.equal(usage.primary.percent_left, 61);
  assert.equal(usage.primary.reset, "20:45");
  assert.equal(usage.weekly.percent_left, 81);
  assert.equal(usage.weekly.reset, "09:24 on 29 Apr");
});

test("returns null for unexpected codex output", () => {
  assert.equal(parseCodexStatus("signed in"), null);
});

test("parses claude usage and calculates percent left", () => {
  const usage = parseClaudeUsage("Remaining requests: 30\nTotal requests: 120\nReset at 18:00");

  assert.equal(usage.primary.percent_left, 25);
  assert.equal(usage.primary.reset, "18:00");
});

test("returns null for invalid claude totals", () => {
  assert.equal(parseClaudeUsage("Remaining requests: 10\nTotal requests: 0"), null);
});
