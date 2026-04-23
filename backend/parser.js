export function parseCodexStatus(output) {
  const fiveHourPercent = findPercent(output, [/5h[^0-9]*(\d+(?:\.\d+)?)\s*%/i, /(\d+(?:\.\d+)?)\s*%[^.\n]*(?:5h|five)/i]);
  const weeklyPercent = findPercent(output, [/weekly[^0-9]*(\d+(?:\.\d+)?)\s*%/i, /week[^0-9]*(\d+(?:\.\d+)?)\s*%/i]);
  const reset = findLineReset(output, /5h/i);
  const weeklyReset = findLineReset(output, /weekly|week/i);

  if (fiveHourPercent === null) {
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
  const remaining = findNumber(output, [/remaining(?:\s+requests)?[^0-9]*(\d+)/i, /(\d+)\s*(?:requests?\s*)?remaining/i]);
  const total = findNumber(output, [/total(?:\s+requests)?[^0-9]*(\d+)/i, /(?:of|\/)\s*(\d+)\s*requests?/i]);
  const reset = findReset(output);

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

function findReset(output) {
  const resetMatch = output.match(/reset(?:s|ting)?(?:\s+at|\s+in|:)?\s*([^\n\r]+)/i);
  if (!resetMatch) {
    return "unknown";
  }

  return resetMatch[1].trim();
}

function findLineReset(output, labelPattern) {
  const line = output.split(/\r?\n/).find((candidate) => labelPattern.test(candidate));
  if (!line) {
    return findReset(output);
  }

  const resetMatch = line.match(/resets?\s+([^)]+)/i);
  return resetMatch ? resetMatch[1].trim() : findReset(output);
}
