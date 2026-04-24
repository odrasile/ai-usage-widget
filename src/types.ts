export type ProviderName = string;

export type ProviderUsage = {
  provider: ProviderName;
  available: boolean;
  status?: string;
  stale?: boolean;
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

export type UsageSnapshot = {
  providers: ProviderUsage[];
  refresh_interval_sec: number;
  updated_at: string;
};
