import "./styles.css";
import { detectLocale, getMessages } from "./i18n";
import { renderError, renderLoading, renderSnapshot } from "./renderer";
import { Scheduler } from "./scheduler";
import { getUsageSnapshot } from "./tauri";
import type { UsageSnapshot } from "./types";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("App root not found");
}

const text = getMessages(detectLocale());
let latestSnapshot: UsageSnapshot | null = null;

renderLoading(root, text);

const scheduler = new Scheduler(
  getUsageSnapshot,
  (snapshot) => {
    latestSnapshot = snapshot;
    renderSnapshot(root, snapshot, text);
  },
  (message) => renderError(root, message || text.unableToRefresh, text),
  () => {
    if (latestSnapshot) {
      renderSnapshot(root, latestSnapshot, text, true);
    } else {
      renderLoading(root, text);
    }
  }
);

scheduler.start();

window.addEventListener("beforeunload", () => scheduler.stop());
