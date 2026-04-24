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

test("parses claude usage when cli reports percent used", () => {
  const usage = parseClaudeUsage("Status Config Usage Stats Current session 0% used Resets 2:20pm (Europe/Madrid) Current week (all models) 25% used Resets Apr 29, 12am (Europe/Madrid)");

  assert.equal(usage.primary.percent_left, 100);
  assert.equal(usage.primary.reset, "2:20pm (Europe/Madrid)");
  assert.equal(usage.weekly.percent_left, 75);
  assert.equal(usage.weekly.reset, "Apr 29, 12am (Europe/Madrid)");
});

test("parses claude usage from cleaned tty output with merged labels", () => {
  const usage = parseClaudeUsage("Status Config Usage Stats Session Totalcost:$0.0000 Currentsession0%used Resets2:20pm(Europe/Madrid) Currentweek(allmodels)0%used ResetsApr29,12am(Europe/Madrid) Refreshing Esc to cancel");

  assert.equal(usage.primary.percent_left, 100);
  assert.equal(usage.primary.reset, "2:20pm(Europe/Madrid)");
  assert.equal(usage.weekly.percent_left, 100);
  assert.equal(usage.weekly.reset, "Apr29,12am(Europe/Madrid)");
});

test("parses claude usage from noisy ubuntu tty output", () => {
  const usage = parseClaudeUsage("Status ConfigUsageStats Session Totalcost:$0.0000 Loadingusagedata… Esctocancel Curretsession 0%used Reses2:20pm(Europe/Madrid) Currentweek(allmodels) 0%used ResetsApr29,12am(Europe/Madrid) Esctocancel");

  assert.equal(usage.primary.percent_left, 100);
  assert.equal(usage.primary.reset, "2:20pm(Europe/Madrid)");
  assert.equal(usage.weekly.percent_left, 100);
  assert.equal(usage.weekly.reset, "Apr29,12am(Europe/Madrid)");
});

test("returns null for invalid claude totals", () => {
  assert.equal(parseClaudeUsage("Remaining requests: 10\nTotal requests: 0"), null);
});
