"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useSyncExternalStore,
  ReactNode,
} from "react";
import { ExperimentConfig, PhaseConfig } from "@/types/experiment";
import {
  StudyState,
  NightRecord,
  MorningAssessment,
  DailySubjectiveContext,
  PreSleepState,
  StudyStatus,
  NapLog,
  CaffeineEventLog,
} from "@/types/study";
import { BloatingEvent, BowelMovementEvent } from "@/types/gi";
import {
  RawFoodRecord,
  FoodLogCompleteness,
  MissingEatingEvent,
  DailyNutritionFallback,
} from "@/types/nutrition";
import { WearableProviderConfig } from "@/types/wearable";
import {
  formatDateKey,
  calculateStudyState,
  getTonightInstruction,
  evaluateNightValidity,
  TonightInstruction,
  PhaseProgress,
  initializeStudyState,
  deriveBehavioralIntervals,
} from "@/lib/engine/protocol-engine";
import {
  determineTimeWindowContext,
  getActiveNightDateKey,
  ContextualViewState,
} from "@/lib/engine/time-context";
import {
  loadStoredStudyConfig,
  saveStoredStudyConfig,
  loadStoredStudyState,
  saveStoredStudyState,
  loadWearableConfig,
  saveWearableConfig,
  clearAllStudyData,
} from "@/lib/storage/study-storage";
import { MockWearableProvider } from "@/lib/wearable/mock-wearable";
import { GoogleHealthProvider } from "@/lib/wearable/google-health";
import { deriveNutritionSummary } from "@/lib/nutrition/nutrition-service";

interface StudyContextType {
  config: ExperimentConfig;
  state: StudyState;
  viewContext: ContextualViewState;
  tonightInstruction: TonightInstruction;
  activePhase: PhaseConfig;
  currentPhaseProgress: PhaseProgress;
  allPhaseProgresses: PhaseProgress[];
  wearableConfig: WearableProviderConfig;
  isReady: boolean;

  // Actions
  submitMorningAssessment: (
    data: Omit<MorningAssessment, "completed_at">
  ) => Promise<void>;
  updateNightRecord: (date: string, updates: Partial<NightRecord>) => void;
  deleteNightRecord: (date: string) => void;
  syncWearableForDate: (date: string) => Promise<boolean>;
  logEveningAction: (actionId: string, actionLabel: string, customTimestamp?: string) => void;
  removeEveningAction: (actionId: string) => void;
  logBloatingEvent: (event: BloatingEvent) => void;
  logBowelMovement: (event: BowelMovementEvent) => void;
  saveDailyContext: (context: DailySubjectiveContext) => void;
  savePreSleepState: (state: PreSleepState) => void;
  saveFoodLogCompleteness: (completeness: FoodLogCompleteness) => void;
  saveMissingEatingEvents: (events: MissingEatingEvent[]) => void;
  saveDailyNutritionFallback: (fallback: DailyNutritionFallback) => void;
  logNap: (nap: NapLog) => void;
  logCaffeine: (caffeine: CaffeineEventLog) => void;
  acknowledgeEveningProtocol: () => void;
  updateStudyConfig: (newConfig: ExperimentConfig, preserveRecords?: boolean) => void;
  importBackupData: (state: StudyState, config?: ExperimentConfig) => void;
  setStudyStatus: (status: StudyStatus) => void;
  updateWearableConfig: (config: WearableProviderConfig) => void;
  resetStudy: () => void;
  simulateAddCompletedNight: (overrides?: Partial<MorningAssessment>) => Promise<void>;
}

const StudyContext = createContext<StudyContextType | undefined>(undefined);

const emptySubscribe = () => () => {};

export function StudyProvider({ children }: { children: ReactNode }) {
  const isReady = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const [config, setConfig] = useState<ExperimentConfig>(() => loadStoredStudyConfig());
  const [state, setState] = useState<StudyState>(() => {
    const storedConfig = loadStoredStudyConfig();
    return loadStoredStudyState(storedConfig);
  });
  const [wearableConfig, setWearableConfigState] = useState<WearableProviderConfig>(() => {
    const stored = loadWearableConfig();
    if (typeof window !== "undefined") {
      const hash = window.location.hash ? window.location.hash.substring(1) : "";
      const hashParams = new URLSearchParams(hash);
      const token = hashParams.get("access_token") || new URLSearchParams(window.location.search).get("access_token");
      if (token) {
        stored.provider_type = "google_health";
        stored.access_token = token;
        saveWearableConfig(stored);
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
    return stored;
  });

  // Save changes to storage whenever state updates
  useEffect(() => {
    if (isReady) {
      saveStoredStudyState(state);
    }
  }, [state, isReady]);

  // Automatically fetch server environment config
  useEffect(() => {
    if (isReady) {
      fetch("/api/config")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.googleClientId) {
            setWearableConfigState((prev) => {
              if (prev.client_id !== data.googleClientId) {
                const updated = {
                  ...prev,
                  client_id: data.googleClientId,
                };
                saveWearableConfig(updated);
                return updated;
              }
              return prev;
            });
          }
        })
        .catch(() => {
          // Offline fallback
        });
    }
  }, [isReady]);

  // Derived study calculations
  const studyCalculations = useMemo(() => {
    return calculateStudyState(config, state.records);
  }, [config, state.records]);

  const activePhase = useMemo(() => {
    return config.phases[studyCalculations.activePhaseIndex] || config.phases[0];
  }, [config, studyCalculations.activePhaseIndex]);

  const tonightInstruction = useMemo(() => {
    return getTonightInstruction(config, state.records);
  }, [config, state.records]);

  const viewContext = useMemo(() => {
    return determineTimeWindowContext(config, state);
  }, [config, state]);

  // Silent wearable and nutrition sync helper
  const fetchWearableDataSilently = useCallback(
    async (targetDate: string) => {
      try {
        if (wearableConfig.provider_type === "google_health" && wearableConfig.access_token) {
          const provider = new GoogleHealthProvider(wearableConfig);
          const [sleep, foods] = await Promise.all([
            provider.fetchSleepData(targetDate),
            provider.fetchNutritionData(targetDate),
          ]);
          return { sleep, foods };
        } else {
          const provider = new MockWearableProvider();
          const [sleep, foods] = await Promise.all([
            provider.fetchSleepData(targetDate),
            provider.fetchNutritionData(targetDate),
          ]);
          return { sleep, foods };
        }
      } catch (err) {
        console.warn("Silent wearable & nutrition sync notice:", err);
        return { sleep: null, foods: [] as RawFoodRecord[] };
      }
    },
    [wearableConfig]
  );

  // Action: Amend/Update an existing night's record
  const updateNightRecord = useCallback(
    (targetDate: string, updates: Partial<NightRecord>) => {
      const now = new Date().toISOString();

      setState((prevState) => {
        const records = [...prevState.records];
        const existingIdx = records.findIndex((r) => r.date === targetDate);

        if (existingIdx === -1) {
          const phase = config.phases[studyCalculations.activePhaseIndex];
          const newRecord: NightRecord = {
            id: targetDate,
            date: targetDate,
            phase_id: updates.phase_id || phase.id,
            phase_index: updates.phase_index ?? studyCalculations.activePhaseIndex,
            night_number_in_phase:
              records.filter((r) => r.phase_id === phase.id).length + 1,
            prescribed_instruction:
              updates.prescribed_instruction ||
              phase.default_instruction ||
              "Follow your normal routine.",
            secondary_instruction: "Everything else: behave normally.",
            evening_actions: updates.evening_actions || [],
            evening_acknowledged_at: updates.evening_acknowledged_at,
            morning_assessment: updates.morning_assessment,
            wearable_data: updates.wearable_data,
            bloating_events: updates.bloating_events || [],
            bowel_movements: updates.bowel_movements || [],
            daily_context: updates.daily_context,
            pre_sleep_state: updates.pre_sleep_state,
            food_log_completeness: updates.food_log_completeness,
            raw_food_records: updates.raw_food_records || [],
            missing_eating_events: updates.missing_eating_events || [],
            nutrition_fallback: updates.nutrition_fallback,
            naps: updates.naps || [],
            caffeine_events: updates.caffeine_events || [],
            is_valid: updates.is_valid ?? true,
            exclusion_reason: updates.exclusion_reason,
            created_at: now,
            updated_at: now,
            ...updates,
          };

          if (newRecord.morning_assessment) {
            const val = evaluateNightValidity(newRecord, phase);
            newRecord.is_valid = updates.is_valid ?? val.isValid;
            newRecord.exclusion_reason = updates.exclusion_reason ?? val.reason;
          }

          newRecord.derived_intervals = deriveBehavioralIntervals(newRecord);
          const lightsOut = newRecord.evening_actions.find((a) => a.action_id === "lights_out")?.timestamp;
          newRecord.derived_nutrition = deriveNutritionSummary(
            newRecord.raw_food_records,
            newRecord.missing_eating_events,
            newRecord.nutrition_fallback,
            newRecord.food_log_completeness || "yes",
            lightsOut
          );

          records.push(newRecord);
        } else {
          const current = records[existingIdx];
          const phase =
            config.phases.find((p) => p.id === current.phase_id) ||
            config.phases[current.phase_index] ||
            config.phases[0];

          const updated: NightRecord = {
            ...current,
            ...updates,
            updated_at: now,
          };

          if (updates.morning_assessment || updates.is_valid === undefined) {
            const val = evaluateNightValidity(updated, phase);
            updated.is_valid = updates.is_valid !== undefined ? updates.is_valid : val.isValid;
            updated.exclusion_reason = updates.exclusion_reason !== undefined ? updates.exclusion_reason : val.reason;
          }

          updated.derived_intervals = deriveBehavioralIntervals(updated);
          const lightsOut = updated.evening_actions.find((a) => a.action_id === "lights_out")?.timestamp;
          updated.derived_nutrition = deriveNutritionSummary(
            updated.raw_food_records,
            updated.missing_eating_events,
            updated.nutrition_fallback,
            updated.food_log_completeness || "yes",
            lightsOut
          );

          records[existingIdx] = updated;
        }

        return {
          ...prevState,
          records,
          last_active_at: now,
        };
      });
    },
    [config, studyCalculations.activePhaseIndex]
  );

  // Action: Delete a night record
  const deleteNightRecord = useCallback((targetDate: string) => {
    setState((prevState) => ({
      ...prevState,
      records: prevState.records.filter((r) => r.date !== targetDate),
      last_active_at: new Date().toISOString(),
    }));
  }, []);

  // Action: Re-sync wearable and nutrition data for a specific date
  const syncWearableForDate = useCallback(
    async (targetDate: string): Promise<boolean> => {
      const { sleep, foods } = await fetchWearableDataSilently(targetDate);
      if (!sleep && (!foods || foods.length === 0)) return false;

      setState((prevState) => {
        const records = [...prevState.records];
        const existingIdx = records.findIndex((r) => r.date === targetDate);
        if (existingIdx === -1) return prevState;

        const currentRec = records[existingIdx];
        const mergedFoods = foods.length > 0 ? foods : (currentRec.raw_food_records || []);
        const lightsOut = currentRec.evening_actions.find((a) => a.action_id === "lights_out")?.timestamp;
        const derivedNutrition = deriveNutritionSummary(
          mergedFoods,
          currentRec.missing_eating_events,
          currentRec.nutrition_fallback,
          currentRec.food_log_completeness || "yes",
          lightsOut
        );

        const updated: NightRecord = {
          ...currentRec,
          wearable_data: sleep || currentRec.wearable_data,
          raw_food_records: mergedFoods,
          derived_nutrition: derivedNutrition,
          updated_at: new Date().toISOString(),
        };

        updated.derived_intervals = deriveBehavioralIntervals(updated);
        records[existingIdx] = updated;

        return {
          ...prevState,
          records,
          last_active_at: new Date().toISOString(),
        };
      });
      return true;
    },
    [fetchWearableDataSilently]
  );

  // Action: Save Food Log Completeness
  const saveFoodLogCompleteness = useCallback((completeness: FoodLogCompleteness) => {
    const todayKey = getActiveNightDateKey();
    setState((prevState) => {
      const records = [...prevState.records];
      const existingIdx = records.findIndex((r) => r.date === todayKey);

      if (existingIdx >= 0) {
        const rec = records[existingIdx];
        const lightsOut = rec.evening_actions.find((a) => a.action_id === "lights_out")?.timestamp;
        const derivedNutrition = deriveNutritionSummary(
          rec.raw_food_records,
          rec.missing_eating_events,
          rec.nutrition_fallback,
          completeness,
          lightsOut
        );

        records[existingIdx] = {
          ...rec,
          food_log_completeness: completeness,
          derived_nutrition: derivedNutrition,
          updated_at: new Date().toISOString(),
        };
      } else {
        const phase = config.phases[studyCalculations.activePhaseIndex];
        const newRecord: NightRecord = {
          id: todayKey,
          date: todayKey,
          phase_id: phase.id,
          phase_index: studyCalculations.activePhaseIndex,
          night_number_in_phase: records.filter((r) => r.phase_id === phase.id).length + 1,
          condition_key: tonightInstruction.conditionKey,
          prescribed_instruction: tonightInstruction.primaryInstruction,
          secondary_instruction: tonightInstruction.secondaryInstruction,
          evening_actions: [],
          food_log_completeness: completeness,
          is_valid: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        newRecord.derived_nutrition = deriveNutritionSummary(
          [],
          [],
          undefined,
          completeness
        );
        records.push(newRecord);
      }

      return {
        ...prevState,
        records,
        last_active_at: new Date().toISOString(),
      };
    });
  }, [config, studyCalculations.activePhaseIndex, tonightInstruction]);

  // Action: Save Missing Eating Events (for "Mostly")
  const saveMissingEatingEvents = useCallback((events: MissingEatingEvent[]) => {
    const todayKey = getActiveNightDateKey();
    setState((prevState) => {
      const records = [...prevState.records];
      const existingIdx = records.findIndex((r) => r.date === todayKey);

      if (existingIdx >= 0) {
        const rec = records[existingIdx];
        const lightsOut = rec.evening_actions.find((a) => a.action_id === "lights_out")?.timestamp;
        const derivedNutrition = deriveNutritionSummary(
          rec.raw_food_records,
          events,
          rec.nutrition_fallback,
          "mostly",
          lightsOut
        );

        records[existingIdx] = {
          ...rec,
          food_log_completeness: "mostly",
          missing_eating_events: events,
          derived_nutrition: derivedNutrition,
          updated_at: new Date().toISOString(),
        };
      } else {
        const phase = config.phases[studyCalculations.activePhaseIndex];
        const newRecord: NightRecord = {
          id: todayKey,
          date: todayKey,
          phase_id: phase.id,
          phase_index: studyCalculations.activePhaseIndex,
          night_number_in_phase: records.filter((r) => r.phase_id === phase.id).length + 1,
          condition_key: tonightInstruction.conditionKey,
          prescribed_instruction: tonightInstruction.primaryInstruction,
          secondary_instruction: tonightInstruction.secondaryInstruction,
          evening_actions: [],
          food_log_completeness: "mostly",
          missing_eating_events: events,
          is_valid: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        newRecord.derived_nutrition = deriveNutritionSummary(
          [],
          events,
          undefined,
          "mostly"
        );
        records.push(newRecord);
      }

      return {
        ...prevState,
        records,
        last_active_at: new Date().toISOString(),
      };
    });
  }, [config, studyCalculations.activePhaseIndex, tonightInstruction]);

  // Action: Save Daily Nutrition Fallback (for "No")
  const saveDailyNutritionFallback = useCallback((fallback: DailyNutritionFallback) => {
    const todayKey = getActiveNightDateKey();
    setState((prevState) => {
      const records = [...prevState.records];
      const existingIdx = records.findIndex((r) => r.date === todayKey);

      if (existingIdx >= 0) {
        const rec = records[existingIdx];
        const lightsOut = rec.evening_actions.find((a) => a.action_id === "lights_out")?.timestamp;
        const derivedNutrition = deriveNutritionSummary(
          rec.raw_food_records,
          rec.missing_eating_events,
          fallback,
          "no",
          lightsOut
        );

        // Mirror eating_out_of_control into daily_context if present
        const dailyContext = {
          ...rec.daily_context,
          eating_out_of_control: fallback.eating_out_of_control ?? rec.daily_context?.eating_out_of_control,
        };

        records[existingIdx] = {
          ...rec,
          food_log_completeness: "no",
          nutrition_fallback: fallback,
          daily_context: dailyContext,
          derived_nutrition: derivedNutrition,
          updated_at: new Date().toISOString(),
        };
      } else {
        const phase = config.phases[studyCalculations.activePhaseIndex];
        const newRecord: NightRecord = {
          id: todayKey,
          date: todayKey,
          phase_id: phase.id,
          phase_index: studyCalculations.activePhaseIndex,
          night_number_in_phase: records.filter((r) => r.phase_id === phase.id).length + 1,
          condition_key: tonightInstruction.conditionKey,
          prescribed_instruction: tonightInstruction.primaryInstruction,
          secondary_instruction: tonightInstruction.secondaryInstruction,
          evening_actions: [],
          food_log_completeness: "no",
          nutrition_fallback: fallback,
          daily_context: {
            eating_out_of_control: fallback.eating_out_of_control,
          },
          is_valid: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        newRecord.derived_nutrition = deriveNutritionSummary(
          [],
          [],
          fallback,
          "no"
        );
        records.push(newRecord);
      }

      return {
        ...prevState,
        records,
        last_active_at: new Date().toISOString(),
      };
    });
  }, [config, studyCalculations.activePhaseIndex, tonightInstruction]);

  // Action: Log bloating event
  const logBloatingEvent = useCallback((event: BloatingEvent) => {
    const todayKey = getActiveNightDateKey();
    setState((prevState) => {
      const records = [...prevState.records];
      const existingIdx = records.findIndex((r) => r.date === todayKey);

      if (existingIdx >= 0) {
        const rec = records[existingIdx];
        const bloatingList = [...(rec.bloating_events || []), event];
        records[existingIdx] = {
          ...rec,
          bloating_events: bloatingList,
          updated_at: new Date().toISOString(),
        };
      } else {
        const phase = config.phases[studyCalculations.activePhaseIndex];
        const newRecord: NightRecord = {
          id: todayKey,
          date: todayKey,
          phase_id: phase.id,
          phase_index: studyCalculations.activePhaseIndex,
          night_number_in_phase: records.filter((r) => r.phase_id === phase.id).length + 1,
          condition_key: tonightInstruction.conditionKey,
          prescribed_instruction: tonightInstruction.primaryInstruction,
          secondary_instruction: tonightInstruction.secondaryInstruction,
          evening_actions: [],
          bloating_events: [event],
          is_valid: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        records.push(newRecord);
      }

      return {
        ...prevState,
        records,
        last_active_at: new Date().toISOString(),
      };
    });
  }, [config, studyCalculations.activePhaseIndex, tonightInstruction]);

  // Action: Log bowel movement event
  const logBowelMovement = useCallback((event: BowelMovementEvent) => {
    const todayKey = getActiveNightDateKey();
    setState((prevState) => {
      const records = [...prevState.records];
      const existingIdx = records.findIndex((r) => r.date === todayKey);

      if (existingIdx >= 0) {
        const rec = records[existingIdx];
        const bmList = [...(rec.bowel_movements || []), event];
        records[existingIdx] = {
          ...rec,
          bowel_movements: bmList,
          updated_at: new Date().toISOString(),
        };
      } else {
        const phase = config.phases[studyCalculations.activePhaseIndex];
        const newRecord: NightRecord = {
          id: todayKey,
          date: todayKey,
          phase_id: phase.id,
          phase_index: studyCalculations.activePhaseIndex,
          night_number_in_phase: records.filter((r) => r.phase_id === phase.id).length + 1,
          condition_key: tonightInstruction.conditionKey,
          prescribed_instruction: tonightInstruction.primaryInstruction,
          secondary_instruction: tonightInstruction.secondaryInstruction,
          evening_actions: [],
          bowel_movements: [event],
          is_valid: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        records.push(newRecord);
      }

      return {
        ...prevState,
        records,
        last_active_at: new Date().toISOString(),
      };
    });
  }, [config, studyCalculations.activePhaseIndex, tonightInstruction]);

  // Action: Save Daily Subjective Context
  const saveDailyContext = useCallback((dailyContext: DailySubjectiveContext) => {
    const todayKey = getActiveNightDateKey();
    setState((prevState) => {
      const records = [...prevState.records];
      const existingIdx = records.findIndex((r) => r.date === todayKey);

      if (existingIdx >= 0) {
        records[existingIdx] = {
          ...records[existingIdx],
          daily_context: dailyContext,
          updated_at: new Date().toISOString(),
        };
      } else {
        const phase = config.phases[studyCalculations.activePhaseIndex];
        const newRecord: NightRecord = {
          id: todayKey,
          date: todayKey,
          phase_id: phase.id,
          phase_index: studyCalculations.activePhaseIndex,
          night_number_in_phase: records.filter((r) => r.phase_id === phase.id).length + 1,
          condition_key: tonightInstruction.conditionKey,
          prescribed_instruction: tonightInstruction.primaryInstruction,
          secondary_instruction: tonightInstruction.secondaryInstruction,
          evening_actions: [],
          daily_context: dailyContext,
          is_valid: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        records.push(newRecord);
      }

      return {
        ...prevState,
        records,
        last_active_at: new Date().toISOString(),
      };
    });
  }, [config, studyCalculations.activePhaseIndex, tonightInstruction]);

  // Action: Save Pre-Sleep State
  const savePreSleepState = useCallback((preSleep: PreSleepState) => {
    const todayKey = getActiveNightDateKey();
    setState((prevState) => {
      const records = [...prevState.records];
      const existingIdx = records.findIndex((r) => r.date === todayKey);

      if (existingIdx >= 0) {
        records[existingIdx] = {
          ...records[existingIdx],
          pre_sleep_state: preSleep,
          updated_at: new Date().toISOString(),
        };
      } else {
        const phase = config.phases[studyCalculations.activePhaseIndex];
        const newRecord: NightRecord = {
          id: todayKey,
          date: todayKey,
          phase_id: phase.id,
          phase_index: studyCalculations.activePhaseIndex,
          night_number_in_phase: records.filter((r) => r.phase_id === phase.id).length + 1,
          condition_key: tonightInstruction.conditionKey,
          prescribed_instruction: tonightInstruction.primaryInstruction,
          secondary_instruction: tonightInstruction.secondaryInstruction,
          evening_actions: [],
          pre_sleep_state: preSleep,
          is_valid: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        records.push(newRecord);
      }

      return {
        ...prevState,
        records,
        last_active_at: new Date().toISOString(),
      };
    });
  }, [config, studyCalculations.activePhaseIndex, tonightInstruction]);

  // Action: Log Nap
  const logNap = useCallback((nap: NapLog) => {
    const todayKey = getActiveNightDateKey();
    setState((prevState) => {
      const records = [...prevState.records];
      const existingIdx = records.findIndex((r) => r.date === todayKey);

      if (existingIdx >= 0) {
        const rec = records[existingIdx];
        const naps = [...(rec.naps || []), nap];
        const updated: NightRecord = {
          ...rec,
          naps,
          updated_at: new Date().toISOString(),
        };
        updated.derived_intervals = deriveBehavioralIntervals(updated);
        records[existingIdx] = updated;
      } else {
        const phase = config.phases[studyCalculations.activePhaseIndex];
        const newRecord: NightRecord = {
          id: todayKey,
          date: todayKey,
          phase_id: phase.id,
          phase_index: studyCalculations.activePhaseIndex,
          night_number_in_phase: records.filter((r) => r.phase_id === phase.id).length + 1,
          condition_key: tonightInstruction.conditionKey,
          prescribed_instruction: tonightInstruction.primaryInstruction,
          secondary_instruction: tonightInstruction.secondaryInstruction,
          evening_actions: [],
          naps: [nap],
          is_valid: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        newRecord.derived_intervals = deriveBehavioralIntervals(newRecord);
        records.push(newRecord);
      }

      return {
        ...prevState,
        records,
        last_active_at: new Date().toISOString(),
      };
    });
  }, [config, studyCalculations.activePhaseIndex, tonightInstruction]);

  // Action: Log Caffeine Event
  const logCaffeine = useCallback((caffeine: CaffeineEventLog) => {
    const todayKey = getActiveNightDateKey();
    setState((prevState) => {
      const records = [...prevState.records];
      const existingIdx = records.findIndex((r) => r.date === todayKey);

      if (existingIdx >= 0) {
        const rec = records[existingIdx];
        const caffs = [...(rec.caffeine_events || []), caffeine];
        const updated: NightRecord = {
          ...rec,
          caffeine_events: caffs,
          updated_at: new Date().toISOString(),
        };
        updated.derived_intervals = deriveBehavioralIntervals(updated);
        records[existingIdx] = updated;
      } else {
        const phase = config.phases[studyCalculations.activePhaseIndex];
        const newRecord: NightRecord = {
          id: todayKey,
          date: todayKey,
          phase_id: phase.id,
          phase_index: studyCalculations.activePhaseIndex,
          night_number_in_phase: records.filter((r) => r.phase_id === phase.id).length + 1,
          condition_key: tonightInstruction.conditionKey,
          prescribed_instruction: tonightInstruction.primaryInstruction,
          secondary_instruction: tonightInstruction.secondaryInstruction,
          evening_actions: [],
          caffeine_events: [caffeine],
          is_valid: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        newRecord.derived_intervals = deriveBehavioralIntervals(newRecord);
        records.push(newRecord);
      }

      return {
        ...prevState,
        records,
        last_active_at: new Date().toISOString(),
      };
    });
  }, [config, studyCalculations.activePhaseIndex, tonightInstruction]);

  // Action: Submit morning assessment
  const submitMorningAssessment = useCallback(
    async (data: Omit<MorningAssessment, "completed_at">) => {
      const todayKey = getActiveNightDateKey();
      const completedAt = new Date().toISOString();

      const assessment: MorningAssessment = {
        ...data,
        completed_at: completedAt,
      };

      // Background silent wearable & nutrition sync
      const { sleep, foods } = await fetchWearableDataSilently(todayKey);

      setState((prevState) => {
        const records = [...prevState.records];
        const existingIdx = records.findIndex((r) => r.date === todayKey);

        const currentPhaseIdx = studyCalculations.activePhaseIndex;
        const phase = config.phases[currentPhaseIdx];

        const validity = evaluateNightValidity(
          { morning_assessment: assessment },
          phase
        );

        const priorValidNights = records.filter(
          (r) => r.phase_id === phase.id && r.is_valid && r.date !== todayKey
        ).length;

        const existingRec = existingIdx >= 0 ? records[existingIdx] : undefined;
        const mergedFoods = foods.length > 0 ? foods : (existingRec?.raw_food_records || []);
        const lightsOut = existingRec?.evening_actions.find((a) => a.action_id === "lights_out")?.timestamp;
        const derivedNutrition = deriveNutritionSummary(
          mergedFoods,
          existingRec?.missing_eating_events,
          existingRec?.nutrition_fallback,
          existingRec?.food_log_completeness || "yes",
          lightsOut
        );

        const updatedRecord: NightRecord = {
          id: todayKey,
          date: todayKey,
          phase_id: phase.id,
          phase_index: currentPhaseIdx,
          night_number_in_phase:
            records.filter((r) => r.phase_id === phase.id && r.date !== todayKey).length + 1,
          valid_night_number_in_phase: validity.isValid
            ? priorValidNights + 1
            : undefined,
          condition_key: tonightInstruction.conditionKey,
          prescribed_instruction: tonightInstruction.primaryInstruction,
          secondary_instruction: tonightInstruction.secondaryInstruction,
          evening_actions: existingRec ? existingRec.evening_actions : [],
          evening_acknowledged_at: existingRec?.evening_acknowledged_at,
          daily_context: existingRec?.daily_context,
          pre_sleep_state: existingRec?.pre_sleep_state,
          bloating_events: existingRec?.bloating_events || [],
          bowel_movements: existingRec?.bowel_movements || [],
          food_log_completeness: existingRec?.food_log_completeness,
          raw_food_records: mergedFoods,
          missing_eating_events: existingRec?.missing_eating_events || [],
          nutrition_fallback: existingRec?.nutrition_fallback,
          derived_nutrition: derivedNutrition,
          naps: existingRec?.naps || [],
          caffeine_events: existingRec?.caffeine_events || [],
          morning_assessment: assessment,
          wearable_data: sleep || existingRec?.wearable_data,
          is_valid: validity.isValid,
          exclusion_reason: validity.reason,
          created_at: existingRec ? existingRec.created_at : completedAt,
          updated_at: completedAt,
        };

        updatedRecord.derived_intervals = deriveBehavioralIntervals(updatedRecord);

        if (existingIdx >= 0) {
          records[existingIdx] = updatedRecord;
        } else {
          records.push(updatedRecord);
        }

        return {
          ...prevState,
          records,
          last_active_at: completedAt,
        };
      });
    },
    [
      config,
      studyCalculations.activePhaseIndex,
      tonightInstruction,
      fetchWearableDataSilently,
    ]
  );

  // Action: Log evening event timestamp
  const logEveningAction = useCallback(
    (actionId: string, actionLabel: string, customTimestamp?: string) => {
      const todayKey = getActiveNightDateKey();
      const now = customTimestamp || new Date().toISOString();

      setState((prevState) => {
        const records = [...prevState.records];
        const existingIdx = records.findIndex((r) => r.date === todayKey);

        const currentPhaseIdx = studyCalculations.activePhaseIndex;
        const phase = config.phases[currentPhaseIdx];

        const actionLog = {
          action_id: actionId,
          action_label: actionLabel,
          timestamp: now,
        };

        if (existingIdx >= 0) {
          const rec = records[existingIdx];
          const otherActions = rec.evening_actions.filter((a) => a.action_id !== actionId);
          const actions = [...otherActions, actionLog];
          const updated: NightRecord = {
            ...rec,
            evening_actions: actions,
            updated_at: new Date().toISOString(),
          };
          updated.derived_intervals = deriveBehavioralIntervals(updated);
          records[existingIdx] = updated;
        } else {
          const newRecord: NightRecord = {
            id: todayKey,
            date: todayKey,
            phase_id: phase.id,
            phase_index: currentPhaseIdx,
            night_number_in_phase:
              records.filter((r) => r.phase_id === phase.id).length + 1,
            condition_key: tonightInstruction.conditionKey,
            prescribed_instruction: tonightInstruction.primaryInstruction,
            secondary_instruction: tonightInstruction.secondaryInstruction,
            evening_actions: [actionLog],
            is_valid: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          newRecord.derived_intervals = deriveBehavioralIntervals(newRecord);
          records.push(newRecord);
        }

        return {
          ...prevState,
          records,
          last_active_at: new Date().toISOString(),
        };
      });
    },
    [config, studyCalculations.activePhaseIndex, tonightInstruction]
  );

  // Action: Remove an evening event action
  const removeEveningAction = useCallback((actionId: string) => {
    const todayKey = getActiveNightDateKey();
    setState((prevState) => {
      const records = [...prevState.records];
      const existingIdx = records.findIndex((r) => r.date === todayKey);
      if (existingIdx === -1) return prevState;

      const rec = records[existingIdx];
      const updated: NightRecord = {
        ...rec,
        evening_actions: rec.evening_actions.filter((a) => a.action_id !== actionId),
        updated_at: new Date().toISOString(),
      };
      updated.derived_intervals = deriveBehavioralIntervals(updated);
      records[existingIdx] = updated;

      return {
        ...prevState,
        records,
        last_active_at: new Date().toISOString(),
      };
    });
  }, []);

  // Action: Acknowledge evening protocol
  const acknowledgeEveningProtocol = useCallback(() => {
    const todayKey = getActiveNightDateKey();
    const now = new Date().toISOString();

    setState((prevState) => {
      const records = [...prevState.records];
      const existingIdx = records.findIndex((r) => r.date === todayKey);

      const currentPhaseIdx = studyCalculations.activePhaseIndex;
      const phase = config.phases[currentPhaseIdx];

      if (existingIdx >= 0) {
        records[existingIdx] = {
          ...records[existingIdx],
          evening_acknowledged_at: now,
          updated_at: now,
        };
      } else {
        const newRecord: NightRecord = {
          id: todayKey,
          date: todayKey,
          phase_id: phase.id,
          phase_index: currentPhaseIdx,
          night_number_in_phase:
            records.filter((r) => r.phase_id === phase.id).length + 1,
          condition_key: tonightInstruction.conditionKey,
          prescribed_instruction: tonightInstruction.primaryInstruction,
          secondary_instruction: tonightInstruction.secondaryInstruction,
          evening_actions: [],
          evening_acknowledged_at: now,
          is_valid: false,
          created_at: now,
          updated_at: now,
        };
        records.push(newRecord);
      }

      return {
        ...prevState,
        records,
        last_active_at: now,
      };
    });
  }, [config, studyCalculations.activePhaseIndex, tonightInstruction]);

  // Action: Update study config
  const updateStudyConfig = useCallback(
    (newConfig: ExperimentConfig, preserveRecords: boolean = true) => {
      setConfig(newConfig);
      saveStoredStudyConfig(newConfig);

      setState((prev) => {
        const recordsToKeep = preserveRecords ? prev.records : [];
        const newState: StudyState = {
          study_id: newConfig.study_id,
          status: prev.status || "active",
          started_at: prev.started_at || new Date().toISOString(),
          current_phase_index: prev.current_phase_index ?? 0,
          records: recordsToKeep,
          current_night_id: prev.current_night_id || formatDateKey(),
          last_active_at: new Date().toISOString(),
        };
        saveStoredStudyState(newState);
        return newState;
      });
    },
    []
  );

  // Action: Restore full backup data
  const importBackupData = useCallback(
    (importedState: StudyState, importedConfig?: ExperimentConfig) => {
      if (importedConfig) {
        setConfig(importedConfig);
        saveStoredStudyConfig(importedConfig);
      }
      setState(importedState);
      saveStoredStudyState(importedState);
    },
    []
  );

  // Action: Update study status
  const setStudyStatus = useCallback((status: StudyStatus) => {
    setState((prev) => ({
      ...prev,
      status,
      last_active_at: new Date().toISOString(),
    }));
  }, []);

  // Action: Update wearable config
  const updateWearableConfig = useCallback((newConfig: WearableProviderConfig) => {
    setWearableConfigState(newConfig);
    saveWearableConfig(newConfig);
  }, []);

  // Action: Reset study data
  const resetStudy = useCallback(() => {
    clearAllStudyData();
    const freshState = initializeStudyState(config);
    setState(freshState);
  }, [config]);

  // Simulation helper for dev testing
  const simulateAddCompletedNight = useCallback(
    async (overrides?: Partial<MorningAssessment>) => {
      const baseDate = new Date();
      baseDate.setDate(baseDate.getDate() - (30 - state.records.length));
      const dateKey = formatDateKey(baseDate);

      const assessment: MorningAssessment = {
        completed_at: new Date().toISOString(),
        readiness: 2,
        sleep_quality: 2,
        wake_reason: "natural",
        protocol_adherence: "yes",
        unusual_night: false,
        ...overrides,
      };

      const phase = config.phases[studyCalculations.activePhaseIndex];
      const validity = evaluateNightValidity({ morning_assessment: assessment }, phase);
      const { sleep, foods } = await fetchWearableDataSilently(dateKey);

      setState((prevState) => {
        const records = [...prevState.records];
        const newRecord: NightRecord = {
          id: dateKey,
          date: dateKey,
          phase_id: phase.id,
          phase_index: studyCalculations.activePhaseIndex,
          night_number_in_phase:
            records.filter((r) => r.phase_id === phase.id).length + 1,
          valid_night_number_in_phase: validity.isValid
            ? records.filter((r) => r.phase_id === phase.id && r.is_valid).length + 1
            : undefined,
          condition_key: tonightInstruction.conditionKey,
          prescribed_instruction: tonightInstruction.primaryInstruction,
          secondary_instruction: tonightInstruction.secondaryInstruction,
          evening_actions: [],
          evening_acknowledged_at: new Date().toISOString(),
          daily_context: {
            overall_stress: 1,
            work_stress: 1,
            work_satisfaction: 2,
            meaningful_social_contact: 2,
            routine_adherence: 3,
            eating_out_of_control: 0,
            completed_at: new Date().toISOString(),
          },
          pre_sleep_state: {
            mental_arousal: 1,
            sleepiness: 2,
            completed_at: new Date().toISOString(),
          },
          food_log_completeness: "yes",
          raw_food_records: foods,
          derived_nutrition: deriveNutritionSummary(foods),
          morning_assessment: assessment,
          wearable_data: sleep || undefined,
          is_valid: validity.isValid,
          exclusion_reason: validity.reason,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        newRecord.derived_intervals = deriveBehavioralIntervals(newRecord);
        records.push(newRecord);

        return {
          ...prevState,
          records,
          last_active_at: new Date().toISOString(),
        };
      });
    },
    [
      config,
      state.records.length,
      studyCalculations.activePhaseIndex,
      tonightInstruction,
      fetchWearableDataSilently,
    ]
  );

  return (
    <StudyContext.Provider
      value={{
        config,
        state,
        viewContext,
        tonightInstruction,
        activePhase,
        currentPhaseProgress: studyCalculations.currentPhaseProgress,
        allPhaseProgresses: studyCalculations.phaseProgresses,
        wearableConfig,
        isReady,
        submitMorningAssessment,
        updateNightRecord,
        deleteNightRecord,
        syncWearableForDate,
        logEveningAction,
        removeEveningAction,
        logBloatingEvent,
        logBowelMovement,
        saveDailyContext,
        savePreSleepState,
        saveFoodLogCompleteness,
        saveMissingEatingEvents,
        saveDailyNutritionFallback,
        logNap,
        logCaffeine,
        acknowledgeEveningProtocol,
        updateStudyConfig,
        importBackupData,
        setStudyStatus,
        updateWearableConfig,
        resetStudy,
        simulateAddCompletedNight,
      }}
    >
      {children}
    </StudyContext.Provider>
  );
}

export function useStudySession(): StudyContextType {
  const context = useContext(StudyContext);
  if (!context) {
    throw new Error("useStudySession must be used within a StudyProvider");
  }
  return context;
}
