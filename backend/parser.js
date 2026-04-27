const CLAUDE_SESSION_LABEL = /(?:current\s*session|curr\w*session)/i;
const CLAUDE_WEEK_LABEL = /(?:current\s*week|curr\w*week)/i;
const CLAUDE_RESET_LABEL = /Rese(?:t?s?)?/i;
const RESET_CAPTURE = /resets?(?:\s+at|\s+in|:)?\s*([^\n\r)]+?)(?=\s+(?:5h|weekly|week)\b|[\n\r)]|$)/i;

export function parseGeminiUsage(output) {
  const quotaMatch = output.match(/(\d+(?:\.\d+)?)\s*%\s*used/i);

  if (quotaMatch) {
    const used = parseFloat(quotaMatch[1]);
    return {
      primary: {
        percent_left: Math.max(0, 100 - used),
        reset: "N/A"
      },
      status: extractGeminiTier(output) || "Gemini"
    };
  }

  if (
    /exhausted\s+your\s+capacity/i.test(output)
    || /RESOURCE_EXHAUSTED/i.test(output)
    || /\blimit\s+reached\b/i.test(output)
  ) {
    return {
      primary: {
        percent_left: 0,
        reset: "unknown"
      },
      status: "Gemini (Exhausted)"
    };
  }

  return null;
}

export function parseCodexStatus(output) {
  const fiveHourPercent = findPercent(output, [
    /5h(?:\s+limit|\s+remaining)?[^0-9]{0,100}(\d+(?:\.\d+)?)\s*%(?:\s*left)?/i,
    /5h\s+remaining[^0-9]*(\d+(?:\.\d+)?)\s*%/i
  ]);
  const weeklyPercent = findPercent(output, [
    /week(?:ly)?(?:\s+limit|\s+remaining)?[^0-9]{0,100}(\d+(?:\.\d+)?)\s*%(?:\s*left)?/i,
    /week(?:ly)?\s+remaining[^0-9]*(\d+(?:\.\d+)?)\s*%/i
  ]);
  const reset = findScopedReset(output, /5h/i);
  const weeklyReset = findScopedReset(output, /weekly|week/i);

  if (fiveHourPercent === null || reset === "unknown") {
    return null;
  }

  return {
    primary: {
      percent_left: fiveHourPercent,
      reset
    },
    weekly: weeklyPercent === null ? undefined : {
      percent_left: weeklyPercent,
      reset: weeklyReset
    }
  };
}

export function parseClaudeUsage(output) {
  const sessionUsed = findSectionPercent(output, CLAUDE_SESSION_LABEL);
  const weeklyUsed = findSectionPercent(output, CLAUDE_WEEK_LABEL);
  const remaining = findNumber(output, [/remaining(?:\s+requests)?[^0-9]*(\d+)/i, /(\d+)\s*(?:requests?\s*)?remaining/i]);
  const total = findNumber(output, [/total(?:\s+requests)?[^0-9]*(\d+)/i, /(?:of|\/)\s*(\d+)\s*requests?/i]);
  const reset = findSectionReset(output, CLAUDE_SESSION_LABEL);
  const weeklyReset = findSectionReset(output, CLAUDE_WEEK_LABEL);

  if (sessionUsed !== null) {
    return {
      primary: {
        percent_left: 100 - sessionUsed,
        reset
      },
      weekly: weeklyUsed === null ? undefined : {
        percent_left: 100 - weeklyUsed,
        reset: weeklyReset
      }
    };
  }

  if (remaining === null || total === null || total <= 0) {
    return null;
  }

  return {
    primary: {
      percent_left: Math.round((remaining / total) * 100),
      reset
    }
  };
}

function findPercent(output, patterns) {
  const value = findNumber(output, patterns);
  if (value === null) {
    return null;
  }

  return Math.min(100, Math.max(0, value));
}

function findNumber(output, patterns) {
  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) {
        return value;
      }
    }
  }

  return null;
}

function findSectionPercent(output, labelPattern) {
  const normalized = output.replace(/\r/g, " ").replace(/\u001b\[[0-9;]*m/g, "");
  const labelRegex = new RegExp(`${labelPattern.source}[^%]{0,100}?(\\d+(?:\\.\\d+)?)%\\s*(?:used|consumed)`, "i");
  const match = normalized.match(labelRegex);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.min(100, Math.max(0, value));
}

function findSectionReset(output, labelPattern) {
  const normalized = output.replace(/\r/g, " ");
  const match = normalized.match(new RegExp(`${labelPattern.source}[\\s\\S]{0,260}?${CLAUDE_RESET_LABEL.source}\\s*([^\\n\\r]+?)(?=Current\\s*(?:session|week)|Curr\\w*session|Curr\\w*week|Refreshing|Esc\\s+to\\s+cancel|$)`, "i"));
  if (!match) {
    return findReset(output);
  }

  return cleanClaudeReset(match[1]);
}

function findReset(output) {
  const resetMatch = output.match(/rese(?:t?s?)?(?:\s+at|\s+in|:)?\s*([^\n\r]+)/i);
  if (!resetMatch) {
    return "unknown";
  }

  return cleanReset(resetMatch[1]);
}

function findLineReset(output, labelPattern) {
  const line = output.split(/\r?\n/).find((candidate) => labelPattern.test(candidate));
  if (!line) {
    return findReset(output);
  }

  const resetMatch = line.match(RESET_CAPTURE);
  return resetMatch ? cleanReset(resetMatch[1]) : findReset(output);
}

function findScopedReset(output, labelPattern) {
  const normalized = output.replace(/\r/g, " ");
  const scoped = normalized.match(new RegExp(`(?:${labelPattern.source})[\\s\\S]{0,220}?${RESET_CAPTURE.source}`, "i"));
  if (scoped?.[1]) {
    return cleanReset(scoped[1]);
  }

  return findLineReset(output, labelPattern);
}

function cleanReset(value) {
  if (!value) {
    return "unknown";
  }

  return String(value)
    .replace(/^(?:at|in)\s+/i, "")
    .replace(/[)\]|\u2502]+$/g, "")
    .replace(/\s*[)\]|\u2502]+\s*$/g, "")
    .trim();
}

function cleanClaudeReset(value) {
  if (!value) {
    return "unknown";
  }

  return value
    .replace(/\s*(?:Current\s+(?:session|week)|Curr\w*(?:session|week)|Refreshing|Esc\s*to\s*cancel|Esctocancel).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractGeminiTier(output) {
  const tierMatch = output.match(/(?:Tier|Plan):\s+([^\n\r/]+)/i);
  return tierMatch ? tierMatch[1].trim() : null;
}
