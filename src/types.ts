import type { Locale } from "./i18n";

export type ProviderName = string;

export type AppMetadata = {
  author: string;
  version: string;
  build: string;
};

export type ProviderUsage = {
  provider: ProviderName;
  available: boolean;
  status?: string;
  stale?: boolean;
  refreshing?: boolean;
  usage: {
    primary: {
      percent_left: number;
      reset: string;
    };
    weekly?: {
      percent_left: number;
      reset: string;
    };
  } | null;
};

export type ViewMode = "consumed" | "free";

export type AppConfig = {
  refresh_interval_min: number;
  view_mode: ViewMode;
  locale?: Locale;
  provider_visibility: Record<string, boolean>;
};

export type UsageSnapshot = {
  providers: ProviderUsage[];
  refresh_interval_sec: number; // Keep for backward compatibility or internal scheduling
  updated_at: string;
};
