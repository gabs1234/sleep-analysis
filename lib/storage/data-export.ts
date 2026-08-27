import { ExperimentConfig } from "@/types/experiment";
import { StudyState, NightRecord } from "@/types/study";

export interface StudyExportBundle {
  exported_at: string;
  study_config: ExperimentConfig;
  study_state: StudyState;
  summary: {
    total_nights_recorded: number;
    valid_nights_recorded: number;
    excluded_nights: number;
    current_status: string;
  };
}

export function generateStudyJSON(
  config: ExperimentConfig,
  state: StudyState
): string {
  const validNights = state.records.filter((r) => r.is_valid).length;
  const bundle: StudyExportBundle = {
    exported_at: new Date().toISOString(),
    study_config: config,
    study_state: state,
    summary: {
      total_nights_recorded: state.records.length,
      valid_nights_recorded: validNights,
      excluded_nights: state.records.length - validNights,
      current_status: state.status,
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
    "evening_acknowledged_at",
    "evening_actions_count",
    "evening_actions_summary",
    "morning_completed_at",
    "readiness_score",
    "sleep_quality_score",
    "wake_reason",
    "protocol_adherence",
    "adherence_note",
    "unusual_night",
    "unusual_reasons",
    "wearable_provider",
    "wearable_duration_minutes",
    "wearable_awake_minutes",
    "wearable_efficiency_pct",
    "wearable_resting_hr",
    "wearable_avg_hr",
    "wearable_hrv_rmssd",
    "wearable_respiratory_rate",
    "wearable_sync_status",
  ];

  const rows = state.records.map((record: NightRecord) => {
    const morning = record.morning_assessment;
    const wearable = record.wearable_data;
    const actionsSummary = record.evening_actions
      ? record.evening_actions
          .map((a) => `${a.action_id}@${a.timestamp.substring(11, 19)}`)
          .join(";")
      : "";

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
      escapeCsv(record.evening_acknowledged_at ?? ""),
      escapeCsv(record.evening_actions?.length ?? 0),
      escapeCsv(actionsSummary),
      escapeCsv(morning?.completed_at ?? ""),
      escapeCsv(morning?.readiness ?? ""),
      escapeCsv(morning?.sleep_quality ?? ""),
      escapeCsv(morning?.wake_reason ?? ""),
      escapeCsv(morning?.protocol_adherence ?? ""),
      escapeCsv(morning?.adherence_note ?? ""),
      escapeCsv(morning ? (morning.unusual_night ? "TRUE" : "FALSE") : ""),
      escapeCsv(morning?.unusual_reasons ? morning.unusual_reasons.join(";") : ""),
      escapeCsv(wearable?.provider ?? ""),
      escapeCsv(wearable?.duration_minutes ?? ""),
      escapeCsv(wearable?.awake_minutes ?? ""),
      escapeCsv(wearable?.sleep_efficiency_pct ?? ""),
      escapeCsv(wearable?.resting_hr ?? ""),
      escapeCsv(wearable?.avg_hr ?? ""),
      escapeCsv(wearable?.hrv_rmssd ?? ""),
      escapeCsv(wearable?.respiratory_rate ?? ""),
      escapeCsv(wearable?.sync_status ?? ""),
    ];
  });

  const csvLines = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ];

  return csvLines.join("\n");
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
