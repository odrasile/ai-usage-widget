import assert from "node:assert/strict";
import test from "node:test";
import { getGeminiEnv } from "./geminiPty.js";

test("sets gemini keyring bypass when api key is not configured", () => {
  const env = getGeminiEnv({ PATH: "/usr/bin" });

  assert.equal(env.GEMINI_API_KEY, "1");
});

test("preserves user configured gemini api key", () => {
  const env = getGeminiEnv({ PATH: "/usr/bin", GEMINI_API_KEY: "real-key" });

  assert.equal(env.GEMINI_API_KEY, "real-key");
});
