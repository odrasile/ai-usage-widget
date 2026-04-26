import "./styles.css";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { detectLocale, getMessages } from "./i18n";
import { renderError, renderLoading, renderSnapshot, renderTransparencyProbe, setRefreshingState, updateProviderPanel } from "./renderer";
import { appendWindowDebugLog, getDetectedProviders, getProviderUsage, getRefreshInterval, loadWindowState, saveWindowState } from "./tauri";
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
let restoredWindowState: StoredWindowState | null = null;
let hasCompletedInitialLayout = false;
let suppressWindowStatePersistence = 0;
let debugSequence = 0;

if (transparencyProbe) {
  renderTransparencyProbe(appRoot, transparencyProbe);
  queueWindowSync();
  void ensureTransparentWindow();
} else {
  void startApp();
}

async function startApp(): Promise<void> {
  await logWindowDebug("start", { visualMode });
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

  const footer = shell.querySelector<HTMLElement>(".widget__footer");
  const body = shell.querySelector<HTMLElement>(".widget__body");
  const header = shell.querySelector<HTMLElement>(".widget__header");
  const shellStyle = window.getComputedStyle(shell);
  const verticalPadding = Number.parseFloat(shellStyle.paddingTop) + Number.parseFloat(shellStyle.paddingBottom);
  const horizontalPadding = Number.parseFloat(shellStyle.paddingLeft) + Number.parseFloat(shellStyle.paddingRight);
  const border = 2;
  const measuredWidth = clampWidth(measureRequiredWidth(shell) + horizontalPadding + border);
  const contentHeight = Math.ceil(
    (header?.scrollHeight ?? 0) +
    (body?.scrollHeight ?? 0) +
    (footer?.scrollHeight ?? 0) +
    verticalPadding +
    border
  );
  const measuredHeight = clampHeight(contentHeight);
  const currentSize = await getCurrentLogicalInnerSize();
  const targetWidth = resolveTargetWidth(measuredWidth, currentSize.width);
  const targetHeight = resolveTargetHeight(measuredHeight, currentSize.height);
  const minSizeKey = `${measuredWidth}x${measuredHeight}`;
  await logWindowDebug("syncWindowLayout:measure", {
    measuredWidth,
    contentHeight,
    measuredHeight,
    currentWidth: currentSize.width,
    currentHeight: currentSize.height,
    targetWidth,
    targetHeight,
    restoredWidth: restoredWindowState?.width ?? null,
    restoredHeight: restoredWindowState?.height ?? null,
    restoredX: restoredWindowState?.x ?? null,
    restoredY: restoredWindowState?.y ?? null
  });

  try {
    if (lastAppliedMinSize !== minSizeKey) {
      await currentWindow.setMinSize(new LogicalSize(measuredWidth, measuredHeight));
      lastAppliedMinSize = minSizeKey;
    }
  } catch (error) {
    console.error("Unable to set widget minimum size", error);
  }

  const shouldResizeWidth = targetWidth - currentSize.width > 1;
  const shouldResizeHeight = Math.abs(currentSize.height - targetHeight) > 1;

  if (!shouldResizeWidth && !shouldResizeHeight) {
    hasCompletedInitialLayout = true;
    await logWindowDebug("syncWindowLayout:skip-resize", {
      currentWidth: currentSize.width,
      currentHeight: currentSize.height,
      targetWidth,
      targetHeight
    });
    return;
  }

  const nextWidth = shouldResizeWidth ? targetWidth : currentSize.width;
  const nextHeight = shouldResizeHeight ? targetHeight : currentSize.height;
  const sizeKey = `${nextWidth}x${nextHeight}`;

  try {
    if (lastAppliedSize !== sizeKey) {
      beginSuppressWindowStatePersistence();
      await logWindowDebug("syncWindowLayout:set-size", {
        nextWidth,
        nextHeight,
        currentWidth: currentSize.width,
        previousWidth: currentSize.width,
        previousHeight: currentSize.height
      });
      await currentWindow.setSize(new LogicalSize(nextWidth, nextHeight));
      lastAppliedSize = sizeKey;
    }
  } catch (error) {
    console.error("Unable to resize widget window", error);
  } finally {
    endSuppressWindowStatePersistenceSoon();
    hasCompletedInitialLayout = true;
  }
}

function clampWidth(value: number): number {
  return Math.min(760, Math.max(baseMinWidth(), value));
}

function clampHeight(value: number): number {
  return Math.min(560, Math.max(132, value));
}

function baseMinWidth(): number {
  return visualMode === "linux-fallback" ? 540 : 470;
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
    latestSnapshot = {
      providers: detectedProviders.map((providerName) => {
        const previous = previousByProvider.get(providerName);
        if (previous) {
          return {
            ...previous,
            stale: false,
            refreshing: true
          };
        }

        return {
          provider: providerName,
          available: false,
          refreshing: true,
          usage: null,
          status: text.refreshingProviders
        } satisfies ProviderUsage;
      }),
      refresh_interval_sec: refreshIntervalSec,
      updated_at: new Date().toISOString()
    };

    renderSnapshot(appRoot, latestSnapshot, text, appMetadata, refreshNow, true);
    queueWindowSync();

    const updateProviderResult = (providerName: string, nextProvider: ProviderUsage): void => {
      if (!latestSnapshot) {
        return;
      }

      latestSnapshot = {
        ...latestSnapshot,
        updated_at: new Date().toISOString(),
        providers: latestSnapshot.providers.map((provider) => {
          if (provider.provider !== providerName) {
            return provider;
          }

          return nextProvider;
        })
      };

      persistSnapshot(latestSnapshot);
      const stillRefreshing = hasPendingRefreshingProviders(latestSnapshot.providers);
      updateProviderPanel(appRoot, nextProvider, text, latestSnapshot.updated_at, stillRefreshing);
      setRefreshingState(appRoot, text, stillRefreshing);
      queueWindowSync();
    };

    await Promise.allSettled(detectedProviders.map(async (providerName) => {
      const previous = previousByProvider.get(providerName);
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

      const merged = mergeProviderWithPrevious(providerResult, previous, text.usingCachedData);
      updateProviderResult(providerName, {
        ...merged,
        refreshing: false
      });
    }));

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
  await logWindowDebug("restoreWindowState:loaded", { state });
  if (!state) {
    return;
  }

  try {
    beginSuppressWindowStatePersistence();
    await logWindowDebug("restoreWindowState:apply", state);
    await currentWindow.setSize(new LogicalSize(state.width, state.height));
    await currentWindow.setPosition(new LogicalPosition(state.x, state.y));
    restoredWindowState = state;
    lastAppliedSize = `${state.width}x${state.height}`;
  } catch (error) {
    console.error("Unable to restore saved window state", error);
  } finally {
    endSuppressWindowStatePersistenceSoon();
  }
}

function resolveTargetWidth(measuredWidth: number, currentWidth: number): number {
  if (!hasCompletedInitialLayout && restoredWindowState) {
    return Math.max(measuredWidth, clampWidth(restoredWindowState.width));
  }

  return Math.max(measuredWidth, currentWidth);
}

function resolveTargetHeight(measuredHeight: number, currentHeight: number): number {
  if (!hasCompletedInitialLayout && restoredWindowState) {
    return Math.max(measuredHeight, clampHeight(restoredWindowState.height));
  }

  return Math.max(measuredHeight, currentHeight);
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
  if (suppressWindowStatePersistence > 0) {
    void logWindowDebug("queueWindowStatePersist:suppressed", { suppressWindowStatePersistence });
    return;
  }

  if (persistWindowStateTimer) {
    window.clearTimeout(persistWindowStateTimer);
  }

  persistWindowStateTimer = window.setTimeout(() => {
    void persistWindowStateFromWindow();
  }, 180);
}

async function persistWindowStateFromWindow(): Promise<void> {
  if (suppressWindowStatePersistence > 0) {
    await logWindowDebug("persistWindowState:skip-suppressed", { suppressWindowStatePersistence });
    return;
  }

  try {
    const scaleFactor = await currentWindow.scaleFactor();
    const position = await currentWindow.outerPosition();
    const size = await currentWindow.innerSize();
    const state = {
      x: position.x / scaleFactor,
      y: position.y / scaleFactor,
      width: size.width / scaleFactor,
      height: size.height / scaleFactor
    };
    await logWindowDebug("persistWindowState:save", {
      scaleFactor,
      outerX: position.x,
      outerY: position.y,
      innerWidth: size.width,
      innerHeight: size.height,
      state
    });
    await saveWindowState(state);
    restoredWindowState = state;
    lastAppliedSize = `${state.width}x${state.height}`;
  } catch (error) {
    console.error("Unable to persist window state", error);
    await logWindowDebug("persistWindowState:error", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function measureRequiredWidth(shell: HTMLElement): number {
  const candidates = [
    shell.querySelector<HTMLElement>(".widget__header"),
    shell.querySelector<HTMLElement>(".widget__footer"),
    shell.querySelector<HTMLElement>(".widget__body"),
    ...Array.from(shell.querySelectorAll<HTMLElement>(".provider__top, .limit-row__meta, .provider__warning"))
  ].filter(Boolean) as HTMLElement[];

  const measured = candidates.map((element) => Math.ceil(element.scrollWidth));
  return Math.max(baseMinWidth(), ...measured);
}

async function getCurrentLogicalInnerSize(): Promise<{ width: number; height: number }> {
  const scaleFactor = await currentWindow.scaleFactor();
  const size = await currentWindow.innerSize();
  return {
    width: size.width / scaleFactor,
    height: size.height / scaleFactor
  };
}

function beginSuppressWindowStatePersistence(): void {
  suppressWindowStatePersistence += 1;
  void logWindowDebug("suppress:begin", { suppressWindowStatePersistence });
}

function endSuppressWindowStatePersistenceSoon(): void {
  window.setTimeout(() => {
    suppressWindowStatePersistence = Math.max(0, suppressWindowStatePersistence - 1);
    void logWindowDebug("suppress:end", { suppressWindowStatePersistence });
  }, 250);
}

async function logWindowDebug(event: string, payload: Record<string, unknown>): Promise<void> {
  const timestamp = new Date().toISOString();
  debugSequence += 1;
  try {
    await appendWindowDebugLog(`${timestamp} #${debugSequence} ${event} ${JSON.stringify(payload)}`);
  } catch {
    // Ignore debug logging failures.
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
