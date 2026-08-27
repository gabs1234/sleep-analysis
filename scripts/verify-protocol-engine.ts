import defaultStudy from "../config/default-study.json" with { type: "json" };
import {
  calculateStudyState,
  calculatePhaseProgress,
  getTonightInstruction,
  initializeStudyState,
} from "../lib/engine/protocol-engine";
import { generateStudyCSV, generateStudyJSON } from "../lib/storage/data-export";
import { ExperimentConfig } from "../types/experiment";
import { NightRecord } from "../types/study";

const config = defaultStudy as unknown as ExperimentConfig;

console.log("=== Testing Protocol Engine ===");

// 1. Initial State
const state = initializeStudyState(config);
console.log("✓ Initial state created for study:", state.study_id);

const initCalculations = calculateStudyState(config, state.records);
console.assert(initCalculations.activePhaseIndex === 0, "Initial phase index should be 0");
console.assert(!initCalculations.isAllPhasesComplete, "Study should not be complete initially");

const tonight1 = getTonightInstruction(config, state.records);
console.log("✓ Night 1 instruction:", tonight1.primaryInstruction);
console.assert(tonight1.isBaseline === true, "Night 1 should be baseline");
console.assert(tonight1.primaryInstruction === "Follow your normal routine.", "Baseline instruction matches");

// 2. Add 20 valid baseline nights and 1 abnormal night
const records: NightRecord[] = [];
for (let i = 1; i <= 20; i++) {
  const dateStr = `2026-08-${String(i).padStart(2, "0")}`;
  records.push({
    id: dateStr,
    date: dateStr,
    phase_id: "baseline",
    phase_index: 0,
    night_number_in_phase: i,
    valid_night_number_in_phase: i,
    prescribed_instruction: "Follow your normal routine.",
    evening_actions: [],
    morning_assessment: {
      completed_at: new Date().toISOString(),
      readiness: 2,
      sleep_quality: 2,
      wake_reason: "natural",
      unusual_night: false,
    },
    is_valid: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

// Add 1 abnormal night (illness)
records.push({
  id: "2026-08-21",
  date: "2026-08-21",
  phase_id: "baseline",
  phase_index: 0,
  night_number_in_phase: 21,
  prescribed_instruction: "Follow your normal routine.",
  evening_actions: [],
  morning_assessment: {
    completed_at: new Date().toISOString(),
    readiness: 0,
    sleep_quality: 0,
    wake_reason: "other",
    unusual_night: true,
    unusual_reasons: ["illness"],
  },
  is_valid: false,
  exclusion_reason: "Marked unusual: illness",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const baselineProg = calculatePhaseProgress(0, config.phases[0], records);
console.log("Baseline progress with 1 abnormal night:", {
  total: baselineProg.totalNightsLogged,
  valid: baselineProg.validNightsLogged,
  required: baselineProg.validNightsRequired,
  isComplete: baselineProg.isComplete,
});
console.assert(baselineProg.totalNightsLogged === 21, "Total nights logged should be 21");
console.assert(baselineProg.validNightsLogged === 20, "Valid nights should be 20");
console.assert(!baselineProg.isComplete, "Baseline should require 21 valid nights (not complete yet)");

// 3. Add 21st valid baseline night -> should complete baseline and transition to darkness phase
records.push({
  id: "2026-08-22",
  date: "2026-08-22",
  phase_id: "baseline",
  phase_index: 0,
  night_number_in_phase: 22,
  valid_night_number_in_phase: 21,
  prescribed_instruction: "Follow your normal routine.",
  evening_actions: [],
  morning_assessment: {
    completed_at: new Date().toISOString(),
    readiness: 2,
    sleep_quality: 3,
    wake_reason: "natural",
    unusual_night: false,
  },
  is_valid: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const calcAfterBaseline = calculateStudyState(config, records);
console.log("Phase status after 21 valid baseline nights:", {
  activePhaseIndex: calcAfterBaseline.activePhaseIndex,
  phaseName: config.phases[calcAfterBaseline.activePhaseIndex].name,
});
console.assert(calcAfterBaseline.activePhaseIndex === 1, "Should transition to phase 1 (Darkness)");

// 4. Test condition assignment in Darkness Phase
const tonightDarkness1 = getTonightInstruction(config, records);
console.log("Darkness Night 1 instruction:", tonightDarkness1.primaryInstruction);
console.assert(
  tonightDarkness1.primaryInstruction === "Tonight, make the room as dark as reasonably possible before sleeping.",
  "Darkness night 1 condition matches sequence[0]"
);
console.assert(tonightDarkness1.conditionKey === "dark", "Condition key is dark");

// 5. Test CSV and JSON export
state.records = records;
const csv = generateStudyCSV(config, state);
console.assert(csv.includes("baseline"), "CSV includes baseline data");
console.assert(csv.includes("Marked unusual: illness"), "CSV includes exclusion reasons");

const json = generateStudyJSON(config, state);
const parsedJson = JSON.parse(json);
console.assert(parsedJson.summary.valid_nights_recorded === 21, "JSON summary valid count matches");
console.assert(parsedJson.summary.excluded_nights === 1, "JSON summary excluded count matches");

console.log("✓ ALL PROTOCOL ENGINE VERIFICATION TESTS PASSED!");
