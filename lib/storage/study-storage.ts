import { ExperimentConfig } from "../../types/experiment";
import { StudyState } from "../../types/study";
import { WearableProviderConfig } from "../../types/wearable";
import { DEFAULT_USER_PREFERENCES, UserPreferences } from "../../types/preferences";
import { DEFAULT_STUDY_CONFIG } from "../config/study-config";
import { initializeStudyState, formatDateKey, evaluateNightValidity, deriveBehavioralIntervals } from "../engine/protocol-engine";
import { deriveNutritionSummary } from "../nutrition/nutrition-service";

const STORAGE_KEYS = {
  CONFIG: "sleep_study_config_v1",
  STATE: "sleep_study_state_v1",
  WEARABLE: "sleep_study_wearable_v1",
  PREFERENCES: "sleep_study_preferences_v1",
} as const;

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function hasLegacyStoredData(): boolean {
  if (!isBrowser()) return false;
  try {
    return Object.values(STORAGE_KEYS).some((key) => localStorage.getItem(key) !== null);
  } catch (error) {
    console.warn("Could not inspect legacy local storage:", error);
    return false;
  }
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
    const parsed = migrateStoredStudyState(JSON.parse(raw) as StudyState, config);

    const existingRecords = Array.isArray(parsed.records) ? parsed.records : [];

    // Ensure all records have valid array fields
    const sanitizedRecords = existingRecords.map((r) => ({
      ...r,
      evening_actions: Array.isArray(r.evening_actions) ? r.evening_actions : [],
    }));

    return {
      data_schema_version: 2,
      study_id: config.study_id,
      status: parsed.status || "active",
      started_at: parsed.started_at || new Date().toISOString(),
      current_phase_index: parsed.current_phase_index ?? 0,
      records: sanitizedRecords,
      current_night_id: parsed.current_night_id || formatDateKey(),
      last_active_at: parsed.last_active_at || new Date().toISOString(),
    };
  } catch (e) {
    console.error("Failed to load study state:", e);
    return initializeStudyState(config);
  }
}

const MOCK_FOOD_ID_SUFFIXES = ["_bfast_1", "_coffee_1", "_lunch_1", "_caffeine_2", "_dinner_1"];

function previousDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day - 1, 12, 0, 0);
  return formatDateKey(date);
}

function hasDaySpecificData(record: StudyState["records"][number]): boolean {
  return Boolean(
    record.evening_acknowledged_at ||
    record.evening_plan?.length ||
    record.evening_actions?.length ||
    record.daily_context ||
    record.pre_sleep_state ||
    record.bloating_events?.length ||
    record.bowel_movements?.length ||
    record.raw_food_records?.length ||
    record.missing_eating_events?.length ||
    record.nutrition_fallback ||
    record.naps?.length ||
    record.caffeine_events?.length ||
    record.life_log_events?.length ||
    record.routine_sessions?.length ||
    record.migration_archive?.simulated_wearable_data ||
    record.migration_archive?.simulated_food_records?.length
  );
}

/** One-time repair for records produced before sleep nights were keyed by their evening date. */
export function migrateStoredStudyState(state: StudyState, config: ExperimentConfig): StudyState {
  if ((state.data_schema_version || 1) >= 2) return state;

  const records = state.records.map((record) => {
    if (record.wearable_data?.provider !== "mock") return { ...record };
    const simulatedFoodRecords = (record.raw_food_records || []).filter((food) =>
      MOCK_FOOD_ID_SUFFIXES.some((suffix) => food.id.endsWith(suffix))
    );
    const rawFoodRecords = (record.raw_food_records || []).filter((food) => !simulatedFoodRecords.includes(food));
    const cleaned = {
      ...record,
      wearable_data: undefined,
      raw_food_records: rawFoodRecords,
      migration_archive: {
        ...record.migration_archive,
        simulated_wearable_data: record.wearable_data,
        simulated_food_records: simulatedFoodRecords,
      },
      derived_nutrition: deriveNutritionSummary(
        rawFoodRecords,
        record.missing_eating_events,
        record.nutrition_fallback,
        record.food_log_completeness || "yes",
        record.evening_actions.find((action) => action.action_id === "lights_out")?.timestamp
      ),
      updated_at: new Date().toISOString(),
    };
    cleaned.derived_intervals = deriveBehavioralIntervals(cleaned);
    return cleaned;
  });

  for (const source of [...records].sort((a, b) => a.date.localeCompare(b.date))) {
    const morning = source.morning_assessment;
    if (!morning) continue;
    const completed = new Date(morning.completed_at);
    if (Number.isNaN(completed.getTime())) continue;
    const looksLegacy = formatDateKey(completed) === source.date && completed.getHours() >= 5 && completed.getHours() < 14;
    if (!looksLegacy) continue;

    const targetDate = previousDateKey(source.date);
    let target = records.find((record) => record.date === targetDate);
    if (!target) {
      target = {
        id: targetDate,
        date: targetDate,
        phase_id: source.phase_id,
        phase_index: source.phase_index,
        night_number_in_phase: Math.max(1, source.night_number_in_phase - 1),
        condition_key: source.condition_key,
        prescribed_instruction: source.prescribed_instruction,
        secondary_instruction: source.secondary_instruction,
        evening_actions: [],
        is_valid: false,
        created_at: morning.completed_at,
        updated_at: morning.completed_at,
      };
      records.push(target);
    }

    if (!target.morning_assessment) {
      target.morning_assessment = morning;
      const phase = config.phases.find((item) => item.id === target?.phase_id) || config.phases[target.phase_index];
      const validity = evaluateNightValidity(target, phase);
      target.is_valid = validity.isValid;
      target.exclusion_reason = validity.reason;
      target.updated_at = new Date().toISOString();
      source.morning_assessment = undefined;
      source.is_valid = false;
      source.valid_night_number_in_phase = undefined;
      source.exclusion_reason = "Morning check-in not completed";
    }
  }

  const validCounts = new Map<string, number>();
  for (const record of [...records].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!record.morning_assessment || !record.is_valid) {
      record.valid_night_number_in_phase = undefined;
      continue;
    }
    const next = (validCounts.get(record.phase_id) || 0) + 1;
    validCounts.set(record.phase_id, next);
    record.valid_night_number_in_phase = next;
  }

  return {
    ...state,
    data_schema_version: 2,
    records: records.filter((record) => record.morning_assessment || hasDaySpecificData(record)),
  };
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
  provider_type: "manual",
  auto_sync: true,
};

export function loadWearableConfig(): WearableProviderConfig {
  if (!isBrowser()) return DEFAULT_WEARABLE_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.WEARABLE);
    if (!raw) return DEFAULT_WEARABLE_CONFIG;
    const parsed = JSON.parse(raw) as WearableProviderConfig;
    // Older builds defaulted to a simulator and could silently persist synthetic
    // measurements. Existing simulator selections migrate to manual/no-sync.
    return parsed.provider_type === "mock"
      ? { ...parsed, provider_type: "manual" }
      : parsed;
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

export function loadUserPreferences(): UserPreferences {
  if (!isBrowser()) return DEFAULT_USER_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
    if (!raw) return DEFAULT_USER_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      ...DEFAULT_USER_PREFERENCES,
      ...parsed,
      theme: parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system"
        ? parsed.theme
        : DEFAULT_USER_PREFERENCES.theme,
      work_days: Array.isArray(parsed.work_days)
        ? parsed.work_days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        : DEFAULT_USER_PREFERENCES.work_days,
      routine: {
        ...DEFAULT_USER_PREFERENCES.routine,
        ...(parsed.routine || {}),
      },
    };
  } catch (e) {
    console.error("Failed to load user preferences:", e);
    return DEFAULT_USER_PREFERENCES;
  }
}

export function saveUserPreferences(preferences: UserPreferences): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(preferences));
  } catch (e) {
    console.error("Failed to save user preferences:", e);
  }
}

export function clearAllStudyData(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_KEYS.CONFIG);
  localStorage.removeItem(STORAGE_KEYS.STATE);
  localStorage.removeItem(STORAGE_KEYS.WEARABLE);
}

export function clearStoredStudyState(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_KEYS.STATE);
}
