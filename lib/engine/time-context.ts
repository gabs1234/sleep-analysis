import { StudyState, TimeWindowContext, NightRecord } from "@/types/study";
import { ExperimentConfig } from "@/types/experiment";
import { formatDateKey, calculateStudyState } from "./protocol-engine";

export interface ContextualViewState {
  context: TimeWindowContext;
  todayDateKey: string;
  targetNightRecord: NightRecord | null;
  needsMorningCheckin: boolean;
  needsEveningProtocol: boolean;
  phaseTransitionMessage?: string;
}

/**
 * Determines the current contextual screen view based on time of day,
 * study state, and completion of morning/evening interactions.
 */
export function determineTimeWindowContext(
  config: ExperimentConfig,
  state: StudyState,
  currentTime: Date = new Date()
): ContextualViewState {
  const todayDateKey = formatDateKey(currentTime);
  const hour = currentTime.getHours(); // 0 - 23

  // Check if study is completed
  const { isAllPhasesComplete } = calculateStudyState(
    config,
    state.records
  );

  if (isAllPhasesComplete) {
    return {
      context: "phase_transition",
      todayDateKey,
      targetNightRecord: null,
      needsMorningCheckin: false,
      needsEveningProtocol: false,
      phaseTransitionMessage:
        "Congratulations! You have completed all phases of the study protocol.",
    };
  }

  // Find record for today (or pending morning check-in)
  // Check if there is an existing record for today or yesterday that lacks a morning assessment
  const existingTodayRecord = state.records.find((r) => r.date === todayDateKey) || null;

  // If a record exists for today and morning assessment is NOT completed
  if (existingTodayRecord && !existingTodayRecord.morning_assessment) {
    return {
      context: "morning_checkin",
      todayDateKey,
      targetNightRecord: existingTodayRecord,
      needsMorningCheckin: true,
      needsEveningProtocol: false,
    };
  }

  // If no record exists for today yet:
  // In morning hours (e.g. 04:00 - 13:00), opening app directly presents morning check-in
  // If the user hasn't logged morning checkin for today yet, morning checkin takes precedence
  if (!existingTodayRecord) {
    // If it's early in the day (before 14:00), default to morning check-in
    // If it's evening and they never checked in morning, they can either do it or start evening
    if (hour < 14) {
      return {
        context: "morning_checkin",
        todayDateKey,
        targetNightRecord: null,
        needsMorningCheckin: true,
        needsEveningProtocol: false,
      };
    } else {
      // Afternoon / Evening: prompt evening protocol
      return {
        context: "evening_protocol",
        todayDateKey,
        targetNightRecord: null,
        needsMorningCheckin: false,
        needsEveningProtocol: true,
      };
    }
  }

  // Today's morning check-in IS completed.
  // Check evening protocol status
  if (!existingTodayRecord.evening_acknowledged_at) {
    return {
      context: "evening_protocol",
      todayDateKey,
      targetNightRecord: existingTodayRecord,
      needsMorningCheckin: false,
      needsEveningProtocol: true,
    };
  }

  // Both morning and evening acknowledged
  return {
    context: "all_done_today",
    todayDateKey,
    targetNightRecord: existingTodayRecord,
    needsMorningCheckin: false,
    needsEveningProtocol: false,
  };
}
