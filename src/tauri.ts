import { invoke } from "@tauri-apps/api/core";
import type { UsageSnapshot } from "./types";

const SNAPSHOT_TIMEOUT_MS = 20_000;

export type StoredWindowState = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export async function getUsageSnapshot(): Promise<UsageSnapshot> {
  return withTimeout(invoke<UsageSnapshot>("get_usage_snapshot"), SNAPSHOT_TIMEOUT_MS);
}

export async function loadWindowState(): Promise<StoredWindowState | null> {
  return invoke<StoredWindowState | null>("load_window_state");
}

export async function saveWindowState(state: StoredWindowState): Promise<void> {
  await invoke("save_window_state", { state });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("Snapshot request timed out"));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}
