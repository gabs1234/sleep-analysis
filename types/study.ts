import { WearableSleepData } from "./wearable";
import { BloatingEvent, BowelMovementEvent } from "./gi";
import {
  RawFoodRecord,
  DerivedNutritionSummary,
  FoodLogCompleteness,
  MissingEatingEvent,
  DailyNutritionFallback,
} from "./nutrition";

export type WakeReason =
  | "natural"
  | "alarm"
  | "light"
  | "noise"
  | "other"
  | "spontaneous"
  | "unsure";

export type ProtocolAdherence = "yes" | "mostly" | "no";

export type UnusualNightReason =
  | "illness"
  | "acute_illness"
  | "alcohol"
  | "caffeine"
  | "unusual_caffeine"
  | "travel"
  | "travel_or_different_bed"
  | "stress"
  | "unusual_stress"
  | "exercise"
  | "unusual_exercise"
  | "pain"
  | "pain_or_physical_discomfort"
  | "interruption"
  | "major_sleep_interruption"
  | "other";

export interface MorningAssessment {
  completed_at: string; // ISO timestamp
  readiness: number; // 0 (Wrecked), 1 (Sluggish), 2 (Ready), 3 (Sharp)
  sleep_quality: number; // 0 (Bad), 1 (Poor), 2 (Good), 3 (Excellent)
  wake_reason: WakeReason;
  wake_reason_detail?: string;
  protocol_adherence?: ProtocolAdherence;
  adherence_note?: string;
  unusual_night: boolean;
  unusual_reasons?: UnusualNightReason[];
  unusual_note?: string;
}

export interface DailySubjectiveContext {
  completed_at?: string; // ISO timestamp
  overall_stress?: number; // 0: Relaxed, 1: Mild, 2: Stressed, 3: Very stressed
  work_stress?: number; // 0: Calm, 1: Mild, 2: Stressed, 3: Overwhelming
  work_satisfaction?: number; // -1: No work, 0: Bad, 1: Frustrating, 2: Fine, 3: Satisfying
  meaningful_social_contact?: number; // 0: None, 1: Brief, 2: Some, 3: Substantial
  routine_adherence?: number; // 0: Fell apart, 1: Partial, 2: Mostly, 3: Complete
  eating_out_of_control?: number; // 0: No, 1: Somewhat, 2: Yes (mirrored or supplemented in fallback)
  notes?: string;
}

export interface PreSleepState {
  completed_at?: string; // ISO timestamp
  mental_arousal?: number; // 0: Quiet, 1: Active, 2: Racing, 3: Can't switch off
  sleepiness?: number; // 0: Not sleepy, 1: Slightly sleepy, 2: Sleepy, 3: Struggling to stay awake
}

export interface EveningActionLog {
  action_id: string; // e.g. "work_end", "screen_end", "winddown_start", "in_bed_ready", "lights_out", "caffeine", "meal_end"
  action_label: string;
  timestamp: string; // ISO timestamp
  meta?: Record<string, unknown>;
}

export interface NapLog {
  id: string;
  start_time: string; // ISO
  end_time: string; // ISO
  duration_minutes: number;
  source?: "wearable" | "manual";
}

export interface CaffeineEventLog {
  id: string;
  timestamp: string; // ISO
  amount_mg?: number;
  source?: string;
}

export interface DerivedBehavioralIntervals {
  work_to_lights_out_minutes?: number;
  screen_to_lights_out_minutes?: number;
  winddown_duration_minutes?: number;
  in_bed_to_lights_out_minutes?: number;
  meal_to_lights_out_minutes?: number;
  caffeine_to_lights_out_minutes?: number;
  nap_to_lights_out_minutes?: number;
  total_nap_minutes?: number;
}

export interface NightRecord {
  id: string; // YYYY-MM-DD
  date: string; // YYYY-MM-DD
  phase_id: string;
  phase_index: number;
  night_number_in_phase: number; // 1-indexed overall night in this phase
  valid_night_number_in_phase?: number; // 1-indexed valid night count
  condition_key?: string;
  prescribed_instruction: string;
  secondary_instruction?: string;
  evening_acknowledged_at?: string;
  evening_actions: EveningActionLog[];
  
  // Daily context & behaviour
  daily_context?: DailySubjectiveContext;
  pre_sleep_state?: PreSleepState;
  bloating_events?: BloatingEvent[];
  bowel_movements?: BowelMovementEvent[];
  
  // Nutrition tracking & fallback
  food_log_completeness?: FoodLogCompleteness; // "yes" | "mostly" | "no"
  raw_food_records?: RawFoodRecord[];
  missing_eating_events?: MissingEatingEvent[];
  nutrition_fallback?: DailyNutritionFallback;
  derived_nutrition?: DerivedNutritionSummary;

  naps?: NapLog[];
  caffeine_events?: CaffeineEventLog[];
  derived_intervals?: DerivedBehavioralIntervals;

  // Outcomes & physiological responses
  morning_assessment?: MorningAssessment;
  wearable_data?: WearableSleepData;
  is_valid: boolean; // Evaluated by protocol engine based on adherence & unusual events
  exclusion_reason?: string;
  created_at: string;
  updated_at: string;
}

export type StudyStatus = "active" | "paused" | "completed";

export interface StudyState {
  study_id: string;
  status: StudyStatus;
  started_at: string;
  current_phase_index: number;
  records: NightRecord[];
  current_night_id: string; // Today's date YYYY-MM-DD
  last_active_at: string;
}

export type TimeWindowContext =
  | "morning_checkin"     // Morning window & morning assessment not yet done
  | "evening_protocol"    // Day/evening window - showing protocol instructions, daily context, and events
  | "all_done_today"      // Morning is completed and evening protocol is acknowledged / settled
  | "phase_transition";   // Current phase completed; waiting to begin next phase
