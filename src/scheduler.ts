import type { UsageSnapshot } from "./types";

type SnapshotLoader = () => Promise<UsageSnapshot>;
type SnapshotHandler = (snapshot: UsageSnapshot) => void;
type ErrorHandler = (message: string) => void;
type RefreshHandler = () => void | Promise<void>;

const MIN_INTERVAL_MS = 30_000;
const MAX_INTERVAL_MS = 60_000;

export class Scheduler {
  private timer: number | undefined;
  private running = false;

  constructor(
    private readonly load: SnapshotLoader,
    private readonly onSnapshot: SnapshotHandler,
    private readonly onError: ErrorHandler,
    private readonly onRefreshStart: RefreshHandler
  ) {}

  start(): void {
    void this.tick();
  }

  stop(): void {
    if (this.timer !== undefined) {
      window.clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  refresh(): void {
    if (this.timer !== undefined) {
      window.clearTimeout(this.timer);
      this.timer = undefined;
    }

    void this.tick();
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    await this.onRefreshStart();
    let nextDelay = 45_000;

    try {
      const snapshot = await this.load();
      this.onSnapshot(snapshot);
      nextDelay = clampInterval(snapshot.refresh_interval_sec * 1000);
    } catch (error) {
      this.onError(error instanceof Error ? error.message : "Unable to refresh usage");
    } finally {
      this.running = false;
      this.timer = window.setTimeout(() => void this.tick(), nextDelay);
    }
  }
}

function clampInterval(value: number): number {
  if (!Number.isFinite(value)) {
    return 45_000;
  }

  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, value));
}
