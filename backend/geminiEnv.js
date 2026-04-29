import { augmentPath } from "./platform.js";

const GEMINI_KEYRING_BYPASS_VALUE = "1";

export function getGeminiEnv(baseEnv = process.env) {
  return augmentPath({
    ...baseEnv,
    GEMINI_API_KEY: baseEnv.GEMINI_API_KEY || GEMINI_KEYRING_BYPASS_VALUE
  });
}
