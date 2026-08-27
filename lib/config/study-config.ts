import { ExperimentConfig } from "@/types/experiment";
import defaultStudyJson from "../../config/default-study.json";
import screenCutoffStudyJson from "../../config/screen-cutoff-study.json";

export const DEFAULT_STUDY_CONFIG = defaultStudyJson as unknown as ExperimentConfig;
export const SCREEN_CUTOFF_STUDY_CONFIG = screenCutoffStudyJson as unknown as ExperimentConfig;

export const AVAILABLE_STUDIES: ExperimentConfig[] = [
  DEFAULT_STUDY_CONFIG,
  SCREEN_CUTOFF_STUDY_CONFIG,
];

export function getStudyConfigById(studyId: string): ExperimentConfig {
  const found = AVAILABLE_STUDIES.find((s) => s.study_id === studyId);
  return found || DEFAULT_STUDY_CONFIG;
}

export function validateStudyConfig(json: unknown): { valid: boolean; error?: string; config?: ExperimentConfig } {
  try {
    const obj = json as Partial<ExperimentConfig>;
    if (!obj.study_id || typeof obj.study_id !== "string") {
      return { valid: false, error: "Missing or invalid 'study_id'" };
    }
    if (!obj.study_name || typeof obj.study_name !== "string") {
      return { valid: false, error: "Missing or invalid 'study_name'" };
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
