import type { AppMetadata, ProviderUsage, UsageSnapshot } from "./types";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Messages } from "./i18n";

type ResizeDirection = "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West";

const providerLabels: Record<string, string> = {
  codex: "Codex",
  claude: "Claude Code",
  gemini: "Gemini"
};

export function renderSnapshot(root: HTMLElement, snapshot: UsageSnapshot, text: Messages, appMetadata: AppMetadata, onRefresh: () => void, isRefreshing = false): void {
  root.innerHTML = "";

  const shell = createShell(text, appMetadata, onRefresh, isRefreshing);
  const body = createBody(isRefreshing, text);

  if (snapshot.providers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty state-message";
    empty.innerHTML = `
      <span class="state-icon" aria-hidden="true"></span>
      <span>${escapeHtml(text.noProviders)}</span>
    `;
    body.appendChild(empty);
  } else {
    const list = document.createElement("div");
    list.className = "provider-list";
    snapshot.providers.forEach((provider) => list.appendChild(renderProvider(provider, text)));
    body.appendChild(list);
  }

  shell.appendChild(body);
  appendFooter(shell, isRefreshing ? text.refreshing : `${text.updated} ${formatTime(snapshot.updated_at)}`, isRefreshing);
  root.appendChild(shell);
}

export function setRefreshingState(root: HTMLElement, text: Messages, isRefreshing: boolean): void {
  const shell = root.querySelector<HTMLElement>(".widget");
  if (!shell) {
    return;
  }

  shell.classList.toggle("widget--refreshing", isRefreshing);

  const refreshButton = shell.querySelector<HTMLButtonElement>(".window-refresh");
  if (refreshButton) {
    refreshButton.classList.toggle("window-refresh--active", isRefreshing);
    refreshButton.disabled = isRefreshing;
    refreshButton.setAttribute("aria-label", isRefreshing ? text.refreshing : text.refresh);
    refreshButton.setAttribute("title", isRefreshing ? text.refreshing : text.refresh);
  }

  const body = shell.querySelector<HTMLElement>(".widget__body");
  if (body) {
    body.classList.toggle("widget__body--refreshing", isRefreshing);
  }

  const footer = shell.querySelector<HTMLElement>(".widget__footer");
  if (footer) {
    footer.classList.toggle("widget__footer--refreshing", isRefreshing);
    const fallbackLabel = footer.dataset.updatedLabel ?? footer.textContent ?? "";
    footer.textContent = isRefreshing ? text.refreshing : fallbackLabel;
  }
}

export function renderLoading(root: HTMLElement, text: Messages, appMetadata: AppMetadata): void {
  root.innerHTML = "";
  const shell = createShell(text, appMetadata, () => {}, true);
  const body = createBody(false, text);
  const loading = document.createElement("div");
  loading.className = "empty state-message";
  loading.innerHTML = `
    <span class="state-icon state-icon--spin" aria-hidden="true"></span>
    <span>${escapeHtml(text.detecting)}</span>
  `;
  body.appendChild(loading);
  shell.appendChild(body);
  root.appendChild(shell);
}

export function renderError(root: HTMLElement, message: string, text: Messages, appMetadata: AppMetadata): void {
  root.innerHTML = "";
  const shell = createShell(text, appMetadata, () => {}, false);
  const body = createBody(false, text);
  const error = document.createElement("p");
  error.className = "empty";
  error.textContent = message;
  body.appendChild(error);
  shell.appendChild(body);
  root.appendChild(shell);
}

export function renderTransparencyProbe(root: HTMLElement, mode: string): void {
  root.innerHTML = "";

  if (mode === "clear") {
    const probe = document.createElement("section");
    probe.className = "probe probe--clear";
    probe.innerHTML = `<div class="probe__label">clear</div>`;
    root.appendChild(probe);
    return;
  }

  if (mode === "solid") {
    const probe = document.createElement("section");
    probe.className = "probe probe--solid";
    probe.innerHTML = `<div class="probe__panel"><strong>solid</strong><span>Opaque control</span></div>`;
    root.appendChild(probe);
    return;
  }

  const probe = document.createElement("section");
  probe.className = "probe probe--panel";
  probe.innerHTML = `<div class="probe__panel"><strong>panel</strong><span>Translucent panel</span></div>`;
  root.appendChild(probe);
}

function createShell(text: Messages, appMetadata: AppMetadata, onRefresh: () => void, isRefreshing: boolean): HTMLElement {
  const shell = document.createElement("section");
  shell.className = `widget${isRefreshing ? " widget--refreshing" : ""}`;

  const header = document.createElement("header");
  header.className = "widget__header";
  header.setAttribute("data-tauri-drag-region", "");
  header.innerHTML = `
    <span class="widget__title" data-tauri-drag-region="">${escapeHtml(text.appTitle)}</span>
    <div class="window-actions">
      <div class="window-info-wrap">
        <button class="window-info" type="button" aria-label="${escapeHtml(text.about)}" title="${escapeHtml(text.about)}" aria-expanded="false">i</button>
        <div class="window-info-popover" hidden>
          <div class="window-info-popover__title">${escapeHtml(text.about)}</div>
          <div class="window-info-popover__row"><span>${escapeHtml(text.author)}</span><strong>${escapeHtml(appMetadata.author)}</strong></div>
          <div class="window-info-popover__row"><span>${escapeHtml(text.version)}</span><strong>${escapeHtml(appMetadata.version)}</strong></div>
          <div class="window-info-popover__row"><span>${escapeHtml(text.build)}</span><strong>${escapeHtml(appMetadata.build)}</strong></div>
        </div>
      </div>
      <button class="window-refresh${isRefreshing ? " window-refresh--active" : ""}" type="button" aria-label="${escapeHtml(isRefreshing ? text.refreshing : text.refresh)}" title="${escapeHtml(isRefreshing ? text.refreshing : text.refresh)}"${isRefreshing ? " disabled" : ""}><span class=\"window-refresh__glyph\" aria-hidden=\"true\">&#8635;</span></button>
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
  const infoButton = header.querySelector<HTMLButtonElement>(".window-info");
  const infoPopover = header.querySelector<HTMLElement>(".window-info-popover");
  if (infoButton && infoPopover) {
    const closeInfo = () => {
      infoPopover.hidden = true;
      infoButton.setAttribute("aria-expanded", "false");
    };
    infoButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = infoPopover.hidden;
      infoPopover.hidden = !willOpen;
      infoButton.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
    shell.addEventListener("click", (event) => {
      if (!(event.target as HTMLElement).closest(".window-info-wrap")) {
        closeInfo();
      }
    });
  }

  const resizeHandle = document.createElement("button");
  resizeHandle.className = "widget__resize";
  resizeHandle.type = "button";
  resizeHandle.setAttribute("aria-label", text.resize);
  resizeHandle.setAttribute("title", text.resize);
  resizeHandle.innerHTML = "<span></span>";
  resizeHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    void startResize("SouthEast");
  });
  shell.appendChild(resizeHandle);

  return shell;
}

function appendFooter(shell: HTMLElement, value: string, isRefreshing = false): void {
  const footer = document.createElement("footer");
  footer.className = `widget__footer${isRefreshing ? " widget__footer--refreshing" : ""}`;
  footer.dataset.updatedLabel = value;
  footer.textContent = value;
  shell.appendChild(footer);
}

function createBody(isRefreshing: boolean, text: Messages): HTMLElement {
  const body = document.createElement("div");
  body.className = `widget__body${isRefreshing ? " widget__body--refreshing" : ""}`;

  return body;
}

function renderProvider(provider: ProviderUsage, text: Messages): HTMLElement {
  const item = document.createElement("article");
  item.className = `provider${provider.stale ? " provider--stale" : ""}${provider.refreshing ? " provider--refreshing" : ""}`;

  if (!provider.usage) {
    const status = provider.status ?? text.unavailable;
    const isGemini = provider.provider === "gemini";
    const label5h = isGemini ? "24h" : text.limit5h;
    
    item.innerHTML = `
      <div class="provider__top">
        <strong>${providerLabels[provider.provider] ?? provider.provider}</strong>
        <span>--</span>
      </div>
      <div class="limit-row">
        <div class="limit-row__meta">
          <span class="limit-row__label">${escapeHtml(label5h)}</span>
          <span class="limit-row__reset">${escapeHtml(status)}</span>
        </div>
        <div class="meter meter--empty" aria-label="Usage unavailable">
          <span style="width: 0%"></span>
        </div>
      </div>
    `;
    return item;
  }

  const isGemini = provider.provider === "gemini";
  const label5h = isGemini ? "24h" : text.limit5h;
  const resetValue = isGemini ? "23:59" : provider.usage.primary.reset;

  const primary = renderLimitRow(label5h, provider.usage.primary.percent_left, resetValue, text, provider.stale || provider.refreshing);
  const weekly = provider.usage.weekly
    ? renderLimitRow(text.weekly, provider.usage.weekly.percent_left, provider.usage.weekly.reset, text, provider.stale || provider.refreshing)
    : "";
  const warning = provider.stale && provider.status
    ? `<div class="provider__warning" title="${escapeHtml(provider.status)}"><span class="provider__warning-icon">!</span><span>${escapeHtml(provider.status)}</span></div>`
    : "";

  item.innerHTML = `
    <div class="provider__top">
      <strong>${providerLabels[provider.provider] ?? provider.provider}</strong>${provider.stale ? '<span class="provider__badge" aria-hidden="true">!</span>' : ""}
    </div>
    ${primary}
    ${weekly}
    ${warning}
  `;

  return item;
}

function renderLimitRow(label: string, rawPercent: number, reset: string, text: Messages, stale = false): string {
  const percent = clampPercent(rawPercent);
  const color = stale ? "rgb(126, 132, 144)" : usageColor(percent);
  const localizedReset = formatResetText(reset, text.locale);

  return `
    <div class="limit-row">
      <div class="limit-row__meta">
        <span class="limit-row__label">${escapeHtml(label)}</span>
        <span class="limit-row__reset">${escapeHtml(text.reset)} ${escapeHtml(localizedReset)}</span>
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

async function startResize(direction: ResizeDirection): Promise<void> {
  try {
    await getCurrentWindow().startResizeDragging(direction);
  } catch (error) {
    console.error("Unable to start resize drag", error);
  }
}

function formatResetText(value: string, locale: "en" | "es"): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  return formatWithZone(normalized, locale)
    ?? formatTimeAndMonthDay(normalized, locale)
    ?? formatTimeOnly(normalized, locale)
    ?? normalized;
}

function formatWithZone(value: string, locale: "en" | "es"): string | null {
  const match = value.match(/^([A-Za-z]{3})\s*(\d{1,2}),?\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s*(?:\(([^)]+)\))?$/i)
    ?? value.match(/^(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s*(?:\(([^)]+)\))?$/i);

  if (!match) {
    return null;
  }

  if (match.length === 6) {
    const [, month, day, time, meridiem] = match;
    const formattedDate = formatMonthDay(month, Number(day), locale);
    const normalizedTime = time.includes(":") ? time : `${time}:00`;
    const formattedTime = formatClock(normalizedTime, meridiem ?? null, locale);
    return formattedTime && formattedDate ? `${formattedTime}, ${formattedDate}` : value;
  }

  const [, time, meridiem] = match;
  const normalizedTime = time.includes(":") ? time : `${time}:00`;
  const formattedTime = formatClock(normalizedTime, meridiem ?? null, locale);
  return formattedTime ?? value;
}

function formatTimeAndMonthDay(value: string, locale: "en" | "es"): string | null {
  const match = value.match(/^(\d{1,2}:\d{2})\s+(?:on|on\s+|,)\s*(\d{1,2})\s+([A-Za-z]{3})$/i)
    ?? value.match(/^(\d{1,2}:\d{2})\s+(?:on|on\s+|,)\s*([A-Za-z]{3})\s+(\d{1,2})$/i);

  if (!match) {
    return null;
  }

  const [, time, part2, part3] = match;
  const formattedTime = formatClock(time, null, locale);
  
  let formattedDate: string | null = null;
  if (Number.isFinite(Number(part2))) {
    formattedDate = formatMonthDay(part3, Number(part2), locale);
  } else {
    formattedDate = formatMonthDay(part2, Number(part3), locale);
  }

  return formattedTime && formattedDate ? `${formattedTime}, ${formattedDate}` : value;
}

function formatTimeOnly(value: string, locale: "en" | "es"): string | null {
  const match = value.match(/^(\d{1,2}:\d{2})$/);
  if (!match) {
    return null;
  }

  return formatClock(match[1], null, locale);
}

function formatClock(time: string, meridiem: string | null, locale: "en" | "es"): string | null {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  if (meridiem) {
    const lower = meridiem.toLowerCase();
    if (lower === "pm" && hours < 12) {
      hours += 12;
    } else if (lower === "am" && hours === 12) {
      hours = 0;
    }
  }

  const date = new Date(Date.UTC(2026, 0, 1, hours, minutes));
  return new Intl.DateTimeFormat(localeForIntl(locale), {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(date);
}

function formatMonthDay(month: string, day: number, locale: "en" | "es"): string | null {
  const monthIndex = monthToIndex(month);
  if (monthIndex === null || !Number.isFinite(day)) {
    return null;
  }

  const date = new Date(Date.UTC(2026, monthIndex, day));
  return new Intl.DateTimeFormat(localeForIntl(locale), {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function monthToIndex(month: string): number | null {
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const index = months.indexOf(month.toLowerCase());
  return index === -1 ? null : index;
}

function localeForIntl(locale: "en" | "es"): string {
  return locale === "es" ? "es-ES" : "en-US";
}
