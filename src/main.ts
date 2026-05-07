import "./styles.css";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { detectLocale, getMessages } from "./i18n";
import { renderError, renderLoading, renderSnapshot, renderTransparencyProbe, setRefreshingState, updateProviderPanel } from "./renderer";
import { appendWindowDebugLog, getDetectedProviders, getProviderUsage, loadAppConfig, saveAppConfig, loadWindowState, saveWindowState, setTraySeverity } from "./tauri";
import type { AppConfig, AppMetadata, ProviderUsage, UsageSnapshot } from "./types";

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

const appMetadata: AppMetadata = {
  author: __APP_AUTHOR__,
  version: __APP_VERSION__,
  build: __APP_BUILD__
};

let appConfig: AppConfig = {
  refresh_interval_min: 2,
  view_mode: "consumed",
  transparency_percent: 66,
  provider_visibility: {},
  sound_alerts: {
    enabled: false,
    thresholds: [75, 90]
  }
};

let text = getMessages(detectLocale());
let latestSnapshot: UsageSnapshot | null = loadCachedSnapshot();
let resizeFrame = 0;
let zoomLevel = 1.0;
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
let zoomPendingSync = 1.0;

const sessionBaselines = new Map<string, { primary: number; weekly?: number }>();
const soundAlertState = new Set<string>();
let audioContext: AudioContext | null = null;

const MIN_WINDOW_WIDTH = 224;
const MIN_WINDOW_HEIGHT = 132;
const MAX_WINDOW_WIDTH = 1200;
const MAX_WINDOW_HEIGHT = 1600;

function isProviderVisible(provider: string, visibility: Record<string, boolean> | undefined): boolean {
  return visibility?.[provider] !== false;
}

function normalizeProviderVisibility(
  visibility: Record<string, boolean> | undefined,
  providers: string[]
): Record<string, boolean> {
  const normalized = { ...(visibility ?? {}) };
  providers.forEach((provider) => {
    if (normalized[provider] === undefined) {
      normalized[provider] = true;
    }
  });
  return normalized;
}

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
  appRoot.classList.add(`platform--${detectPlatform()}`);

  try {
    appConfig = await loadAppConfig();
    appConfig = normalizeAppConfig(appConfig);
    if (appConfig.locale) {
      text = getMessages(appConfig.locale);
    }
  } catch (error) {
    console.error("Unable to load app config", error);
  }

  if (latestSnapshot) {
    renderSnapshot(appRoot, latestSnapshot, text, appMetadata, refreshNow, onConfigSave, appConfig, false);
    updateTraySeverity(latestSnapshot);
  } else {
    renderLoading(appRoot, text, appMetadata, appConfig);
  }

  await restoreWindowState();
  setupZoomListeners();
  applyZoomStyle();
  applyTransparencyStyle();
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

async function onConfigSave(newConfig: AppConfig): Promise<void> {
  const visibleProviders = latestSnapshot?.providers.map((provider) => provider.provider) ?? [];
  appConfig = {
    ...newConfig,
    sound_alerts: {
      enabled: newConfig.sound_alerts?.enabled === true,
      thresholds: normalizeSoundThresholds(newConfig.sound_alerts?.thresholds)
    },
    provider_visibility: normalizeProviderVisibility(newConfig.provider_visibility, visibleProviders)
  };
  if (appConfig.locale) {
    text = getMessages(appConfig.locale);
  }
  
  try {
    await saveAppConfig(appConfig);
    applyTransparencyStyle();
    if (latestSnapshot) {
      renderSnapshot(appRoot, latestSnapshot, text, appMetadata, refreshNow, onConfigSave, appConfig, false);
      updateTraySeverity(latestSnapshot);
    }
    void refreshAllProviders(); 
  } catch (error) {
    console.error("Unable to save app config", error);
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

  const minWidth = minWindowWidth();
  const minHeight = minWindowHeight();

  const currentSize = await getCurrentLogicalInnerSize();
  const targetWidth = resolveTargetWidth(minWidth, currentSize.width * zoomPendingSync);
  const targetHeight = resolveTargetHeight(minHeight, currentSize.height * zoomPendingSync);
  zoomPendingSync = 1.0;
  
  const minSizeKey = `${minWidth}x${minHeight}`;
  
  await logWindowDebug("syncWindowLayout:measure", {
    minWidth,
    minHeight,
    currentWidth: currentSize.width,
    currentHeight: currentSize.height,
    targetWidth,
    targetHeight,
    zoomLevel
  });

  try {
    if (lastAppliedMinSize !== minSizeKey) {
      await currentWindow.setMinSize(new LogicalSize(minWidth, minHeight));
      lastAppliedMinSize = minSizeKey;
    }
  } catch (error) {
    console.error("Unable to set widget minimum size", error);
  }

  const shouldResizeWidth = Math.abs(targetWidth - currentSize.width) > 1;
  const shouldResizeHeight = Math.abs(currentSize.height - targetHeight) > 1;

  if (!shouldResizeWidth && !shouldResizeHeight) {
    hasCompletedInitialLayout = true;
    return;
  }

  const nextWidth = shouldResizeWidth ? targetWidth : currentSize.width;
  const nextHeight = shouldResizeHeight ? targetHeight : currentSize.height;
  const sizeKey = `${nextWidth}x${nextHeight}`;

  try {
    if (lastAppliedSize !== sizeKey) {
      beginSuppressWindowStatePersistence();
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
  return Math.min(MAX_WINDOW_WIDTH * zoomLevel, Math.max(minWindowWidth(), value));
}

function clampHeight(value: number): number {
  return Math.min(MAX_WINDOW_HEIGHT * zoomLevel, Math.max(minWindowHeight(), value));
}

function minWindowWidth(): number {
  return (visualMode === "linux-fallback" ? 480 : MIN_WINDOW_WIDTH) * zoomLevel;
}

function minWindowHeight(): number {
  return MIN_WINDOW_HEIGHT * zoomLevel;
}

function detectVisualMode(): "transparent" | "linux-fallback" {
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes("linux") ? "linux-fallback" : "transparent";
}

function detectPlatform(): "macos" | "windows" | "linux" | "unknown" {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("mac os") || userAgent.includes("macintosh")) {
    return "macos";
  }
  if (userAgent.includes("windows")) {
    return "windows";
  }
  if (userAgent.includes("linux")) {
    return "linux";
  }
  return "unknown";
}

function setupZoomListeners(): void {
  window.addEventListener("keydown", (event) => {
    const isModKey = visualMode === "transparent" ? event.metaKey : event.ctrlKey;
    if (!isModKey) {
      return;
    }

    if (event.key === "=" || event.key === "+") {
      event.preventDefault();
      changeZoom(0.1);
    } else if (event.key === "-") {
      event.preventDefault();
      changeZoom(-0.1);
    } else if (event.key === "0") {
      event.preventDefault();
      resetZoom();
    }
  });

  window.addEventListener("wheel", (event) => {
    const isModKey = visualMode === "transparent" ? event.metaKey : event.ctrlKey;
    if (isModKey) {
      event.preventDefault();
      changeZoom(event.deltaY < 0 ? 0.1 : -0.1);
    }
  }, { passive: false });
}

function changeZoom(delta: number): void {
  const nextZoom = Math.round((zoomLevel + delta) * 10) / 10;
  if (nextZoom >= 0.5 && nextZoom <= 2.0) {
    zoomPendingSync = nextZoom / zoomLevel;
    zoomLevel = nextZoom;
    applyZoomStyle();
    queueWindowSync();
    queueWindowStatePersist();
  }
}

function resetZoom(): void {
  if (zoomLevel !== 1.0) {
    zoomPendingSync = 1.0 / zoomLevel;
    zoomLevel = 1.0;
    applyZoomStyle();
    queueWindowSync();
    queueWindowStatePersist();
  }
}

function applyZoomStyle(): void {
  document.documentElement.style.setProperty("--widget-zoom", zoomLevel.toString());
}

function applyTransparencyStyle(): void {
  document.documentElement.style.setProperty("--widget-bg-alpha", (normalizeTransparencyPercent(appConfig.transparency_percent) / 100).toString());
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

function normalizeAppConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    transparency_percent: normalizeTransparencyPercent(config.transparency_percent),
    sound_alerts: {
      enabled: config.sound_alerts?.enabled === true,
      thresholds: normalizeSoundThresholds(config.sound_alerts?.thresholds)
    },
    provider_visibility: config.provider_visibility ?? {}
  };
}

function normalizeTransparencyPercent(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 66;
  }
  return Math.min(90, Math.max(20, Math.round(value)));
}

function normalizeSoundThresholds(thresholds: number[] | undefined): number[] {
  const normalized = (thresholds?.length ? thresholds : [75, 90])
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.round(value))
    .filter((value) => value > 0 && value <= 100);
  return Array.from(new Set(normalized)).sort((a, b) => a - b);
}

function updateTraySeverity(snapshot: UsageSnapshot): void {
  const severity = resolveTraySeverity(snapshot);
  void setTraySeverity(severity).catch((error) => {
    console.error("Unable to update tray severity", error);
  });
}

function resolveTraySeverity(snapshot: UsageSnapshot): string {
  let maxUsed: number | null = null;

  snapshot.providers.forEach((provider) => {
    if (!isProviderVisible(provider.provider, appConfig.provider_visibility) || !provider.usage || provider.stale) {
      return;
    }

    const values = [
      100 - provider.usage.primary.percent_left,
      provider.usage.weekly ? 100 - provider.usage.weekly.percent_left : null
    ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    values.forEach((value) => {
      maxUsed = maxUsed === null ? value : Math.max(maxUsed, value);
    });
  });

  if (maxUsed === null) {
    return "neutral";
  }

  if (maxUsed >= 90) {
    return "red";
  }
  if (maxUsed >= 75) {
    return "orange";
  }
  if (maxUsed >= 45) {
    return "yellow";
  }
  return "green";
}

function maybePlayUsageAlerts(providerName: string, previousProvider: ProviderUsage | undefined, nextProvider: ProviderUsage): void {
  if (appConfig.sound_alerts?.enabled !== true || !nextProvider.usage || nextProvider.stale) {
    return;
  }

  if (!isProviderVisible(providerName, appConfig.provider_visibility)) {
    return;
  }

  const thresholds = normalizeSoundThresholds(appConfig.sound_alerts.thresholds);
  const limits: Array<{ limit: string; previous: number | null; current: number }> = [
    {
      limit: "primary",
      previous: previousProvider?.usage ? 100 - previousProvider.usage.primary.percent_left : null,
      current: 100 - nextProvider.usage.primary.percent_left
    }
  ];

  if (nextProvider.usage.weekly) {
    limits.push({
      limit: "weekly",
      previous: previousProvider?.usage?.weekly ? 100 - previousProvider.usage.weekly.percent_left : null,
      current: 100 - nextProvider.usage.weekly.percent_left
    });
  }

  limits.forEach(({ limit, previous, current }) => {
    thresholds.forEach((threshold) => {
      const key = `${providerName}:${limit}:${threshold}`;
      if (current < threshold) {
        soundAlertState.delete(key);
        return;
      }

      const crossedUpward = previous !== null && previous < threshold && current >= threshold;
      if (crossedUpward && !soundAlertState.has(key)) {
        soundAlertState.add(key);
        void playThresholdSound(threshold).catch((error) => {
          console.error("Unable to play threshold sound", error);
        });
      } else if (previous === null) {
        soundAlertState.add(key);
      }
    });
  });
}

async function playThresholdSound(threshold: number): Promise<void> {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    await context.resume();
  }

  const highSeverity = threshold >= 90;
  playChime(context, context.currentTime, highSeverity ? 740 : 620, highSeverity ? 0.08 : 0.06);
  if (highSeverity) {
    playChime(context, context.currentTime + 0.16, 880, 0.07);
  }
}

function getAudioContext(): AudioContext | null {
  if (audioContext) {
    return audioContext;
  }

  const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }

  audioContext = new AudioContextCtor();
  return audioContext;
}

function playChime(context: AudioContext, start: number, frequency: number, volume: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + 0.45);
}

async function refreshAllProviders(): Promise<void> {
  if (refreshInFlight) {
    return;
  }

  refreshInFlight = true;
  stopRefreshTimer();

  try {
    const detectedProviders = await getDetectedProviders();
    appConfig = {
      ...appConfig,
      provider_visibility: normalizeProviderVisibility(appConfig.provider_visibility, detectedProviders)
    };

    if (detectedProviders.length === 0) {
      latestSnapshot = {
        providers: [],
        refresh_interval_sec: appConfig.refresh_interval_min * 60,
        updated_at: new Date().toISOString()
      };
      renderSnapshot(appRoot, latestSnapshot, text, appMetadata, refreshNow, onConfigSave, appConfig, false);
      updateTraySeverity(latestSnapshot);
      queueWindowSync();
      scheduleNextRefresh(appConfig.refresh_interval_min * 60);
      return;
    }

    const previousSnapshot = latestSnapshot;
    const previousByProvider = new Map((previousSnapshot?.providers ?? []).map((provider) => [provider.provider, provider]));
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
      refresh_interval_sec: appConfig.refresh_interval_min * 60,
      updated_at: new Date().toISOString()
    };

    renderSnapshot(appRoot, latestSnapshot, text, appMetadata, refreshNow, onConfigSave, appConfig, true, previousSnapshot);
    updateTraySeverity(latestSnapshot);
    queueWindowSync();

    const updateProviderResult = (providerName: string, nextProvider: ProviderUsage): void => {
      if (!latestSnapshot) {
        return;
      }

      const previousProvider = latestSnapshot.providers.find((provider) => provider.provider === providerName);
      maybePlayUsageAlerts(providerName, previousProvider, nextProvider);

      // Gestionar baseline de la sesion
      if (nextProvider.usage && !nextProvider.stale) {
        const currentPrimaryUsed = 100 - nextProvider.usage.primary.percent_left;
        const currentWeeklyUsed = nextProvider.usage.weekly ? (100 - nextProvider.usage.weekly.percent_left) : undefined;
        
        const baseline = sessionBaselines.get(providerName);
        if (!baseline) {
          // Primera lectura valida de la sesion: establecer baseline
          sessionBaselines.set(providerName, {
            primary: currentPrimaryUsed,
            weekly: currentWeeklyUsed
          });
        } else {
          // Si el uso ha bajado drasticamente (reinicio de cuota), actualizamos baseline
          if (currentPrimaryUsed < baseline.primary) {
            baseline.primary = currentPrimaryUsed;
          }
          if (currentWeeklyUsed !== undefined && baseline.weekly !== undefined && currentWeeklyUsed < baseline.weekly) {
            baseline.weekly = currentWeeklyUsed;
          }
        }
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
      updateTraySeverity(latestSnapshot);
      const stillRefreshing = hasPendingRefreshingProviders(latestSnapshot.providers);
      
      // Preparar el snapshot previo virtual basado en el baseline para el calculo del delta
      const baseline = sessionBaselines.get(providerName);
      const virtualPrevious: ProviderUsage | undefined = baseline && nextProvider.usage ? {
        ...nextProvider,
        usage: {
          ...nextProvider.usage,
          primary: { ...nextProvider.usage.primary, percent_left: 100 - baseline.primary },
          weekly: nextProvider.usage.weekly && baseline.weekly !== undefined ? { 
            ...nextProvider.usage.weekly, 
            percent_left: 100 - baseline.weekly 
          } : nextProvider.usage.weekly
        }
      } : undefined;

      updateProviderPanel(
        appRoot,
        nextProvider,
        text,
        latestSnapshot.updated_at,
        stillRefreshing,
        appConfig.view_mode,
        isProviderVisible(nextProvider.provider, appConfig.provider_visibility),
        virtualPrevious
      );
      setRefreshingState(appRoot, text, stillRefreshing);
      queueWindowSync();
    };

    await Promise.allSettled(detectedProviders.map(async (providerName) => {
      const previous = previousByProvider.get(providerName);
      
      if (!isProviderVisible(providerName, appConfig.provider_visibility)) {
        updateProviderResult(providerName, {
          ...(previous || {
            provider: providerName,
            available: false,
            refreshing: false,
            usage: null,
            status: text.usingCachedData
          }),
          refreshing: false
        });
        return;
      }

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

    scheduleNextRefresh(appConfig.refresh_interval_min * 60);
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
      renderSnapshot(appRoot, staleSnapshot, text, appMetadata, refreshNow, onConfigSave, appConfig, false);
      updateTraySeverity(staleSnapshot);
      queueWindowSync();
    } else {
      renderError(appRoot, message || text.unableToRefresh, text, appMetadata, appConfig);
      queueWindowSync();
    }
    scheduleNextRefresh(appConfig.refresh_interval_min * 60);
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

  return Math.min(3600, Math.max(30, value));
}

function hasPendingRefreshingProviders(providers: ProviderUsage[]): boolean {
  return providers.some((provider) => provider.refreshing);
}

type StoredWindowState = {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom?: number;
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
    if (typeof state.zoom === "number" && state.zoom >= 0.5 && state.zoom <= 2.0) {
      zoomLevel = state.zoom;
    }
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
    const scaleFactor = zoomLevel / (restoredWindowState.zoom ?? 1.0);
    return Math.max(measuredWidth, clampWidth(restoredWindowState.width * scaleFactor));
  }

  return Math.max(measuredWidth, clampWidth(currentWidth));
}

function resolveTargetHeight(measuredHeight: number, currentHeight: number): number {
  if (!hasCompletedInitialLayout && restoredWindowState) {
    const scaleFactor = zoomLevel / (restoredWindowState.zoom ?? 1.0);
    return Math.max(measuredHeight, clampHeight(restoredWindowState.height * scaleFactor));
  }

  return Math.max(measuredHeight, clampHeight(currentHeight));
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
      height: size.height / scaleFactor,
      zoom: zoomLevel
    };
    await saveWindowState(state);
    restoredWindowState = state;
    lastAppliedSize = `${state.width}x${state.height}`;
  } catch (error) {
    console.error("Unable to persist window state", error);
  }
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
}

function endSuppressWindowStatePersistenceSoon(): void {
  window.setTimeout(() => {
    suppressWindowStatePersistence = Math.max(0, suppressWindowStatePersistence - 1);
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
