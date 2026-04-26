import "./styles.css";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { detectLocale, getMessages } from "./i18n";
import { renderError, renderLoading, renderSnapshot, renderTransparencyProbe, setRefreshingState } from "./renderer";
import { Scheduler } from "./scheduler";
import { getUsageSnapshot, loadWindowState, saveWindowState } from "./tauri";
import type { ProviderUsage, UsageSnapshot } from "./types";

const SNAPSHOT_CACHE_KEY = "monitorai:last-snapshot";
const transparencyProbe = ((import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env?.VITE_TRANSPARENCY_PROBE ?? "");
const root = document.querySelector<HTMLElement>("#app");
const currentWindow = getCurrentWindow();

if (!root) {
  throw new Error("App root not found");
}

const appRoot = root;

const text = getMessages(detectLocale());
let latestSnapshot: UsageSnapshot | null = loadCachedSnapshot();
let resizeFrame = 0;
let scheduler: Scheduler | null = null;
const visualMode = detectVisualMode();
let lastAppliedMinSize = "";
let lastAppliedSize = "";
let persistWindowStateTimer = 0;
let windowStatePersistenceReady = false;

if (transparencyProbe) {
  renderTransparencyProbe(appRoot, transparencyProbe);
  queueWindowSync();
  void ensureTransparentWindow();
} else {
  void startApp();
}

async function startApp(): Promise<void> {
  appRoot.classList.add(`visual-mode--${visualMode}`);
  if (latestSnapshot) {
    renderSnapshot(appRoot, latestSnapshot, text, refreshNow, false);
  } else {
    renderLoading(appRoot, text);
  }

  await restoreWindowState();
  queueWindowSync();
  setupWindowStatePersistence();
  void applyWindowVisualMode();

  scheduler = new Scheduler(
    getUsageSnapshot,
    (snapshot) => {
      const mergedSnapshot = mergeSnapshotWithPrevious(snapshot, latestSnapshot);
      latestSnapshot = mergedSnapshot;
      persistSnapshot(latestSnapshot);
      renderSnapshot(appRoot, mergedSnapshot, text, refreshNow);
      queueWindowSync();
    },
    (message) => {
      if (latestSnapshot) {
        const staleSnapshot: UsageSnapshot = {
          ...latestSnapshot,
          providers: latestSnapshot.providers.map((provider) => ({
            ...provider,
            available: false,
            stale: true,
            status: message || text.unableToRefresh
          }))
        };
        latestSnapshot = staleSnapshot;
        renderSnapshot(appRoot, staleSnapshot, text, refreshNow, false);
      } else {
        renderError(appRoot, message || text.unableToRefresh, text);
      }
      queueWindowSync();
    },
    async () => {
      await renderRefreshingState();
    }
  );

  scheduler.start();
  window.addEventListener("beforeunload", () => {
    scheduler?.stop();
    void persistWindowStateFromWindow();
  });
}

function refreshNow(): void {
  void startManualRefresh();
}

async function startManualRefresh(): Promise<void> {
  await renderRefreshingState();
  scheduler?.refresh();
}

async function renderRefreshingState(): Promise<void> {
  if (latestSnapshot) {
    setRefreshingState(appRoot, text, true);
    await waitForPaint();
  } else {
    renderLoading(appRoot, text);
    queueWindowSync();
    await waitForPaint();
  }
}

function queueWindowSync(): void {
  if (resizeFrame) {
    window.cancelAnimationFrame(resizeFrame);
  }

  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = window.requestAnimationFrame(() => {
      void syncWindowLayout();
    });
  });
}

async function ensureTransparentWindow(): Promise<void> {
  try {
    await currentWindow.setBackgroundColor({
      red: 0,
      green: 0,
      blue: 0,
      alpha: 0
    });
  } catch (error) {
    console.error("Unable to force transparent window background", error);
  }
}

async function applyWindowVisualMode(): Promise<void> {
  if (visualMode === "linux-fallback") {
    console.info("[widget] visual mode: linux-fallback");
    try {
      await currentWindow.setBackgroundColor({
        red: 9,
        green: 12,
        blue: 18,
        alpha: 255
      });
      return;
    } catch (error) {
      console.error("Unable to apply linux fallback background", error);
    }
  }

  console.info("[widget] visual mode: transparent");
  await ensureTransparentWindow();
}

async function syncWindowLayout(): Promise<void> {
  const shell = appRoot.firstElementChild as HTMLElement | null;
  if (!shell) {
    return;
  }

  const contentWidth = Math.ceil(shell.scrollWidth + getHorizontalPadding(appRoot));
  const targetWidth = clampWidth(addWidthHeadroom(contentWidth));
  const contentHeight = Math.ceil(shell.scrollHeight + getVerticalPadding(appRoot));
  const targetHeight = clampHeight(addHeightHeadroom(contentHeight));
  const currentSize = await currentWindow.innerSize();
  const minSizeKey = `${targetWidth}x${targetHeight}`;

  try {
    if (lastAppliedMinSize !== minSizeKey) {
      await currentWindow.setMinSize(new LogicalSize(targetWidth, targetHeight));
      lastAppliedMinSize = minSizeKey;
    }
  } catch (error) {
    console.error("Unable to set widget minimum size", error);
  }

  const shouldResizeWidth = currentSize.width < targetWidth;
  const shouldResizeHeight = currentSize.height < targetHeight;

  if (!shouldResizeWidth && !shouldResizeHeight) {
    return;
  }

  const nextWidth = shouldResizeWidth ? targetWidth : currentSize.width;
  const nextHeight = shouldResizeHeight ? targetHeight : currentSize.height;
  const sizeKey = `${nextWidth}x${nextHeight}`;

  try {
    if (lastAppliedSize !== sizeKey) {
      await currentWindow.setSize(new LogicalSize(nextWidth, nextHeight));
      lastAppliedSize = sizeKey;
    }
  } catch (error) {
    console.error("Unable to resize widget window", error);
  }
}

function clampWidth(value: number): number {
  return Math.min(680, Math.max(470, value));
}

function clampHeight(value: number): number {
  return Math.min(560, Math.max(132, value));
}

function addWidthHeadroom(value: number): number {
  return Math.ceil(value * 1.1);
}

function addHeightHeadroom(value: number): number {
  return Math.ceil(value + 28);
}

function getHorizontalPadding(element: HTMLElement): number {
  const style = window.getComputedStyle(element);
  return Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
}

function getVerticalPadding(element: HTMLElement): number {
  const style = window.getComputedStyle(element);
  return Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
}

function detectVisualMode(): "transparent" | "linux-fallback" {
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes("linux") ? "linux-fallback" : "transparent";
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function mergeSnapshotWithPrevious(snapshot: UsageSnapshot, previous: UsageSnapshot | null): UsageSnapshot {
  if (!previous) {
    return snapshot;
  }

  if (snapshot.providers.length === 0 && previous.providers.length > 0) {
    return {
      ...snapshot,
      providers: previous.providers.map((provider) => ({
        ...provider,
        available: false,
        stale: true,
        status: text.usingCachedData
      }))
    };
  }

  const previousProviders = new Map(previous.providers.map((provider) => [provider.provider, provider]));

  return {
    ...snapshot,
    providers: snapshot.providers.map((provider) => {
      return mergeProviderWithPrevious(provider, previousProviders.get(provider.provider), text.usingCachedData);
    })
  };
}

function mergeProviderWithPrevious(
  provider: ProviderUsage,
  previousProvider: ProviderUsage | undefined,
  fallbackLabel: string
): ProviderUsage {
  if (provider.available || provider.usage || !previousProvider?.usage) {
    return provider;
  }

  const status = provider.status ? `${fallbackLabel}. ${provider.status}` : fallbackLabel;
  return {
    ...previousProvider,
    available: false,
    stale: true,
    status
  };
}

function persistSnapshot(snapshot: UsageSnapshot): void {
  try {
    window.localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage failures.
  }
}

type StoredWindowState = {
  x: number;
  y: number;
  width: number;
  height: number;
};

async function restoreWindowState(): Promise<void> {
  const state = await loadWindowState();
  if (!state) {
    return;
  }

  try {
    await currentWindow.setSize(new LogicalSize(state.width, state.height));
    await currentWindow.setPosition(new LogicalPosition(state.x, state.y));
    lastAppliedSize = `${state.width}x${state.height}`;
  } catch (error) {
    console.error("Unable to restore saved window state", error);
  }
}

function setupWindowStatePersistence(): void {
  if (windowStatePersistenceReady) {
    return;
  }

  windowStatePersistenceReady = true;
  void currentWindow.onMoved(() => queueWindowStatePersist());
  void currentWindow.onResized(() => queueWindowStatePersist());
}

function queueWindowStatePersist(): void {
  if (persistWindowStateTimer) {
    window.clearTimeout(persistWindowStateTimer);
  }

  persistWindowStateTimer = window.setTimeout(() => {
    void persistWindowStateFromWindow();
  }, 180);
}

async function persistWindowStateFromWindow(): Promise<void> {
  try {
    const position = await currentWindow.outerPosition();
    const size = await currentWindow.outerSize();
    await saveWindowState({
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height
    });
  } catch (error) {
    console.error("Unable to persist window state", error);
  }
}

function loadCachedSnapshot(): UsageSnapshot | null {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const snapshot = JSON.parse(raw) as UsageSnapshot;
    return Array.isArray(snapshot.providers) ? snapshot : null;
  } catch {
    return null;
  }
}
