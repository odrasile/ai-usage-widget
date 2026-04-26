import "./styles.css";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { detectLocale, getMessages } from "./i18n";
import { renderError, renderLoading, renderSnapshot, renderTransparencyProbe, setRefreshingState } from "./renderer";
import { getDetectedProviders, getProviderUsage, getRefreshInterval, loadWindowState, saveWindowState } from "./tauri";
import type { AppMetadata, ProviderUsage, UsageSnapshot } from "./types";

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
const appMetadata: AppMetadata = {
  author: __APP_AUTHOR__,
  version: __APP_VERSION__,
  build: __APP_BUILD__
};
let latestSnapshot: UsageSnapshot | null = loadCachedSnapshot();
let resizeFrame = 0;
const visualMode = detectVisualMode();
let lastAppliedMinSize = "";
let lastAppliedSize = "";
let persistWindowStateTimer = 0;
let windowStatePersistenceReady = false;
let refreshTimer = 0;
let refreshInFlight = false;

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
    renderSnapshot(appRoot, latestSnapshot, text, appMetadata, refreshNow, false);
  } else {
    renderLoading(appRoot, text, appMetadata);
  }

  await restoreWindowState();
  queueWindowSync();
  setupWindowStatePersistence();
  void applyWindowVisualMode();
  void refreshAllProviders();
  window.addEventListener("beforeunload", () => {
    stopRefreshTimer();
    void persistWindowStateFromWindow();
  });
}

function refreshNow(): void {
  void refreshAllProviders();
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
    return {
      ...provider,
      refreshing: false
    };
  }

  const status = provider.status ? `${fallbackLabel}. ${provider.status}` : fallbackLabel;
  return {
    ...previousProvider,
    available: false,
    stale: true,
    refreshing: false,
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

async function refreshAllProviders(): Promise<void> {
  if (refreshInFlight) {
    return;
  }

  refreshInFlight = true;
  stopRefreshTimer();

  try {
    const refreshIntervalSec = await getRefreshInterval().catch(() => latestSnapshot?.refresh_interval_sec ?? 120);
    const detectedProviders = await getDetectedProviders();

    if (detectedProviders.length === 0) {
      latestSnapshot = {
        providers: [],
        refresh_interval_sec: refreshIntervalSec,
        updated_at: new Date().toISOString()
      };
      renderSnapshot(appRoot, latestSnapshot, text, appMetadata, refreshNow, false);
      queueWindowSync();
      scheduleNextRefresh(refreshIntervalSec);
      return;
    }

    const previousByProvider = new Map((latestSnapshot?.providers ?? []).map((provider) => [provider.provider, provider]));
    const baseProviders = detectedProviders.map((provider) => {
      const previous = previousByProvider.get(provider);
      return previous ? {
        ...previous,
        available: false,
        stale: true,
        refreshing: true,
        status: previous.status ?? text.usingCachedData
      } : {
        provider,
        available: false,
        stale: true,
        refreshing: true,
        usage: null,
        status: text.detecting
      };
    });

    latestSnapshot = {
      providers: baseProviders,
      refresh_interval_sec: refreshIntervalSec,
      updated_at: new Date().toISOString()
    };
    renderSnapshot(appRoot, latestSnapshot, text, appMetadata, refreshNow, true);
    queueWindowSync();

    await Promise.all(detectedProviders.map(async (providerName) => {
      const providerResult = await getProviderUsage(providerName).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return {
          provider: providerName,
          available: false,
          refreshing: false,
          usage: null,
          status: message || text.unableToRefresh
        } as ProviderUsage;
      });

      const previous = previousByProvider.get(providerName);
      const mergedProvider = mergeProviderWithPrevious(providerResult, previous, text.usingCachedData);

      if (!latestSnapshot) {
        return;
      }

      latestSnapshot = {
        ...latestSnapshot,
        updated_at: new Date().toISOString(),
        providers: latestSnapshot.providers.map((provider) => {
          return provider.provider === providerName ? mergedProvider : provider;
        })
      };

      persistSnapshot(latestSnapshot);
      renderSnapshot(appRoot, latestSnapshot, text, appMetadata, refreshNow, hasPendingRefreshingProviders(latestSnapshot.providers));
      queueWindowSync();
    }));

    if (latestSnapshot) {
      latestSnapshot = {
        ...latestSnapshot,
        refresh_interval_sec: refreshIntervalSec,
        updated_at: new Date().toISOString()
      };
      persistSnapshot(latestSnapshot);
      renderSnapshot(appRoot, latestSnapshot, text, appMetadata, refreshNow, false);
      queueWindowSync();
    }

    scheduleNextRefresh(refreshIntervalSec);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (latestSnapshot) {
      const staleSnapshot: UsageSnapshot = {
        ...latestSnapshot,
        providers: latestSnapshot.providers.map((provider) => ({
          ...provider,
          available: false,
          stale: true,
          refreshing: false,
          status: message || text.unableToRefresh
        }))
      };
      latestSnapshot = staleSnapshot;
      renderSnapshot(appRoot, staleSnapshot, text, appMetadata, refreshNow, false);
      queueWindowSync();
    } else {
      renderError(appRoot, message || text.unableToRefresh, text, appMetadata);
      queueWindowSync();
    }
    scheduleNextRefresh(latestSnapshot?.refresh_interval_sec ?? 120);
  } finally {
    refreshInFlight = false;
  }
}

function scheduleNextRefresh(refreshIntervalSec: number): void {
  stopRefreshTimer();
  const delayMs = clampRefreshInterval(refreshIntervalSec) * 1000;
  refreshTimer = window.setTimeout(() => {
    void refreshAllProviders();
  }, delayMs);
}

function stopRefreshTimer(): void {
  if (refreshTimer) {
    window.clearTimeout(refreshTimer);
    refreshTimer = 0;
  }
}

function clampRefreshInterval(value: number): number {
  if (!Number.isFinite(value)) {
    return 120;
  }

  return Math.min(120, Math.max(30, value));
}

function hasPendingRefreshingProviders(providers: ProviderUsage[]): boolean {
  return providers.some((provider) => provider.refreshing);
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
