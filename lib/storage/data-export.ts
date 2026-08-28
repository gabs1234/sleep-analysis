import { ExperimentConfig } from "@/types/experiment";
import { StudyState, NightRecord } from "@/types/study";
import { formatLocalTime } from "../engine/protocol-engine";

export interface StudyExportBundle {
  exported_at: string;
  study_config: ExperimentConfig;
  study_state: StudyState;
  summary: {
    total_nights_recorded: number;
    valid_nights_recorded: number;
    excluded_nights: number;
    current_status: string;
    total_raw_food_records_logged: number;
    total_gi_events_logged: number;
  };
}

export function generateStudyJSON(
  config: ExperimentConfig,
  state: StudyState
): string {
  const validNights = state.records.filter((r) => r.is_valid).length;
  let totalFoodRecords = 0;
  let totalGiEvents = 0;

  for (const r of state.records) {
    totalFoodRecords += (r.raw_food_records?.length || 0) + (r.missing_eating_events?.length || 0);
    totalGiEvents += (r.bloating_events?.length || 0) + (r.bowel_movements?.length || 0);
  }

  const bundle: StudyExportBundle = {
    exported_at: new Date().toISOString(),
    study_config: config,
    study_state: state,
    summary: {
      total_nights_recorded: state.records.length,
      valid_nights_recorded: validNights,
      excluded_nights: state.records.length - validNights,
      current_status: state.status,
      total_raw_food_records_logged: totalFoodRecords,
      total_gi_events_logged: totalGiEvents,
    },
  };
  return JSON.stringify(bundle, null, 2);
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates comprehensive Daily Study CSV with Context, GI, Nutrition, Timestamps, Sleep & Readiness outcomes.
 */
export function generateStudyCSV(
  config: ExperimentConfig,
  state: StudyState
): string {
  const headers = [
    "date",
    "study_id",
    "phase_id",
    "phase_index",
    "night_number_in_phase",
    "valid_night_number_in_phase",
    "condition_key",
    "prescribed_instruction",
    "is_valid",
    "exclusion_reason",
    
    // Daily Subjective Context (Day D)
    "overall_stress",
    "work_stress",
    "work_satisfaction",
    "meaningful_social_contact",
    "routine_adherence",
    "eating_out_of_control",
    
    // Nutrition Completeness & Provenance (Day D)
    "food_log_completeness",
    "nutrition_provenance",
    "missing_eating_events_count",
    "fallback_intake_relative",
    "fallback_final_meal_large",
    "fallback_notable_exposures",
    
    // Nutrition Summary (Day D)
    "total_calories",
    "total_protein_g",
    "total_carbs_g",
    "total_fat_g",
    "total_fiber_g",
    "total_sugar_g",
    "total_caffeine_mg",
    "eating_events_count",
    "first_meal_time",
    "final_caloric_timestamp",
    
    // GI Summary (Day D)
    "bloating_events_count",
    "max_bloating_severity",
    "bowel_movements_count",
    "bristol_types_summary",
    "incomplete_evacuation_count",
    
    // Pre-sleep state & Timestamps
    "pre_sleep_mental_arousal",
    "pre_sleep_sleepiness",
    "work_to_lights_out_min",
    "screen_to_lights_out_min",
    "winddown_duration_min",
    "meal_to_lights_out_min",
    "caffeine_to_lights_out_min",
    "total_nap_min",
    "evening_actions_summary",
    
    // Night D Wearable Sleep Response
    "wearable_provider",
    "wearable_duration_minutes",
    "wearable_awake_minutes",
    "wearable_waso_minutes",
    "wearable_efficiency_pct",
    "wearable_resting_hr",
    "wearable_avg_hr",
    "wearable_hrv_rmssd",
    "wearable_respiratory_rate",
    "wearable_deep_minutes",
    "wearable_rem_minutes",
    "wearable_light_minutes",
    "daily_steps",
    
    // Morning D+1 Outcome
    "morning_completed_at",
    "readiness_score",
    "sleep_quality_score",
    "wake_reason",
    "protocol_adherence",
    "adherence_note",
    "unusual_night",
    "unusual_reasons",
  ];

  const rows = state.records.map((record: NightRecord) => {
    const ctx = record.daily_context;
    const ps = record.pre_sleep_state;
    const nut = record.derived_nutrition;
    const intervals = record.derived_intervals;
    const morning = record.morning_assessment;
    const wearable = record.wearable_data;
    const fb = record.nutrition_fallback;

    const actionsSummary = record.evening_actions
      ? record.evening_actions
          .map((a) => `${a.action_id}@${formatLocalTime(a.timestamp)}`)
          .join(";")
      : "";

    const maxBloat = record.bloating_events && record.bloating_events.length > 0
      ? Math.max(...record.bloating_events.map((b) => b.severity))
      : "";

    const bristolSummary = record.bowel_movements
      ? record.bowel_movements.map((b) => `T${b.bristol_type}`).join(";")
      : "";

    const incompleteCount = record.bowel_movements
      ? record.bowel_movements.filter((b) => !b.complete_evacuation).length
      : 0;

    const fallbackExposures = fb?.notable_exposures ? fb.notable_exposures.join(";") : "";

    return [
      escapeCsv(record.date),
      escapeCsv(state.study_id),
      escapeCsv(record.phase_id),
      escapeCsv(record.phase_index),
      escapeCsv(record.night_number_in_phase),
      escapeCsv(record.valid_night_number_in_phase ?? ""),
      escapeCsv(record.condition_key ?? ""),
      escapeCsv(record.prescribed_instruction),
      escapeCsv(record.is_valid ? "TRUE" : "FALSE"),
      escapeCsv(record.exclusion_reason ?? ""),
      
      // Daily Subjective Context
      escapeCsv(ctx?.overall_stress ?? ""),
      escapeCsv(ctx?.work_stress ?? ""),
      escapeCsv(ctx?.work_satisfaction ?? ""),
      escapeCsv(ctx?.meaningful_social_contact ?? ""),
      escapeCsv(ctx?.routine_adherence ?? ""),
      escapeCsv(ctx?.eating_out_of_control ?? fb?.eating_out_of_control ?? ""),
      
      // Nutrition Completeness & Provenance
      escapeCsv(record.food_log_completeness ?? "yes"),
      escapeCsv(nut?.data_provenance_summary ?? ""),
      escapeCsv(record.missing_eating_events?.length ?? 0),
      escapeCsv(fb?.intake_relative_to_intent ?? ""),
      escapeCsv(fb?.final_meal_unusually_large !== undefined ? (fb.final_meal_unusually_large ? "TRUE" : "FALSE") : ""),
      escapeCsv(fallbackExposures),
      
      // Nutrition Summary
      escapeCsv(nut?.total_calories ?? ""),
      escapeCsv(nut?.total_protein_g ?? ""),
      escapeCsv(nut?.total_carbs_g ?? ""),
      escapeCsv(nut?.total_fat_g ?? ""),
      escapeCsv(nut?.total_fiber_g ?? ""),
      escapeCsv(nut?.total_sugar_g ?? ""),
      escapeCsv(nut?.total_caffeine_mg ?? ""),
      escapeCsv(nut?.eating_events_count ?? ""),
      escapeCsv(nut?.first_meal_time ?? ""),
      escapeCsv(nut?.final_caloric_timestamp ?? fb?.final_caloric_timestamp ?? ""),
      
      // GI
      escapeCsv(record.bloating_events?.length ?? 0),
      escapeCsv(maxBloat),
      escapeCsv(record.bowel_movements?.length ?? 0),
      escapeCsv(bristolSummary),
      escapeCsv(incompleteCount),
      
      // Pre-sleep & Intervals
      escapeCsv(ps?.mental_arousal ?? ""),
      escapeCsv(ps?.sleepiness ?? ""),
      escapeCsv(intervals?.work_to_lights_out_minutes ?? ""),
      escapeCsv(intervals?.screen_to_lights_out_minutes ?? ""),
      escapeCsv(intervals?.winddown_duration_minutes ?? ""),
      escapeCsv(intervals?.meal_to_lights_out_minutes ?? ""),
      escapeCsv(intervals?.caffeine_to_lights_out_minutes ?? ""),
      escapeCsv(intervals?.total_nap_minutes ?? ""),
      escapeCsv(actionsSummary),
      
      // Wearable
      escapeCsv(wearable?.provider ?? ""),
      escapeCsv(wearable?.duration_minutes ?? ""),
      escapeCsv(wearable?.awake_minutes ?? ""),
      escapeCsv(wearable?.waso_minutes ?? ""),
      escapeCsv(wearable?.sleep_efficiency_pct ?? ""),
      escapeCsv(wearable?.resting_hr ?? ""),
      escapeCsv(wearable?.avg_hr ?? ""),
      escapeCsv(wearable?.hrv_rmssd ?? ""),
      escapeCsv(wearable?.respiratory_rate ?? ""),
      escapeCsv(wearable?.stages?.deep_minutes ?? ""),
      escapeCsv(wearable?.stages?.rem_minutes ?? ""),
      escapeCsv(wearable?.stages?.light_minutes ?? ""),
      escapeCsv(wearable?.steps ?? ""),
      
      // Morning
      escapeCsv(morning?.completed_at ?? ""),
      escapeCsv(morning?.readiness ?? ""),
      escapeCsv(morning?.sleep_quality ?? ""),
      escapeCsv(morning?.wake_reason ?? ""),
      escapeCsv(morning?.protocol_adherence ?? ""),
      escapeCsv(morning?.adherence_note ?? ""),
      escapeCsv(morning ? (morning.unusual_night ? "TRUE" : "FALSE") : ""),
      escapeCsv(morning?.unusual_reasons ? morning.unusual_reasons.join(";") : ""),
    ];
  });

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

/**
 * Generates raw, unaggregated food-records CSV with strict provenance.
 * Preserves every individual item from MacroFactor as well as supplemented missing eating events.
 */
export function generateRawFoodRecordsCSV(state: StudyState): string {
  const headers = [
    "study_date",
    "event_type",
    "food_id",
    "timestamp",
    "food_name_or_desc",
    "meal_size",
    "categories",
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "fiber_g",
    "sugar_g",
    "caffeine_mg",
    "source",
  ];

  const rows: string[][] = [];

  for (const rec of state.records) {
    if (rec.raw_food_records) {
      for (const f of rec.raw_food_records) {
        rows.push([
          escapeCsv(rec.date),
          "imported_food",
          escapeCsv(f.id),
          escapeCsv(f.timestamp),
          escapeCsv(f.name),
          escapeCsv(f.meal_size ?? f.meal_type ?? ""),
          escapeCsv(f.categories ? f.categories.join(";") : ""),
          escapeCsv(f.calories),
          escapeCsv(f.protein_g ?? 0),
          escapeCsv(f.carbs_g ?? 0),
          escapeCsv(f.fat_g ?? 0),
          escapeCsv(f.fiber_g ?? 0),
          escapeCsv(f.sugar_g ?? 0),
          escapeCsv(f.caffeine_mg ?? 0),
          escapeCsv(f.source ?? f.source_app ?? "macrofactor"),
        ]);
      }
    }

    if (rec.missing_eating_events) {
      for (const m of rec.missing_eating_events) {
        rows.push([
          escapeCsv(rec.date),
          "missing_eating_event",
          escapeCsv(m.id),
          escapeCsv(m.timestamp),
          escapeCsv(`Supplemented ${m.meal_size} meal`),
          escapeCsv(m.meal_size),
          escapeCsv(m.categories.join(";")),
          escapeCsv(m.rough_calories ?? ""),
          "",
          "",
          "",
          "",
          "",
          "",
          escapeCsv(m.source),
        ]);
      }
    }
  }

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

/**
 * Generates raw timestamped GI symptom events CSV (bloating & bowel movements).
 */
export function generateRawGISymptomsCSV(state: StudyState): string {
  const headers = [
    "study_date",
    "event_type",
    "event_id",
    "timestamp",
    "bloating_severity",
    "bristol_type",
    "urgency",
    "complete_evacuation",
  ];

  const rows: string[][] = [];

  for (const rec of state.records) {
    if (rec.bloating_events) {
      for (const b of rec.bloating_events) {
        rows.push([
          escapeCsv(rec.date),
          "bloating",
          escapeCsv(b.id),
          escapeCsv(b.timestamp),
          escapeCsv(b.severity),
          "",
          "",
          "",
        ]);
      }
    }
    if (rec.bowel_movements) {
      for (const bm of rec.bowel_movements) {
        rows.push([
          escapeCsv(rec.date),
          "bowel_movement",
          escapeCsv(bm.id),
          escapeCsv(bm.timestamp),
          "",
          escapeCsv(bm.bristol_type),
          escapeCsv(bm.urgency),
          escapeCsv(bm.complete_evacuation ? "TRUE" : "FALSE"),
        ]);
      }
    }
  }

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

export function importStudyJSON(jsonString: string): {
  success: boolean;
  error?: string;
  config?: ExperimentConfig;
  state?: StudyState;
} {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== "object") {
      return { success: false, error: "Invalid backup JSON file." };
    }

    const config: ExperimentConfig | undefined = data.study_config;
    const state: StudyState | undefined = data.study_state || data;

    if (!Array.isArray(state?.records)) {
      return {
        success: false,
        error: "Backup file is missing valid night records array.",
      };
    }

    return {
      success: true,
      config,
      state,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to parse JSON backup",
    };
  }
}

export function downloadFile(filename: string, content: string, mimeType: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
