import { ExperimentConfig, PhaseConfig, ConditionConfig, EveningActionDefinition } from "@/types/experiment";
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
  instruction?: string;
  instruction_template?: string;
  secondary_instruction?: string;
  cutoff_minutes_before_target_lights_out?: number;
}

interface RawPhase {
  type?: string;
  valid_nights_required?: number;
  title_for_user?: string;
  tonight_instruction?: string;
  run_only_if?: string;
  description?: string;
  conditions?: Record<string, RawCondition>;
  sequence?: string[];
  on_complete?: string;
}

interface RawProtocolV1 {
  schema_version?: string;
  study?: RawProtocolStudyMeta;
  phase_order?: string[];
  phases?: Record<string, RawPhase>;
  manual_events?: Record<string, RawManualEvent>;
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
          actions: defaultEveningActions,
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
      sequence: rawPhase.sequence,
      evening_actions: defaultEveningActions,
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
