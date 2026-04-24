import "./styles.css";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { detectLocale, getMessages } from "./i18n";
import { renderError, renderLoading, renderSnapshot } from "./renderer";
import { Scheduler } from "./scheduler";
import { getUsageSnapshot } from "./tauri";
import type { UsageSnapshot } from "./types";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("App root not found");
}

const appRoot = root;

const text = getMessages(detectLocale());
let latestSnapshot: UsageSnapshot | null = null;
let resizeFrame = 0;

renderLoading(appRoot, text);
queueWindowSync();
void ensureTransparentWindow();

const scheduler = new Scheduler(
  getUsageSnapshot,
  (snapshot) => {
    latestSnapshot = snapshot;
    renderSnapshot(appRoot, snapshot, text, refreshNow);
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

window.addEventListener("beforeunload", () => scheduler.stop());

function refreshNow(): void {
  scheduler.refresh();
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
