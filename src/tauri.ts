import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, ProviderUsage, UsageSnapshot } from "./types";

const SNAPSHOT_TIMEOUT_MS = 45_000;

export type StoredWindowState = {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom?: number;
};

export async function getUsageSnapshot(): Promise<UsageSnapshot> {
  return withTimeout(invoke<UsageSnapshot>("get_usage_snapshot"), SNAPSHOT_TIMEOUT_MS);
}

export async function getDetectedProviders(): Promise<string[]> {
  return withTimeout(invoke<string[]>("get_detected_providers"), SNAPSHOT_TIMEOUT_MS);
}

export async function getProviderUsage(provider: string): Promise<ProviderUsage> {
  return withTimeout(invoke<ProviderUsage>("get_provider_usage", { provider }), SNAPSHOT_TIMEOUT_MS);
}

export async function getRefreshInterval(): Promise<number> {
  return withTimeout(invoke<number>("get_refresh_interval"), SNAPSHOT_TIMEOUT_MS);
}

export async function loadWindowState(): Promise<StoredWindowState | null> {
  return invoke<StoredWindowState | null>("load_window_state");
}

export async function saveWindowState(state: StoredWindowState): Promise<void> {
  await invoke("save_window_state", { state });
}

export async function loadAppConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("load_app_config");
}

export async function saveAppConfig(config: AppConfig): Promise<void> {
  await invoke("save_app_config", { config });
}

export async function appendWindowDebugLog(message: string): Promise<void> {
  await invoke("append_window_debug_log", { message });
}

export async function quitApp(): Promise<void> {
  await invoke("quit_app");
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
