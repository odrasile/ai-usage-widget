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
queueHeightSync();

const scheduler = new Scheduler(
  getUsageSnapshot,
  (snapshot) => {
    latestSnapshot = snapshot;
    renderSnapshot(appRoot, snapshot, text);
    queueHeightSync();
  },
  (message) => {
    renderError(appRoot, message || text.unableToRefresh, text);
    queueHeightSync();
  },
  () => {
    if (latestSnapshot) {
      renderSnapshot(appRoot, latestSnapshot, text, true);
    } else {
      renderLoading(appRoot, text);
    }

    queueHeightSync();
  }
);

scheduler.start();

window.addEventListener("beforeunload", () => scheduler.stop());

function queueHeightSync(): void {
  if (resizeFrame) {
    window.cancelAnimationFrame(resizeFrame);
  }

  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = window.requestAnimationFrame(() => {
      void syncWindowHeight();
    });
  });
}

async function syncWindowHeight(): Promise<void> {
  const shell = appRoot.firstElementChild as HTMLElement | null;
  if (!shell) {
    return;
  }

  const targetHeight = clampHeight(Math.ceil(shell.getBoundingClientRect().height));
  const currentHeight = window.innerHeight;
  if (Math.abs(currentHeight - targetHeight) < 2) {
    return;
  }

  try {
    await getCurrentWindow().setSize(new LogicalSize(window.innerWidth, targetHeight));
  } catch (error) {
    console.error("Unable to resize widget window", error);
  }
}

function clampHeight(value: number): number {
  return Math.min(520, Math.max(96, value));
}
