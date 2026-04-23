import { invoke } from "@tauri-apps/api/core";
import type { UsageSnapshot } from "./types";

export async function getUsageSnapshot(): Promise<UsageSnapshot> {
  return invoke<UsageSnapshot>("get_usage_snapshot");
}
