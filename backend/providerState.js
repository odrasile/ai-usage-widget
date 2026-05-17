const STATE_MESSAGES = {
  auth_required: "{label} detected; login required",
  exhausted: "{label} quota exhausted",
  mcp_auth_required: "{label} detected; MCP auth required",
  no_output: "{label} detected; no usage output",
  no_usage_capability: "{label} detected; usage unavailable",
  parse_error: "{label} detected; usage output not recognized",
  prompt_not_ready: "{label} detected; prompt not ready",
  ready: "{label} usage available",
  setup_required: "{label} detected; setup required",
  subscription_required: "{label} detected; subscription plan required",
  timeout: "{label} usage query timed out",
  unavailable: "{label} detected; usage unavailable",
  update_required: "{label} detected; update required"
};

const STATE_ACTIONS = {
  auth_required: "login",
  exhausted: "none",
  mcp_auth_required: "mcp_auth",
  no_output: "retry",
  no_usage_capability: "retry",
  parse_error: "retry",
  prompt_not_ready: "retry",
  ready: "none",
  setup_required: "setup",
  subscription_required: "upgrade_plan",
  timeout: "retry",
  unavailable: "retry",
  update_required: "update_cli"
};

const PROVIDER_LABELS = {
  claude: "Claude Code CLI",
  codex: "Codex CLI",
  gemini: "Gemini CLI"
};

export function providerLabel(provider) {
  return PROVIDER_LABELS[provider] ?? "CLI";
}

export function buildProviderStatus(provider, state, options = {}) {
  const label = providerLabel(provider);
  const template = STATE_MESSAGES[state] ?? STATE_MESSAGES.unavailable;
  const status = options.status ?? template.replace("{label}", label);

  return {
    state,
    message_key: `provider.${state}`,
    action: STATE_ACTIONS[state] ?? "retry",
    status,
    ...(options.detail ? { detail: options.detail } : {}),
    ...(options.logPath ? { log_path: options.logPath } : {})
  };
}

export function readyProvider(provider, usage) {
  const exhausted = usage?.primary?.percent_left === 0;
  return {
    provider,
    available: true,
    usage,
    ...buildProviderStatus(provider, exhausted ? "exhausted" : "ready", {
      status: exhausted ? `${providerLabel(provider).replace(/ CLI$/, "")} quota exhausted` : undefined
    })
  };
}

export function unavailableProvider(provider, state, options = {}) {
  return {
    provider,
    available: false,
    usage: null,
    ...buildProviderStatus(provider, state, options)
  };
}

export function stateFromFailureKind(kind) {
  if (!kind || kind === "unavailable") {
    return "unavailable";
  }

  return kind;
}
