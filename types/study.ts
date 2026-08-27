import { WearableSleepData } from "./wearable";

export type WakeReason = "natural" | "alarm" | "light" | "noise" | "other";

export type ProtocolAdherence = "yes" | "mostly" | "no";

export type UnusualNightReason =
  | "illness"
  | "alcohol"
  | "caffeine"
  | "travel"
  | "stress"
  | "exercise"
  | "interruption"
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

export interface EveningActionLog {
  action_id: string;
  action_label: string;
  timestamp: string; // ISO timestamp
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
  | "evening_protocol"    // Day/evening window - showing protocol instructions and event action buttons
  | "all_done_today"      // Morning is completed and evening protocol is acknowledged / settled
  | "phase_transition";   // Current phase completed; waiting to begin next phase
