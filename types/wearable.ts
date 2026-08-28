export interface SleepStagesBreakdown {
  deep_minutes?: number;
  rem_minutes?: number;
  light_minutes?: number;
  wake_minutes?: number;
}

export interface ExerciseSessionLog {
  id: string;
  activity_type: string;
  start_time: string; // ISO
  end_time: string; // ISO
  duration_minutes: number;
  calories_burned?: number;
  avg_hr?: number;
}

export type WearableSyncStatus = "synced" | "pending" | "failed" | "simulated" | "disconnected";

export interface WearableSleepData {
  provider: "mock" | "google_health" | "fitbit" | "manual";
  synced_at: string; // ISO string
  sleep_onset?: string; // ISO timestamp
  final_awakening?: string; // ISO timestamp
  duration_minutes?: number;
  time_in_bed_minutes?: number;
  awake_minutes?: number;
  waso_minutes?: number;
  awakenings_count?: number;
  sleep_efficiency_pct?: number;
  resting_hr?: number;
  avg_hr?: number;
  hrv_rmssd?: number; // ms
  respiratory_rate?: number; // brpm
  spo2_avg?: number; // %
  skin_temperature_celsius_delta?: number;
  stages?: SleepStagesBreakdown;
  steps?: number;
  active_minutes?: number;
  exercise_sessions?: ExerciseSessionLog[];
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
