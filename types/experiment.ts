export type MorningQuestionType =
  | "readiness"
  | "sleep_quality"
  | "wake_reason"
  | "protocol_adherence"
  | "unusual_night";

export interface EveningActionDefinition {
  id: string;
  label: string;
  description?: string;
}

export interface ConditionConfig {
  id: string;
  instruction: string;
  secondary_instruction?: string;
  cutoff_time?: string; // e.g. "22:30"
  cutoff_minutes_before_bed?: number; // e.g. 60
  actions?: EveningActionDefinition[];
  parameters?: Record<string, unknown>;
}

export type PhaseType =
  | "baseline"
  | "randomized_experiment"
  | "fixed_sequence"
  | "washout";

export interface PhaseConfig {
  id: string;
  name: string;
  type: PhaseType;
  valid_nights_required: number;
  description?: string;
  default_instruction?: string;
  conditions?: Record<string, ConditionConfig>;
  sequence?: string[]; // array of condition keys, e.g. ["dark", "normal", "normal", "dark"]
  morning_questions?: MorningQuestionType[];
  evening_actions?: EveningActionDefinition[];
  next_phase_prep_instruction?: string;
}

export interface ExperimentConfig {
  study_id: string;
  study_name: string;
  version: string;
  description?: string;
  target_bedtime?: string; // e.g. "23:00"
  target_wake_time?: string; // e.g. "07:00"
  phases: PhaseConfig[];
}
