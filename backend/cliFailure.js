const UPDATE_REQUIRED_PATTERNS = [
  /update required/i,
  /please update/i,
  /please upgrade/i,
  /upgrade required/i,
  /new version .* available/i,
  /version .* is available/i,
  /out[- ]of[- ]date/i,
  /client .* out of date/i,
  /minimum supported version/i,
  /unsupported client version/i,
  /must update/i,
  /update your cli/i
];

const AUTH_REQUIRED_PATTERNS = [
  /not logged in/i,
  /login required/i,
  /please log in/i,
  /please login/i,
  /authentication required/i,
  /expired auth/i,
  /waiting for authentication/i,
  /authenticate to continue/i
];

const PROVIDER_LABELS = {
  codex: "Codex CLI",
  claude: "Claude Code CLI",
  gemini: "Gemini CLI"
};

export function classifyCliFailure(provider, message = "") {
  const normalized = String(message).replace(/\s+/g, " ").trim();
  const label = PROVIDER_LABELS[provider] ?? "CLI";

  if (!normalized) {
    return {
      kind: "unavailable",
      status: `${label} detected; usage unavailable`
    };
  }

  if (matchesAny(normalized, UPDATE_REQUIRED_PATTERNS)) {
    return {
      kind: "update_required",
      status: `${label} detected; update required`
    };
  }

  if (matchesAny(normalized, AUTH_REQUIRED_PATTERNS)) {
    return {
      kind: "auth_required",
      status: `${label} detected; login required`
    };
  }

  return {
    kind: "unavailable",
    status: `${label} detected; usage unavailable`
  };
}

function matchesAny(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}
