import { StudyState, TimeWindowContext, NightRecord } from "@/types/study";
import { ExperimentConfig } from "@/types/experiment";
import { formatDateKey, calculateStudyState } from "./protocol-engine";

export interface ContextualViewState {
  context: TimeWindowContext;
  todayDateKey: string;
  targetNightRecord: NightRecord | null;
  needsMorningCheckin: boolean;
  needsEveningProtocol: boolean;
  isMorningWindow: boolean;
  phaseTransitionMessage?: string;
}

/**
 * Calculates the canonical night date key for sleep tracking.
 * If current time is between 00:00 and 04:59 AM, "tonight" refers to the night
 * that started the previous evening.
 */
export function getActiveNightDateKey(currentTime: Date = new Date()): string {
  const d = new Date(currentTime);
  if (d.getHours() < 5) {
    d.setDate(d.getDate() - 1);
  }
  return formatDateKey(d);
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
  const hour = currentTime.getHours(); // 0 - 23
  const activeNightKey = getActiveNightDateKey(currentTime);

  // Check if study is completed
  const { isAllPhasesComplete } = calculateStudyState(
    config,
    state.records
  );

  if (isAllPhasesComplete) {
    return {
      context: "phase_transition",
      todayDateKey: activeNightKey,
      targetNightRecord: null,
      needsMorningCheckin: false,
      needsEveningProtocol: false,
      isMorningWindow: false,
      phaseTransitionMessage:
        "Congratulations! You have completed all phases of the study protocol.",
    };
  }

  // Find record for this night
  const activeRecord = state.records.find((r) => r.date === activeNightKey) || null;

  // Morning Window: 05:00 AM to 13:59 PM
  const isMorning = hour >= 5 && hour < 14;

  if (isMorning) {
    // If morning check-in has NOT been completed yet, present Morning Check-in
    if (!activeRecord?.morning_assessment) {
      return {
        context: "morning_checkin",
        todayDateKey: activeNightKey,
        targetNightRecord: activeRecord,
        needsMorningCheckin: true,
        needsEveningProtocol: false,
        isMorningWindow: true,
      };
    }

    // Morning check-in already finished for today
    return {
      context: "all_done_today",
      todayDateKey: activeNightKey,
      targetNightRecord: activeRecord,
      needsMorningCheckin: false,
      needsEveningProtocol: false,
      isMorningWindow: true,
    };
  }

  // Evening & Night Window: 14:00 PM to 04:59 AM
  // During evening/night, participant is preparing for, winding down, or entering sleep.
  // ALWAYS present Evening Protocol and 1-tap event logging buttons.
  return {
    context: "evening_protocol",
    todayDateKey: activeNightKey,
    targetNightRecord: activeRecord,
    needsMorningCheckin: false,
    needsEveningProtocol: true,
    isMorningWindow: false,
  };
}
