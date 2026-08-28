import defaultStudy from "../config/default-study.json" with { type: "json" };
import { ExperimentConfig } from "../types/experiment";
import { NightRecord } from "../types/study";
import {
  deriveNutritionSummary,
  generateMockMacroFactorFoods,
} from "../lib/nutrition/nutrition-service";
import { deriveBehavioralIntervals } from "../lib/engine/protocol-engine";
import {
  generateStudyCSV,
  generateRawFoodRecordsCSV,
  generateRawGISymptomsCSV,
  generateStudyJSON,
  importStudyJSON,
} from "../lib/storage/data-export";

const config = defaultStudy as unknown as ExperimentConfig;

console.log("==================================================");
console.log("  TESTING NUTRITION, GI SYMPTOMS & FALLBACK LOGIC ");
console.log("==================================================\n");

const dateKey = "2026-08-29";
const mockFoods = generateMockMacroFactorFoods(dateKey);
const lightsOutTime = "2026-08-29T23:30:00.000Z";

// -------------------------------------------------------------
// 1. Test "Yes" (Complete Log)
// -------------------------------------------------------------
console.log("[Test 1] Fallback Scenario 'Yes' (Authoritative Complete Log)...");
const summaryYes = deriveNutritionSummary(
  mockFoods,
  [],
  undefined,
  "yes",
  lightsOutTime
);

console.log("  'Yes' Summary:", {
  kcal: summaryYes.total_calories,
  events: summaryYes.eating_events_count,
  provenance: summaryYes.data_provenance_summary,
  meal_to_lights_out: summaryYes.meal_to_lights_out_minutes,
});

console.assert(summaryYes.completeness === "yes", "Completeness is yes");
console.assert(summaryYes.total_calories === 1870, "Total calories matches sum of 5 items");
console.assert(Boolean(summaryYes.data_provenance_summary?.includes("5 macrofactor")), "Provenance notes 5 macrofactor records");
console.assert(summaryYes.meal_to_lights_out_minutes === 345, "Meal to lights out = 345 mins (from 19:45)");
console.log("  ✓ 'Yes' case uses MacroFactor as authoritative with zero extra questions.\n");

// -------------------------------------------------------------
// 2. Test "Mostly" (Keep imported + supplement missing meal)
// -------------------------------------------------------------
console.log("[Test 2] Fallback Scenario 'Mostly' (Imported + Missing Eating Event)...");
const missingLateSnack = {
  id: "missing_1",
  timestamp: "2026-08-29T22:00:00.000Z",
  meal_size: "small" as const,
  categories: ["dairy" as const, "sugary_food" as const],
  rough_calories: 250,
  source: "manual_approximate" as const,
};

const summaryMostly = deriveNutritionSummary(
  mockFoods,
  [missingLateSnack],
  undefined,
  "mostly",
  lightsOutTime
);

console.log("  'Mostly' Summary:", {
  kcal: summaryMostly.total_calories,
  events: summaryMostly.eating_events_count,
  final_caloric_timestamp: summaryMostly.final_caloric_timestamp,
  meal_to_lights_out: summaryMostly.meal_to_lights_out_minutes,
  provenance: summaryMostly.data_provenance_summary,
});

console.assert(summaryMostly.completeness === "mostly", "Completeness is mostly");
console.assert(summaryMostly.total_calories === 1870 + 250, "Total calories includes rough calories");
console.assert(summaryMostly.eating_events_count === 6, "Eating events count is 6 (5 imported + 1 supplemented)");
console.assert(summaryMostly.final_caloric_timestamp === "2026-08-29T22:00:00.000Z", "Final meal updated to missing snack");
console.assert(summaryMostly.meal_to_lights_out_minutes === 90, "Meal to lights out updated to 90 mins (22:00 to 23:30)");
console.assert(Boolean(summaryMostly.data_provenance_summary?.includes("5 macrofactor")), "Provenance includes macrofactor");
console.assert(Boolean(summaryMostly.data_provenance_summary?.includes("1 manual_approximate")), "Provenance includes manual_approximate");
console.log("  ✓ 'Mostly' case preserved imported data and accurately updated time lag & categories.\n");

// -------------------------------------------------------------
// 3. Test "No" (Lightweight 5-Question Daily Fallback)
// -------------------------------------------------------------
console.log("[Test 3] Fallback Scenario 'No' (Lightweight Daily Fallback)...");
const dailyFallbackData = {
  completed_at: "2026-08-29T22:15:00.000Z",
  intake_relative_to_intent: 3, // More
  eating_out_of_control: 1, // Somewhat
  final_caloric_timestamp: "2026-08-29T21:00:00.000Z",
  final_meal_unusually_large: true,
  notable_exposures: ["dairy" as const, "high_fat_fried" as const],
  source: "manual_approximate" as const,
};

const summaryNo = deriveNutritionSummary(
  [],
  [],
  dailyFallbackData,
  "no",
  lightsOutTime
);

console.log("  'No' Summary:", {
  completeness: summaryNo.completeness,
  final_caloric_timestamp: summaryNo.final_caloric_timestamp,
  meal_to_lights_out: summaryNo.meal_to_lights_out_minutes,
  provenance: summaryNo.data_provenance_summary,
});

console.assert(summaryNo.completeness === "no", "Completeness is no");
console.assert(summaryNo.final_caloric_timestamp === "2026-08-29T21:00:00.000Z", "Final intake timestamp preserved");
console.assert(summaryNo.meal_to_lights_out_minutes === 150, "Meal to lights out = 150 mins (21:00 to 23:30)");
console.assert(Boolean(summaryNo.data_provenance_summary?.includes("manual_approximate")), "Provenance tracked as manual_approximate");
console.log("  ✓ 'No' case captures causal timing, meal size & GI exposures without fake macros.\n");

// -------------------------------------------------------------
// 4. Test Behavioral Intervals & Comprehensive Export
// -------------------------------------------------------------
console.log("[Test 4] Behavioral Intervals & Multi-Format CSV Exports...");
const testRecord: NightRecord = {
  id: dateKey,
  date: dateKey,
  phase_id: "baseline",
  phase_index: 0,
  night_number_in_phase: 1,
  prescribed_instruction: "Follow normal routine",
  evening_actions: [
    { action_id: "work_end", action_label: "Finished work", timestamp: "2026-08-29T18:00:00.000Z" },
    { action_id: "screen_end", action_label: "Active screens done", timestamp: "2026-08-29T22:30:00.000Z" },
    { action_id: "winddown_start", action_label: "Start wind-down", timestamp: "2026-08-29T22:30:00.000Z" },
    { action_id: "in_bed_ready", action_label: "In bed", timestamp: "2026-08-29T23:15:00.000Z" },
    { action_id: "lights_out", action_label: "Lights out", timestamp: "2026-08-29T23:30:00.000Z" },
  ],
  food_log_completeness: "mostly",
  raw_food_records: mockFoods,
  missing_eating_events: [missingLateSnack],
  derived_nutrition: summaryMostly,
  naps: [
    {
      id: "nap_1",
      start_time: "2026-08-29T14:00:00.000Z",
      end_time: "2026-08-29T14:30:00.000Z",
      duration_minutes: 30,
      source: "manual",
    },
  ],
  daily_context: {
    overall_stress: 1,
    work_stress: 2,
    work_satisfaction: 2,
    meaningful_social_contact: 3,
    routine_adherence: 3,
    eating_out_of_control: 1,
    completed_at: "2026-08-29T21:00:00.000Z",
  },
  pre_sleep_state: {
    mental_arousal: 0,
    sleepiness: 2,
    completed_at: "2026-08-29T23:25:00.000Z",
  },
  bloating_events: [
    { id: "b1", timestamp: "2026-08-29T22:30:00.000Z", severity: 2 },
  ],
  bowel_movements: [
    {
      id: "bm1",
      timestamp: "2026-08-29T09:15:00.000Z",
      bristol_type: 4,
      urgency: 0,
      complete_evacuation: true,
    },
  ],
  morning_assessment: {
    completed_at: "2026-08-30T07:15:00.000Z",
    readiness: 3,
    sleep_quality: 3,
    wake_reason: "natural",
    unusual_night: false,
  },
  wearable_data: {
    provider: "google_health",
    synced_at: "2026-08-30T07:15:00.000Z",
    sleep_onset: "2026-08-29T23:45:00.000Z",
    final_awakening: "2026-08-30T07:05:00.000Z",
    duration_minutes: 440,
    waso_minutes: 25,
    sleep_efficiency_pct: 94,
    resting_hr: 52,
    hrv_rmssd: 58,
    sync_status: "synced",
  },
  is_valid: true,
  created_at: "2026-08-29T18:00:00.000Z",
  updated_at: "2026-08-30T07:15:00.000Z",
};

const intervals = deriveBehavioralIntervals(testRecord);
console.assert(intervals.work_to_lights_out_minutes === 330, "Work to lights out = 330m");
console.assert(intervals.screen_to_lights_out_minutes === 60, "Screen to lights out = 60m");
console.assert(intervals.meal_to_lights_out_minutes === 90, "Meal to lights out = 90m (from supplemented snack)");

const state = {
  study_id: config.study_id,
  status: "active" as const,
  started_at: "2026-08-29T00:00:00.000Z",
  current_phase_index: 0,
  records: [testRecord],
  current_night_id: dateKey,
  last_active_at: "2026-08-30T07:15:00.000Z",
};

const dailyCsv = generateStudyCSV(config, state);
console.assert(dailyCsv.includes("food_log_completeness"), "Daily CSV contains completeness column");
console.assert(dailyCsv.includes("nutrition_provenance"), "Daily CSV contains provenance column");
console.assert(dailyCsv.includes("mostly"), "Daily CSV records 'mostly' status");

const foodCsv = generateRawFoodRecordsCSV(state);
console.assert(foodCsv.includes("Oatmeal with whey protein"), "Food CSV contains imported items");
console.assert(foodCsv.includes("Supplemented small meal"), "Food CSV contains supplemented missing meal");
console.assert(foodCsv.includes("dairy;sugary_food"), "Food CSV contains food category tags");
console.assert(foodCsv.includes("manual_approximate"), "Food CSV records manual_approximate source");

const jsonBundle = generateStudyJSON(config, state);
const parsed = importStudyJSON(jsonBundle);
console.assert(parsed.success, "JSON bundle parsed");
console.assert(parsed.state?.records[0].food_log_completeness === "mostly", "JSON preserves completeness");
console.assert(parsed.state?.records[0].missing_eating_events?.length === 1, "JSON preserves missing eating events");

console.log("  ✓ All tests passed with strict provenance and data integrity.\n");
console.log("==================================================");
console.log("  ALL NUTRITION FALLBACK TESTS COMPLETED! ✓       ");
console.log("==================================================");
