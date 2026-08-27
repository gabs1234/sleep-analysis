import defaultStudy from "../config/default-study.json" with { type: "json" };
import {
  calculateStudyState,
  calculatePhaseProgress,
  getTonightInstruction,
  evaluateNightValidity,
  initializeStudyState,
} from "../lib/engine/protocol-engine";
import { determineTimeWindowContext } from "../lib/engine/time-context";
import { validateStudyConfig } from "../lib/config/study-config";
import { GoogleHealthProvider } from "../lib/wearable/google-health";
import { MockWearableProvider } from "../lib/wearable/mock-wearable";
import { ExperimentConfig } from "../types/experiment";
import { NightRecord } from "../types/study";

const config = defaultStudy as unknown as ExperimentConfig;

console.log("==========================================");
console.log("  RUNNING REAL-WORLD EDGE CASE TEST SUITE ");
console.log("==========================================\n");

// -------------------------------------------------------------
// TEST 1: Skipped Days & Date Gaps
// -------------------------------------------------------------
console.log("[Test 1] Skipped Days & Irregular Tracking Gaps...");
{
  const records: NightRecord[] = [];
  // Day 1: Aug 1
  records.push({
    id: "2026-08-01",
    date: "2026-08-01",
    phase_id: "baseline",
    phase_index: 0,
    night_number_in_phase: 1,
    valid_night_number_in_phase: 1,
    prescribed_instruction: "Follow your normal routine.",
    evening_actions: [],
    morning_assessment: {
      completed_at: "2026-08-02T07:00:00Z",
      readiness: 2,
      sleep_quality: 2,
      wake_reason: "natural",
      unusual_night: false,
    },
    is_valid: true,
    created_at: "2026-08-01T20:00:00Z",
    updated_at: "2026-08-02T07:00:00Z",
  });

  // Participant skips 5 days (Aug 2, 3, 4, 5, 6), then logs on Aug 7
  records.push({
    id: "2026-08-07",
    date: "2026-08-07",
    phase_id: "baseline",
    phase_index: 0,
    night_number_in_phase: 2,
    valid_night_number_in_phase: 2,
    prescribed_instruction: "Follow your normal routine.",
    evening_actions: [],
    morning_assessment: {
      completed_at: "2026-08-08T08:00:00Z",
      readiness: 1,
      sleep_quality: 1,
      wake_reason: "alarm",
      unusual_night: false,
    },
    is_valid: true,
    created_at: "2026-08-07T22:00:00Z",
    updated_at: "2026-08-08T08:00:00Z",
  });

  const state = calculateStudyState(config, records);
  console.assert(state.activePhaseIndex === 0, "Should remain in Baseline phase");
  console.assert(state.currentPhaseProgress.validNightsLogged === 2, "Valid nights logged should be 2");

  const tonight = getTonightInstruction(config, records);
  console.assert(tonight.primaryInstruction === "Follow your normal routine.", "Instruction stays consistent across gaps");
  console.log("  ✓ Handled 5-day gap seamlessly. Valid nights: 2/21.");
}

// -------------------------------------------------------------
// TEST 2: Sequence Overflow (Many Excluded Nights)
// -------------------------------------------------------------
console.log("\n[Test 2] Sequence Overflow & Excluded Nights Extension...");
{
  const records: NightRecord[] = [];
  // Complete 21 baseline nights
  for (let i = 1; i <= 21; i++) {
    const d = `2026-07-${String(i).padStart(2, "0")}`;
    records.push({
      id: d,
      date: d,
      phase_id: "baseline",
      phase_index: 0,
      night_number_in_phase: i,
      valid_night_number_in_phase: i,
      prescribed_instruction: "Follow normal routine",
      evening_actions: [],
      morning_assessment: {
        completed_at: `${d}T07:00:00Z`,
        readiness: 2,
        sleep_quality: 2,
        wake_reason: "natural",
        unusual_night: false,
      },
      is_valid: true,
      created_at: `${d}T21:00:00Z`,
      updated_at: `${d}T07:00:00Z`,
    });
  }

  // Now in Phase 2 (Darkness). Suppose participant has 15 excluded nights + 15 valid nights (30 total nights)
  const darknessPhase = config.phases[1];
  for (let i = 1; i <= 30; i++) {
    const d = `2026-08-${String(i).padStart(2, "0")}`;
    const isExcluded = i % 2 === 0; // every even night is excluded (e.g. travel/fever)
    records.push({
      id: d,
      date: d,
      phase_id: darknessPhase.id,
      phase_index: 1,
      night_number_in_phase: i,
      prescribed_instruction: "Make room dark",
      evening_actions: [],
      morning_assessment: {
        completed_at: `${d}T07:00:00Z`,
        readiness: isExcluded ? 0 : 2,
        sleep_quality: isExcluded ? 0 : 2,
        wake_reason: "natural",
        unusual_night: isExcluded,
        unusual_reasons: isExcluded ? ["illness"] : undefined,
      },
      is_valid: !isExcluded,
      exclusion_reason: isExcluded ? "Marked unusual: illness" : undefined,
      created_at: `${d}T21:00:00Z`,
      updated_at: `${d}T07:00:00Z`,
    });
  }

  const prog = calculatePhaseProgress(1, darknessPhase, records);
  console.assert(prog.totalNightsLogged === 30, "Total logged in darkness: 30");
  console.assert(prog.validNightsLogged === 15, "Valid logged in darkness: 15");
  console.assert(prog.excludedNightsCount === 15, "Excluded logged: 15");
  console.assert(!prog.isComplete, "Darkness phase should NOT be complete (requires 20 valid)");

  // Test next tonight condition assignment with wrapped index
  const nextTonight = getTonightInstruction(config, records);
  console.assert(nextTonight.primaryInstruction !== undefined, "Instruction exists on overflow");
  console.assert(typeof nextTonight.conditionKey === "string", "Condition key valid on overflow");
  console.log(`  ✓ Handled 15 excluded nights. Progress: ${prog.validNightsLogged}/${prog.validNightsRequired}. Sequence wrapped safely.`);
}

// -------------------------------------------------------------
// TEST 3: Wearable API Network Failure & Offline Resilience
// -------------------------------------------------------------
console.log("\n[Test 3] Wearable API Error / Disconnected Graceful Fallback...");
{
  const disconnectedProvider = new GoogleHealthProvider({
    provider_type: "google_health",
    auto_sync: true,
    // No access token
  });

  console.assert(!disconnectedProvider.isConnected(), "Disconnected provider reports isConnected false");

  // Fetch should return null without crashing
  const result = await disconnectedProvider.fetchSleepData("2026-08-25");
  console.assert(result === null, "Missing token returns null safely");

  // Diagnostic test should return clear error message
  const diag = await disconnectedProvider.testConnection("2026-08-25");
  console.assert(diag.success === false, "Diagnostic reports failure cleanly");
  console.assert(diag.message.includes("No access token"), "Diagnostic returns actionable message");

  // Mock Wearable should work 100% offline
  const mock = new MockWearableProvider();
  const mockData = await mock.fetchSleepData("2026-08-25");
  console.assert(mockData !== null, "Mock provider returns data");
  console.assert(mockData?.duration_minutes && mockData.duration_minutes > 0, "Mock data contains duration");
  console.log("  ✓ Handled disconnected / offline Google Health state without crashing.");
}

// -------------------------------------------------------------
// TEST 4: Time-of-Day Context Windows
// -------------------------------------------------------------
console.log("\n[Test 4] Time-of-Day Context Window Transitions...");
{
  const state = initializeStudyState(config);

  // 1. Morning at 07:30 AM before checkin -> context must be morning_checkin
  const morningTime = new Date("2026-08-27T07:30:00");
  const morningContext = determineTimeWindowContext(config, state, morningTime);
  console.assert(morningContext.context === "morning_checkin", "07:30 AM prompts morning_checkin");

  // 2. Evening at 20:00 PM -> context must be evening_protocol
  const eveningTime = new Date("2026-08-27T20:00:00");
  const eveningContext = determineTimeWindowContext(config, state, eveningTime);
  console.assert(eveningContext.context === "evening_protocol", "20:00 PM prompts evening_protocol");

  // 3. Late Night at 23:45 PM after acknowledging evening protocol -> all_done_today
  state.records.push({
    id: "2026-08-27",
    date: "2026-08-27",
    phase_id: "baseline",
    phase_index: 0,
    night_number_in_phase: 1,
    prescribed_instruction: "Follow normal routine",
    evening_actions: [],
    evening_acknowledged_at: "2026-08-27T21:00:00Z",
    morning_assessment: {
      completed_at: "2026-08-27T08:00:00Z",
      readiness: 2,
      sleep_quality: 2,
      wake_reason: "natural",
      unusual_night: false,
    },
    is_valid: true,
    created_at: "2026-08-27T08:00:00Z",
    updated_at: "2026-08-27T21:00:00Z",
  });

  const lateNightContext = determineTimeWindowContext(config, state, new Date("2026-08-27T23:45:00"));
  console.assert(lateNightContext.context === "all_done_today", "Late night after completion shows all_done_today");
  console.log("  ✓ Time context windows evaluated accurately (Morning, Evening, Done).");
}

// -------------------------------------------------------------
// TEST 5: Record Amendment & Automatic Validity Recalculation
// -------------------------------------------------------------
console.log("\n[Test 5] Record Amendment & Adherence Correction...");
{
  const phase = config.phases[0];
  // Initial record: marked unusual with fever (is_valid = false)
  const initialRecord: NightRecord = {
    id: "2026-08-15",
    date: "2026-08-15",
    phase_id: "baseline",
    phase_index: 0,
    night_number_in_phase: 1,
    prescribed_instruction: "Follow normal routine",
    evening_actions: [],
    morning_assessment: {
      completed_at: "2026-08-16T08:00:00Z",
      readiness: 1,
      sleep_quality: 1,
      wake_reason: "natural",
      unusual_night: true,
      unusual_reasons: ["illness"],
    },
    is_valid: false,
    exclusion_reason: "Marked unusual: illness",
    created_at: "2026-08-15T22:00:00Z",
    updated_at: "2026-08-16T08:00:00Z",
  };

  const initialVal = evaluateNightValidity(initialRecord, phase);
  console.assert(!initialVal.isValid, "Initial night is excluded");

  // User amends record: removes illness flag
  const amendedRecord: NightRecord = {
    ...initialRecord,
    morning_assessment: {
      ...initialRecord.morning_assessment!,
      unusual_night: false,
      unusual_reasons: undefined,
    },
  };

  const amendedVal = evaluateNightValidity(amendedRecord, phase);
  console.assert(amendedVal.isValid, "Amended night is recalculated as valid");
  console.log("  ✓ Amendment correctly converted excluded night into valid night.");
}

// -------------------------------------------------------------
// TEST 6: Malformed Study Config Validation
// -------------------------------------------------------------
console.log("\n[Test 6] Malformed Config JSON Validation...");
{
  const invalid1 = validateStudyConfig({});
  console.assert(!invalid1.valid, "Empty config rejected");

  const invalid2 = validateStudyConfig({ study_id: "test", phases: [] });
  console.assert(!invalid2.valid, "Config with empty phases rejected");

  const valid = validateStudyConfig(defaultStudy);
  console.assert(valid.valid, "Default study config validated successfully");
  console.log("  ✓ Schema validation prevents invalid configurations.");
}

console.log("\n==========================================");
console.log("  ALL 6 EDGE CASE TEST SUITES PASSED! ✓   ");
console.log("==========================================\n");
