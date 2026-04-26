import assert from "node:assert/strict";
import test from "node:test";
import { classifyCliFailure } from "./cliFailure.js";

test("classifies codex update requirement", () => {
  const failure = classifyCliFailure("codex", "Your Codex CLI is out of date. Please update to continue.");
  assert.equal(failure.kind, "update_required");
  assert.equal(failure.status, "Codex CLI detected; update required");
});

test("classifies claude update requirement", () => {
  const failure = classifyCliFailure("claude", "Please upgrade Claude Code. Minimum supported version is 1.2.3.");
  assert.equal(failure.kind, "update_required");
  assert.equal(failure.status, "Claude Code CLI detected; update required");
});

test("classifies gemini update requirement", () => {
  const failure = classifyCliFailure("gemini", "Unsupported client version. Update required.");
  assert.equal(failure.kind, "update_required");
  assert.equal(failure.status, "Gemini CLI detected; update required");
});

test("classifies login requirement", () => {
  const failure = classifyCliFailure("codex", "Authentication required. Please log in.");
  assert.equal(failure.kind, "auth_required");
  assert.equal(failure.status, "Codex CLI detected; login required");
});
