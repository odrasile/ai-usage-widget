import type { ProviderUsage, UsageSnapshot } from "./types";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Messages } from "./i18n";

const providerLabels: Record<string, string> = {
  codex: "Codex",
  claude: "Claude Code"
};

export function renderSnapshot(root: HTMLElement, snapshot: UsageSnapshot, text: Messages, onRefresh: () => void, isRefreshing = false): void {
  root.innerHTML = "";

  const shell = createShell(text, onRefresh, isRefreshing);

  if (snapshot.providers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty state-message";
    empty.innerHTML = `
      <span class="state-icon" aria-hidden="true"></span>
      <span>${escapeHtml(text.noProviders)}</span>
    `;
    shell.appendChild(empty);
  } else {
    const list = document.createElement("div");
    list.className = "provider-list";
    snapshot.providers.forEach((provider) => list.appendChild(renderProvider(provider, text)));
    shell.appendChild(list);
  }

  appendFooter(shell, `${text.updated} ${formatTime(snapshot.updated_at)}`);
  root.appendChild(shell);
}

export function renderLoading(root: HTMLElement, text: Messages): void {
  root.innerHTML = "";
  const shell = createShell(text, () => {}, true);
  const loading = document.createElement("div");
  loading.className = "empty state-message";
  loading.innerHTML = `
    <span class="state-icon state-icon--spin" aria-hidden="true"></span>
    <span>${escapeHtml(text.detecting)}</span>
  `;
  shell.appendChild(loading);
  root.appendChild(shell);
}

export function renderError(root: HTMLElement, message: string, text: Messages): void {
  root.innerHTML = "";
  const shell = createShell(text, () => {}, false);
  const error = document.createElement("p");
  error.className = "empty";
  error.textContent = message;
  shell.appendChild(error);
  root.appendChild(shell);
}

function createShell(text: Messages, onRefresh: () => void, isRefreshing: boolean): HTMLElement {
  const shell = document.createElement("section");
  shell.className = "widget";

  const header = document.createElement("header");
  header.className = "widget__header";
  header.setAttribute("data-tauri-drag-region", "");
  header.innerHTML = `
    <span data-tauri-drag-region="">${escapeHtml(text.appTitle)}</span>
    <div class="window-actions">
      <span class="refresh-indicator${isRefreshing ? " refresh-indicator--active" : ""}" title="${escapeHtml(text.detecting)}" aria-hidden="true"></span>
      <button class="window-info" type="button" aria-label="${escapeHtml(text.about)}" title="${escapeHtml(text.developedBy)}">i</button>
      <button class="window-refresh" type="button" aria-label="${escapeHtml(text.refresh)}" title="${escapeHtml(text.refresh)}">&#8635;</button>
      <button class="window-hide" type="button" aria-label="${escapeHtml(text.hideToTray)}">_</button>
      <button class="window-close" type="button" aria-label="${escapeHtml(text.close)}">x</button>
    </div>
  `;
  shell.appendChild(header);
  header.addEventListener("pointerdown", (event) => {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }

    void getCurrentWindow().startDragging();
  });
  header.querySelector(".window-close")?.addEventListener("click", () => {
    void getCurrentWindow().close();
  });
  header.querySelector(".window-hide")?.addEventListener("click", () => {
    void getCurrentWindow().hide();
  });
  header.querySelector(".window-refresh")?.addEventListener("click", () => {
    onRefresh();
  });
  return shell;
}

function appendFooter(shell: HTMLElement, value: string): void {
  const footer = document.createElement("footer");
  footer.className = "widget__footer";
  footer.textContent = value;
  shell.appendChild(footer);
}

function renderProvider(provider: ProviderUsage, text: Messages): HTMLElement {
  const item = document.createElement("article");
  item.className = "provider";

  if (!provider.available || !provider.usage) {
    const status = provider.status ?? text.unavailable;
    item.innerHTML = `
      <div class="provider__top">
        <strong>${providerLabels[provider.provider] ?? provider.provider}</strong>
        <span>--</span>
      </div>
      <div class="meter meter--empty" aria-label="Usage unavailable">
        <span style="width: 0%"></span>
      </div>
      <div class="provider__reset">${escapeHtml(status)}</div>
    `;
    return item;
  }

  const primary = renderLimitRow(text.limit5h, provider.usage.primary.percent_left, provider.usage.primary.reset, text);
  const weekly = provider.usage.weekly
    ? renderLimitRow(text.weekly, provider.usage.weekly.percent_left, provider.usage.weekly.reset, text)
    : "";

  item.innerHTML = `
    <div class="provider__top">
      <strong>${providerLabels[provider.provider] ?? provider.provider}</strong>
    </div>
    ${primary}
    ${weekly}
  `;

  return item;
}

function renderLimitRow(label: string, rawPercent: number, reset: string, text: Messages): string {
  const percent = clampPercent(rawPercent);
  const color = usageColor(percent);

  return `
    <div class="limit-row">
      <div class="limit-row__meta">
        <span class="limit-row__label">${escapeHtml(label)}</span>
        <span class="limit-row__reset">${escapeHtml(text.reset)} ${escapeHtml(reset)}</span>
        <strong style="color: ${color}">${Math.round(percent)}%</strong>
      </div>
      <div class="meter" aria-label="${Math.round(percent)} percent remaining">
        <span style="width: ${percent}%; background: ${color}"></span>
      </div>
    </div>
  `;
}

function usageColor(percent: number): string {
  if (percent <= 25) {
    return interpolateColor("#df3f3f", "#f2a33a", percent / 25);
  }

  if (percent <= 55) {
    return interpolateColor("#f2a33a", "#e5d85c", (percent - 25) / 30);
  }

  return interpolateColor("#e5d85c", "#4fc978", (percent - 55) / 45);
}

function interpolateColor(from: string, to: string, amount: number): string {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const ratio = Math.min(1, Math.max(0, amount));

  const rgb = start.map((channel, index) => {
    return Math.round(channel + (end[index] - channel) * ratio);
  });

  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function hexToRgb(value: string): [number, number, number] {
  const normalized = value.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ];
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return map[char];
  });
}
