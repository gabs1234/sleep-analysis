import { ExperimentConfig } from "@/types/experiment";
import { StudyState } from "@/types/study";
import { WearableProviderConfig } from "@/types/wearable";
import { DEFAULT_STUDY_CONFIG } from "@/lib/config/study-config";
import { initializeStudyState } from "@/lib/engine/protocol-engine";

const STORAGE_KEYS = {
  CONFIG: "sleep_study_config_v1",
  STATE: "sleep_study_state_v1",
  WEARABLE: "sleep_study_wearable_v1",
} as const;

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadStoredStudyConfig(): ExperimentConfig {
  if (!isBrowser()) return DEFAULT_STUDY_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONFIG);
    if (!raw) return DEFAULT_STUDY_CONFIG;
    return JSON.parse(raw) as ExperimentConfig;
  } catch (e) {
    console.error("Failed to load stored study config:", e);
    return DEFAULT_STUDY_CONFIG;
  }
}

export function saveStoredStudyConfig(config: ExperimentConfig): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
  } catch (e) {
    console.error("Failed to save study config:", e);
  }
}

export function loadStoredStudyState(config: ExperimentConfig): StudyState {
  if (!isBrowser()) return initializeStudyState(config);
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STATE);
    if (!raw) return initializeStudyState(config);
    const parsed = JSON.parse(raw) as StudyState;
    if (parsed.study_id !== config.study_id) {
      // If config changed, initialize state for the new config
      return initializeStudyState(config);
    }
    return parsed;
  } catch (e) {
    console.error("Failed to load study state:", e);
    return initializeStudyState(config);
  }
}

export function saveStoredStudyState(state: StudyState): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save study state:", e);
  }
}

export const DEFAULT_WEARABLE_CONFIG: WearableProviderConfig = {
  provider_type: "mock",
  auto_sync: true,
};

export function loadWearableConfig(): WearableProviderConfig {
  if (!isBrowser()) return DEFAULT_WEARABLE_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.WEARABLE);
    if (!raw) return DEFAULT_WEARABLE_CONFIG;
    return JSON.parse(raw) as WearableProviderConfig;
  } catch (e) {
    console.error("Failed to load wearable config:", e);
    return DEFAULT_WEARABLE_CONFIG;
  }
}

export function saveWearableConfig(config: WearableProviderConfig): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEYS.WEARABLE, JSON.stringify(config));
  } catch (e) {
    console.error("Failed to save wearable config:", e);
  }
}

export function clearAllStudyData(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_KEYS.CONFIG);
  localStorage.removeItem(STORAGE_KEYS.STATE);
  localStorage.removeItem(STORAGE_KEYS.WEARABLE);
}
