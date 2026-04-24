import "./styles.css";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { detectLocale, getMessages } from "./i18n";
import { renderError, renderLoading, renderSnapshot, renderTransparencyProbe } from "./renderer";
import { Scheduler } from "./scheduler";
import { getUsageSnapshot } from "./tauri";
import type { ProviderUsage, UsageSnapshot } from "./types";

const transparencyProbe = ((import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env?.VITE_TRANSPARENCY_PROBE ?? "");
const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("App root not found");
}

const appRoot = root;

const text = getMessages(detectLocale());
let latestSnapshot: UsageSnapshot | null = null;
let resizeFrame = 0;
let scheduler: Scheduler | null = null;
const visualMode = detectVisualMode();

if (transparencyProbe) {
  renderTransparencyProbe(appRoot, transparencyProbe);
  queueWindowSync();
  void ensureTransparentWindow();
} else {
  appRoot.classList.add(`visual-mode--${visualMode}`);
  renderLoading(appRoot, text);
  queueWindowSync();
  void applyWindowVisualMode();

  scheduler = new Scheduler(
    getUsageSnapshot,
    (snapshot) => {
      const mergedSnapshot = mergeSnapshotWithPrevious(snapshot, latestSnapshot);
      latestSnapshot = mergedSnapshot;
      renderSnapshot(appRoot, mergedSnapshot, text, refreshNow);
      queueWindowSync();
    },
    (message) => {
      renderError(appRoot, message || text.unableToRefresh, text);
      queueWindowSync();
    },
    () => {
      if (latestSnapshot) {
        renderSnapshot(appRoot, latestSnapshot, text, refreshNow, true);
      } else {
        renderLoading(appRoot, text);
      }

      queueWindowSync();
    }
  );

  scheduler.start();
  window.addEventListener("beforeunload", () => scheduler?.stop());
}

function refreshNow(): void {
  scheduler?.refresh();
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
    await getCurrentWindow().setBackgroundColor({
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
      await getCurrentWindow().setBackgroundColor({
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
  const currentSize = await getCurrentWindow().innerSize();

  try {
    await getCurrentWindow().setMinSize(new LogicalSize(targetWidth, targetHeight));
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

  try {
    await getCurrentWindow().setSize(new LogicalSize(nextWidth, nextHeight));
  } catch (error) {
    console.error("Unable to resize widget window", error);
  }
}

function getHorizontalPadding(element: HTMLElement): number {
  const style = window.getComputedStyle(element);
  return Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
}

function getVerticalPadding(element: HTMLElement): number {
  const style = window.getComputedStyle(element);
  return Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
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
  return Math.ceil(value + 42);
}

function detectVisualMode(): "transparent" | "linux-fallback" {
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes("linux") ? "linux-fallback" : "transparent";
}

function mergeSnapshotWithPrevious(snapshot: UsageSnapshot, previous: UsageSnapshot | null): UsageSnapshot {
  if (!previous) {
    return snapshot;
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
