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

test("classifies claude max activation prompt as login requirement", () => {
  const failure = classifyCliFailure("claude", "Use your existing Claude Max plan with Claude Code · /login to activate");
  assert.equal(failure.kind, "auth_required");
  assert.equal(failure.status, "Claude Code CLI detected; login required");
});

test("classifies claude mcp auth prompt separately", () => {
  const failure = classifyCliFailure("claude", "1 MCP server needs auth · /mcp");
  assert.equal(failure.kind, "mcp_auth_required");
  assert.equal(failure.status, "Claude Code CLI detected; MCP auth required");
});

test("classifies claude usage subscription requirement separately", () => {
  const failure = classifyCliFailure("claude", "/usage is only available for subscription plans");
  assert.equal(failure.kind, "subscription_required");
  assert.equal(failure.status, "Claude Code CLI detected; subscription plan required");
});
