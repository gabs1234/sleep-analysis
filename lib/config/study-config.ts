import { ExperimentConfig, PhaseConfig, ConditionConfig, EveningActionDefinition, EveningQuestionnaireModule } from "@/types/experiment";
import officialStudyV1Json from "../../sleep_study_protocol_v1.json";
import defaultStudyJson from "../../config/default-study.json";
import screenCutoffStudyJson from "../../config/screen-cutoff-study.json";

interface RawProtocolStudyMeta {
  id?: string;
  name?: string;
  purpose?: string;
}

interface RawManualEvent {
  label?: string;
  meaning?: string;
  capture?: string;
}

interface RawCondition {
  user_label?: string;
  instruction?: string;
  instruction_template?: string;
  secondary_instruction?: string;
  cutoff_minutes_before_target_lights_out?: number;
}

interface RawPhase {
  enabled?: boolean;
  type?: string;
  valid_nights_required?: number;
  title_for_user?: string;
  tonight_instruction?: string;
  run_only_if?: string;
  description?: string;
  conditions?: Record<string, RawCondition>;
  sequence?: string[];
  block_sequence?: string[];
  block_length_nights?: number;
  on_complete?: string;
  phase_setup?: {
    prompt?: string;
    constraints?: string[];
  };
  hold_constant?: string[];
}

interface RawProtocolV1 {
  schema_version?: string;
  study?: RawProtocolStudyMeta;
  phase_order?: string[];
  phases?: Record<string, RawPhase>;
  manual_events?: Record<string, RawManualEvent>;
}

const FULL_EVENING_QUESTIONNAIRE: EveningQuestionnaireModule[] = [
  "day_context",
  "stress",
  "work",
  "social",
  "routine",
  "eating",
  "pre_sleep",
  "food_log",
];

const PHASE_EVENING_QUESTIONNAIRES: Record<string, EveningQuestionnaireModule[]> = {
  baseline: FULL_EVENING_QUESTIONNAIRE,
  darkness: ["day_context", "stress", "work", "pre_sleep"],
  noise: ["day_context", "stress", "work", "pre_sleep"],
  screen_cutoff: ["day_context", "stress", "work", "routine", "pre_sleep"],
  structured_winddown: ["day_context", "stress", "work", "routine", "pre_sleep"],
  meal_cutoff: ["day_context", "stress", "eating", "pre_sleep", "food_log"],
  sleep_window_timing: ["day_context", "stress", "work", "routine", "pre_sleep"],
  sleep_opportunity: ["day_context", "stress", "work", "routine", "pre_sleep"],
  final_protocol_validation: ["day_context", "stress", "work", "routine", "pre_sleep"],
};

const PHASE_TRACKING_ACTION_IDS: Record<string, string[]> = {
  baseline: ["meal_end", "screen_end", "winddown_start", "in_bed_ready", "lights_out"],
  darkness: ["in_bed_ready", "lights_out"],
  noise: ["in_bed_ready", "lights_out"],
  screen_cutoff: ["screen_end", "in_bed_ready", "lights_out"],
  structured_winddown: ["screen_end", "winddown_start", "in_bed_ready", "lights_out"],
  meal_cutoff: ["meal_end", "in_bed_ready", "lights_out"],
  sleep_window_timing: ["in_bed_ready", "lights_out"],
  sleep_opportunity: ["in_bed_ready", "lights_out"],
  final_protocol_validation: ["meal_end", "screen_end", "winddown_start", "in_bed_ready", "lights_out"],
};

export function getEveningQuestionnaireModules(phaseId: string): EveningQuestionnaireModule[] {
  return PHASE_EVENING_QUESTIONNAIRES[phaseId] || FULL_EVENING_QUESTIONNAIRE;
}

export function getPhaseTrackingActionIds(phaseId: string): string[] | undefined {
  return PHASE_TRACKING_ACTION_IDS[phaseId];
}

/**
 * Normalizes official protocol v1 schema into the standard ExperimentConfig
 */
export function normalizeProtocolV1(raw: RawProtocolV1): ExperimentConfig {
  const studyMeta = raw.study || {};
  const phaseOrder: string[] = raw.phase_order || Object.keys(raw.phases || {});
  const phasesDict = raw.phases || {};
  const manualEventsDict = raw.manual_events || {};

  // Build global manual events
  const defaultEveningActions: EveningActionDefinition[] = Object.entries(manualEventsDict).map(
    ([id, def]) => ({
      id,
      label: def.label || id,
      description: def.meaning,
    })
  );

  const phases: PhaseConfig[] = [];

  for (const phaseId of phaseOrder) {
    const rawPhase = phasesDict[phaseId];
    if (!rawPhase) continue;
    const trackingActionIds = getPhaseTrackingActionIds(phaseId);
    const phaseEveningActions = trackingActionIds
      ? defaultEveningActions.filter((action) => trackingActionIds.includes(action.id))
      : defaultEveningActions;

    // Map phase type
    let phaseType: PhaseConfig["type"] = "randomized_experiment";
    if (rawPhase.type === "observational" || phaseId === "baseline") {
      phaseType = "baseline";
    }

    // Map conditions
    let conditions: Record<string, ConditionConfig> | undefined = undefined;
    if (rawPhase.conditions) {
      conditions = {};
      for (const [cKey, cDef] of Object.entries(rawPhase.conditions)) {
        conditions[cKey] = {
          id: cKey,
          instruction: cDef.instruction || cDef.instruction_template || "Follow tonight's condition.",
          secondary_instruction: cDef.secondary_instruction || "Everything else: behave normally.",
          cutoff_minutes_before_bed: cDef.cutoff_minutes_before_target_lights_out,
          actions: phaseEveningActions,
        };
      }
    }

    phases.push({
      id: phaseId,
      name: rawPhase.title_for_user || phaseId.charAt(0).toUpperCase() + phaseId.slice(1).replace(/_/g, " "),
      type: phaseType,
      valid_nights_required: rawPhase.valid_nights_required || 20,
      description: rawPhase.run_only_if || rawPhase.description,
      default_instruction: rawPhase.tonight_instruction || "Follow your normal routine.",
      conditions,
      sequence: rawPhase.sequence || rawPhase.block_sequence?.flatMap((conditionKey) =>
        Array.from({ length: rawPhase.block_length_nights || 1 }, () => conditionKey)
      ),
      morning_questions: [
        "readiness",
        "sleep_quality",
        "wake_reason",
        ...(phaseType === "baseline" ? [] : ["protocol_adherence" as const]),
        "unusual_night",
      ],
      evening_questionnaire_modules: getEveningQuestionnaireModules(phaseId),
      evening_actions: phaseEveningActions,
      next_phase_prep_instruction: rawPhase.on_complete === "pause_until_next_phase_is_enabled"
        ? "Baseline phase complete. Tomorrow begins the next part of the study."
        : "Phase complete. Tomorrow begins the next part of the study.",
    });
  }

  return {
    study_id: studyMeta.id || "personal-sleep-n-of-1-v1",
    study_name: studyMeta.name || "Personal Sleep Readiness Study",
    version: raw.schema_version || "1.0",
    description: studyMeta.purpose,
    phases,
  };
}

export const OFFICIAL_STUDY_V1_CONFIG = normalizeProtocolV1(officialStudyV1Json);
export const DEFAULT_STUDY_CONFIG = OFFICIAL_STUDY_V1_CONFIG;
export const SCREEN_CUTOFF_STUDY_CONFIG = screenCutoffStudyJson as unknown as ExperimentConfig;
export const LEGACY_DARKNESS_STUDY_CONFIG = defaultStudyJson as unknown as ExperimentConfig;

export const AVAILABLE_STUDIES: ExperimentConfig[] = [
  OFFICIAL_STUDY_V1_CONFIG,
  LEGACY_DARKNESS_STUDY_CONFIG,
  SCREEN_CUTOFF_STUDY_CONFIG,
];

export interface ProtocolStrategy {
  id: string;
  name: string;
  type: string;
  validNights: number;
  rationale?: string;
  defaultInstruction?: string;
  setupPrompt?: string;
  setupConstraints: string[];
  holdConstant: string[];
  conditions: Array<{
    id: string;
    label?: string;
    instruction: string;
  }>;
}

const rawOfficialProtocol = officialStudyV1Json as RawProtocolV1;

/** Focused protocol options exposed by the official study JSON, in its declared order. */
export const OFFICIAL_PROTOCOL_STRATEGIES: ProtocolStrategy[] = (
  rawOfficialProtocol.phase_order || []
).flatMap((phaseId) => {
  const rawPhase = rawOfficialProtocol.phases?.[phaseId];
  const normalizedPhase = OFFICIAL_STUDY_V1_CONFIG.phases.find((phase) => phase.id === phaseId);
  if (!rawPhase || !normalizedPhase) return [];

  return [{
    id: phaseId,
    name: normalizedPhase.name,
    type: rawPhase.type || normalizedPhase.type,
    validNights: normalizedPhase.valid_nights_required,
    rationale: rawPhase.run_only_if || rawPhase.description,
    defaultInstruction: rawPhase.tonight_instruction,
    setupPrompt: rawPhase.phase_setup?.prompt,
    setupConstraints: rawPhase.phase_setup?.constraints || [],
    holdConstant: rawPhase.hold_constant || [],
    conditions: Object.entries(rawPhase.conditions || {}).map(([id, condition]) => ({
      id,
      label: condition.user_label,
      instruction: condition.instruction || condition.instruction_template || "Follow tonight's condition.",
    })),
  }];
});

export function getFocusedStudyId(strategyId: string): string {
  return `${OFFICIAL_STUDY_V1_CONFIG.study_id}-strategy-${strategyId}`;
}

/** Builds a practical study plan: baseline first, followed by one chosen intervention. */
export function buildFocusedStudyConfig(strategyId: string): ExperimentConfig | undefined {
  const chosenPhase = OFFICIAL_STUDY_V1_CONFIG.phases.find((phase) => phase.id === strategyId);
  const baseline = OFFICIAL_STUDY_V1_CONFIG.phases.find((phase) => phase.id === "baseline");
  if (!chosenPhase || !baseline) return undefined;

  const phases = strategyId === "baseline" ? [chosenPhase] : [baseline, chosenPhase];
  return {
    ...OFFICIAL_STUDY_V1_CONFIG,
    study_id: getFocusedStudyId(strategyId),
    study_name: strategyId === "baseline" ? "Baseline Sleep Study" : `${chosenPhase.name} Study`,
    description: strategyId === "baseline"
      ? "Establish your normal sleep pattern before choosing a change to test."
      : `Establish a baseline, then test ${chosenPhase.name.toLowerCase()} while keeping the rest of your routine as stable as practical.`,
    phases,
  };
}

export function getStudyConfigById(studyId: string): ExperimentConfig {
  const found = AVAILABLE_STUDIES.find((s) => s.study_id === studyId);
  return found || DEFAULT_STUDY_CONFIG;
}

export function validateStudyConfig(json: unknown): { valid: boolean; error?: string; config?: ExperimentConfig } {
  try {
    if (!json || typeof json !== "object") {
      return { valid: false, error: "Invalid JSON object" };
    }

    const raw = json as Record<string, unknown>;

    // Check if it's the official schema format (with "schema_version" or "study" and "phases")
    if (raw.schema_version || (raw.study && raw.phases && !Array.isArray(raw.phases))) {
      const normalized = normalizeProtocolV1(raw as RawProtocolV1);
      if (!normalized.phases || normalized.phases.length === 0) {
        return { valid: false, error: "Protocol contains no valid phases in 'phases'" };
      }
      return { valid: true, config: normalized };
    }

    // Standard array-based schema format
    const obj = raw as Partial<ExperimentConfig>;
    if (!obj.study_id || typeof obj.study_id !== "string") {
      return { valid: false, error: "Missing or invalid 'study_id' (or 'study.id')" };
    }
    if (!obj.study_name || typeof obj.study_name !== "string") {
      return { valid: false, error: "Missing or invalid 'study_name' (or 'study.name')" };
    }
    if (!Array.isArray(obj.phases) || obj.phases.length === 0) {
      return { valid: false, error: "Study must contain at least one phase in 'phases'" };
    }
    for (let i = 0; i < obj.phases.length; i++) {
      const phase = obj.phases[i];
      if (!phase.id || !phase.name || typeof phase.valid_nights_required !== "number") {
        return {
          valid: false,
          error: `Phase at index ${i} is missing 'id', 'name', or 'valid_nights_required'`,
        };
      }
    }
    return { valid: true, config: obj as ExperimentConfig };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Invalid JSON format" };
  }
}
