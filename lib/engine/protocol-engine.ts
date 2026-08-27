import { ExperimentConfig, PhaseConfig, ConditionConfig } from "@/types/experiment";
import { NightRecord, StudyState } from "@/types/study";

export interface PhaseProgress {
  phaseIndex: number;
  phase: PhaseConfig;
  totalNightsLogged: number;
  validNightsLogged: number;
  validNightsRequired: number;
  isComplete: boolean;
  remainingValidNights: number;
  excludedNightsCount: number;
}

export interface TonightInstruction {
  phaseIndex: number;
  phaseId: string;
  phaseName: string;
  nightNumberInPhase: number;
  validNightNumberInPhase: number;
  conditionKey?: string;
  condition?: ConditionConfig;
  primaryInstruction: string;
  secondaryInstruction?: string;
  cutoffTime?: string;
  cutoffMinutesBeforeBed?: number;
  actions: Array<{ id: string; label: string; description?: string }>;
  isBaseline: boolean;
  phaseCompletedNotice?: string;
}

/**
 * Formats a Date object to YYYY-MM-DD in local time
 */
export function formatDateKey(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Formats an ISO date string to user's local time (HH:MM)
 */
export function formatLocalTime(isoString?: string | null): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString.substring(11, 16);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return isoString.substring(11, 16);
  }
}

/**
 * Creates an ISO timestamp offset by a given number of minutes into the past
 */
export function createOffsetTimestamp(minutesAgo: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - minutesAgo);
  return d.toISOString();
}

/**
 * Converts a local time string (HH:MM) into today's ISO timestamp
 */
export function timeStringToIso(timeStr: string, baseDate: Date = new Date()): string {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(hours, minutes, 0, 0);
  // If time entered is in future (e.g. 23:30 when it's 01:00), it belongs to previous evening
  if (d > new Date()) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString();
}

/**
 * Evaluates whether a completed night record meets validity criteria for the study.
 * Abnormal nights or complete protocol non-adherence are excluded from valid count
 * without being deleted from the study records.
 */
export function evaluateNightValidity(
  record: Partial<NightRecord>,
  phase: PhaseConfig
): { isValid: boolean; reason?: string } {
  const morning = record.morning_assessment;
  if (!morning) {
    return { isValid: false, reason: "Morning check-in not completed" };
  }

  // If marked as an unusual night with disruptive tags
  if (morning.unusual_night) {
    const reasons = morning.unusual_reasons || [];
    const reasonText = reasons.length > 0 ? reasons.join(", ") : "abnormal night";
    return { isValid: false, reason: `Marked unusual: ${reasonText}` };
  }

  // If protocol adherence is explicitly "no" for an intervention phase
  if (phase.type === "randomized_experiment" && morning.protocol_adherence === "no") {
    return {
      isValid: false,
      reason: morning.adherence_note || "Protocol was not followed",
    };
  }

  return { isValid: true };
}

/**
 * Calculates current progress for a given phase in the study.
 */
export function calculatePhaseProgress(
  phaseIndex: number,
  phase: PhaseConfig,
  records: NightRecord[]
): PhaseProgress {
  const phaseRecords = records.filter((r) => r.phase_id === phase.id);
  const validRecords = phaseRecords.filter((r) => r.is_valid);
  const totalNights = phaseRecords.length;
  const validNights = validRecords.length;
  const isComplete = validNights >= phase.valid_nights_required;
  const remaining = Math.max(0, phase.valid_nights_required - validNights);
  const excluded = totalNights - validNights;

  return {
    phaseIndex,
    phase,
    totalNightsLogged: totalNights,
    validNightsLogged: validNights,
    validNightsRequired: phase.valid_nights_required,
    isComplete,
    remainingValidNights: remaining,
    excludedNightsCount: excluded,
  };
}

/**
 * Calculates overall study status and current active phase index.
 */
export function calculateStudyState(
  config: ExperimentConfig,
  currentRecords: NightRecord[]
): {
  activePhaseIndex: number;
  isAllPhasesComplete: boolean;
  phaseProgresses: PhaseProgress[];
  currentPhaseProgress: PhaseProgress;
} {
  const progresses: PhaseProgress[] = config.phases.map((phase, idx) =>
    calculatePhaseProgress(idx, phase, currentRecords)
  );

  let activeIdx = 0;
  for (let i = 0; i < progresses.length; i++) {
    if (!progresses[i].isComplete) {
      activeIdx = i;
      break;
    }
    if (i === progresses.length - 1 && progresses[i].isComplete) {
      activeIdx = i;
    }
  }

  const allComplete = progresses.every((p) => p.isComplete);

  return {
    activePhaseIndex: activeIdx,
    isAllPhasesComplete: allComplete,
    phaseProgresses: progresses,
    currentPhaseProgress: progresses[activeIdx] || progresses[0],
  };
}

/**
 * Determines tonight's protocol instruction based on the active phase and randomized sequence.
 * Always presents actions and human instructions, NEVER experimental jargon.
 */
export function getTonightInstruction(
  config: ExperimentConfig,
  records: NightRecord[]
): TonightInstruction {
  const { activePhaseIndex, isAllPhasesComplete, currentPhaseProgress } =
    calculateStudyState(config, records);
  const phase = config.phases[activePhaseIndex];

  if (isAllPhasesComplete) {
    return {
      phaseIndex: activePhaseIndex,
      phaseId: phase.id,
      phaseName: phase.name,
      nightNumberInPhase: currentPhaseProgress.totalNightsLogged + 1,
      validNightNumberInPhase: currentPhaseProgress.validNightsLogged,
      primaryInstruction: "Study protocol is complete! No further intervention required.",
      secondaryInstruction: "Thank you for completing all phases. Your data is ready for export.",
      actions: [],
      isBaseline: false,
      phaseCompletedNotice: "All study phases completed.",
    };
  }

  const isBaseline = phase.type === "baseline";
  const validCount = currentPhaseProgress.validNightsLogged;
  const nightCount = currentPhaseProgress.totalNightsLogged + 1;

  // If phase has conditions and a randomized sequence
  if (phase.conditions && phase.sequence && phase.sequence.length > 0) {
    const sequenceIdx = validCount % phase.sequence.length;
    const conditionKey = phase.sequence[sequenceIdx];
    const condition = phase.conditions[conditionKey];

    if (condition) {
      const actions = [
        ...(phase.evening_actions || []),
        ...(condition.actions || []),
      ];

      return {
        phaseIndex: activePhaseIndex,
        phaseId: phase.id,
        phaseName: phase.name,
        nightNumberInPhase: nightCount,
        validNightNumberInPhase: validCount + 1,
        conditionKey,
        condition,
        primaryInstruction: condition.instruction,
        secondaryInstruction: condition.secondary_instruction || "Everything else: behave normally.",
        cutoffTime: condition.cutoff_time,
        cutoffMinutesBeforeBed: condition.cutoff_minutes_before_bed,
        actions,
        isBaseline: false,
      };
    }
  }

  // Baseline or phase without randomized condition sequence
  const actions = phase.evening_actions || [];
  const primaryInstruction =
    phase.default_instruction || "Follow your normal routine.";

  return {
    phaseIndex: activePhaseIndex,
    phaseId: phase.id,
    phaseName: phase.name,
    nightNumberInPhase: nightCount,
    validNightNumberInPhase: validCount + 1,
    primaryInstruction,
    secondaryInstruction: "Everything else: behave normally.",
    actions,
    isBaseline,
  };
}

/**
 * Initializes a new blank study state
 */
export function initializeStudyState(config: ExperimentConfig): StudyState {
  const today = formatDateKey(new Date());
  return {
    study_id: config.study_id,
    status: "active",
    started_at: new Date().toISOString(),
    current_phase_index: 0,
    records: [],
    current_night_id: today,
    last_active_at: new Date().toISOString(),
  };
}
