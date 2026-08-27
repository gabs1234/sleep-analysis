export interface SleepStagesBreakdown {
  deep_minutes?: number;
  rem_minutes?: number;
  light_minutes?: number;
  wake_minutes?: number;
}

export type WearableSyncStatus = "synced" | "pending" | "failed" | "simulated" | "disconnected";

export interface WearableSleepData {
  provider: "mock" | "google_health" | "fitbit" | "manual";
  synced_at: string; // ISO string
  sleep_onset?: string; // ISO timestamp
  final_awakening?: string; // ISO timestamp
  duration_minutes?: number;
  awake_minutes?: number;
  sleep_efficiency_pct?: number;
  resting_hr?: number;
  avg_hr?: number;
  hrv_rmssd?: number; // ms
  respiratory_rate?: number; // brpm
  stages?: SleepStagesBreakdown;
  sync_status: WearableSyncStatus;
  raw?: Record<string, unknown>;
}

export interface WearableProviderConfig {
  provider_type: "mock" | "google_health" | "fitbit" | "manual";
  client_id?: string;
  access_token?: string;
  refresh_token?: string;
  token_expiry?: number;
  auto_sync: boolean;
  last_sync_attempt?: string;
  last_sync_success?: string;
  error_message?: string;
}

export interface WearableProviderInterface {
  readonly id: string;
  readonly name: string;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  fetchSleepData(targetDate: string): Promise<WearableSleepData | null>;
}
