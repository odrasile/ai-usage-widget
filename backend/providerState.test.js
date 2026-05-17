import assert from "node:assert/strict";
import test from "node:test";
import { classifyCliFailure } from "./cliFailure.js";
import { readyProvider, stateFromFailureKind, unavailableProvider } from "./providerState.js";

test("maps login failures to auth_required provider state", () => {
  const failure = classifyCliFailure("gemini", "Not authenticated. Please sign in with /auth.");
  const result = unavailableProvider("gemini", stateFromFailureKind(failure.kind), {
    status: failure.status
  });

  assert.equal(result.state, "auth_required");
  assert.equal(result.message_key, "provider.auth_required");
  assert.equal(result.action, "login");
  assert.equal(result.status, "Gemini CLI detected; login required");
});

test("builds setup_required provider state", () => {
  const result = unavailableProvider("claude", "setup_required");

  assert.equal(result.provider, "claude");
  assert.equal(result.available, false);
  assert.equal(result.usage, null);
  assert.equal(result.state, "setup_required");
  assert.equal(result.action, "setup");
  assert.equal(result.status, "Claude Code CLI detected; setup required");
});

test("maps subscription failures to subscription_required provider state", () => {
  const failure = classifyCliFailure("claude", "/usage is only available for subscription plans");
  const result = unavailableProvider("claude", stateFromFailureKind(failure.kind), {
    status: failure.status
  });

  assert.equal(result.state, "subscription_required");
  assert.equal(result.action, "upgrade_plan");
  assert.equal(result.status, "Claude Code CLI detected; subscription plan required");
});

test("builds ready provider state", () => {
  const result = readyProvider("claude", {
    primary: {
      percent_left: 85,
      reset: "4:30pm"
    }
  });

  assert.equal(result.available, true);
  assert.equal(result.state, "ready");
  assert.equal(result.action, "none");
  assert.equal(result.usage.primary.percent_left, 85);
});

test("treats gemini visible quota as login-equivalent ready state", () => {
  const result = readyProvider("gemini", {
    primary: {
      percent_left: 100,
      reset: "N/A"
    },
    status: "Gemini Code Assist for individuals"
  });

  assert.equal(result.provider, "gemini");
  assert.equal(result.available, true);
  assert.equal(result.state, "ready");
  assert.equal(result.action, "none");
  assert.equal(result.usage.primary.percent_left, 100);
});

test("builds exhausted provider state from zero percent left", () => {
  const result = readyProvider("gemini", {
    primary: {
      percent_left: 0,
      reset: "unknown"
    }
  });

  assert.equal(result.available, true);
  assert.equal(result.state, "exhausted");
  assert.equal(result.status, "Gemini quota exhausted");
});
