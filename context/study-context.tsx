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
  StudyStatus,
} from "@/types/study";
import { WearableProviderConfig } from "@/types/wearable";
import {
  formatDateKey,
  calculateStudyState,
  getTonightInstruction,
  evaluateNightValidity,
  TonightInstruction,
  PhaseProgress,
  initializeStudyState,
} from "@/lib/engine/protocol-engine";
import {
  determineTimeWindowContext,
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
  logEveningAction: (actionId: string, actionLabel: string) => void;
  acknowledgeEveningProtocol: () => void;
  updateStudyConfig: (newConfig: ExperimentConfig) => void;
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
  const [wearableConfig, setWearableConfigState] = useState<WearableProviderConfig>(() =>
    loadWearableConfig()
  );

  // Save changes to storage whenever state updates
  useEffect(() => {
    if (isReady) {
      saveStoredStudyState(state);
    }
  }, [state, isReady]);

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

  // Silent wearable sync helper
  const fetchWearableDataSilently = useCallback(
    async (targetDate: string) => {
      try {
        if (wearableConfig.provider_type === "google_health" && wearableConfig.access_token) {
          const provider = new GoogleHealthProvider(wearableConfig);
          return await provider.fetchSleepData(targetDate);
        } else {
          const provider = new MockWearableProvider();
          return await provider.fetchSleepData(targetDate);
        }
      } catch (err) {
        console.warn("Silent wearable sync notice:", err);
        return null;
      }
    },
    [wearableConfig]
  );

  // Action: Submit morning assessment
  const submitMorningAssessment = useCallback(
    async (data: Omit<MorningAssessment, "completed_at">) => {
      const todayKey = formatDateKey();
      const completedAt = new Date().toISOString();

      const assessment: MorningAssessment = {
        ...data,
        completed_at: completedAt,
      };

      // Background silent wearable sync
      const wearableData = await fetchWearableDataSilently(todayKey);

      setState((prevState) => {
        const records = [...prevState.records];
        const existingIdx = records.findIndex((r) => r.date === todayKey);

        const currentPhaseIdx = studyCalculations.activePhaseIndex;
        const phase = config.phases[currentPhaseIdx];

        // Evaluate validity
        const validity = evaluateNightValidity(
          { morning_assessment: assessment },
          phase
        );

        // Count valid nights so far in this phase
        const priorValidNights = records.filter(
          (r) => r.phase_id === phase.id && r.is_valid && r.date !== todayKey
        ).length;

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
          evening_actions: existingIdx >= 0 ? records[existingIdx].evening_actions : [],
          evening_acknowledged_at:
            existingIdx >= 0 ? records[existingIdx].evening_acknowledged_at : undefined,
          morning_assessment: assessment,
          wearable_data: wearableData || undefined,
          is_valid: validity.isValid,
          exclusion_reason: validity.reason,
          created_at: existingIdx >= 0 ? records[existingIdx].created_at : completedAt,
          updated_at: completedAt,
        };

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
    (actionId: string, actionLabel: string) => {
      const todayKey = formatDateKey();
      const now = new Date().toISOString();

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
          const actions = [...rec.evening_actions, actionLog];
          records[existingIdx] = {
            ...rec,
            evening_actions: actions,
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
            evening_actions: [actionLog],
            is_valid: false, // will be evaluated once morning assessment is in
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
    },
    [config, studyCalculations.activePhaseIndex, tonightInstruction]
  );

  // Action: Acknowledge evening protocol
  const acknowledgeEveningProtocol = useCallback(() => {
    const todayKey = formatDateKey();
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
  const updateStudyConfig = useCallback((newConfig: ExperimentConfig) => {
    setConfig(newConfig);
    saveStoredStudyConfig(newConfig);
    const newState = initializeStudyState(newConfig);
    setState(newState);
    saveStoredStudyState(newState);
  }, []);

  // Action: Update study status (active, paused, completed)
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

  // Simulation helper for dev testing: adds a completed synthetic night
  const simulateAddCompletedNight = useCallback(
    async (overrides?: Partial<MorningAssessment>) => {
      // Calculate simulated date based on records length
      const baseDate = new Date();
      baseDate.setDate(baseDate.getDate() - (30 - state.records.length));
      const dateKey = formatDateKey(baseDate);

      const assessment: MorningAssessment = {
        completed_at: new Date().toISOString(),
        readiness: 2, // Ready
        sleep_quality: 2, // Good
        wake_reason: "natural",
        protocol_adherence: "yes",
        unusual_night: false,
        ...overrides,
      };

      const phase = config.phases[studyCalculations.activePhaseIndex];
      const validity = evaluateNightValidity({ morning_assessment: assessment }, phase);
      const wearableData = await fetchWearableDataSilently(dateKey);

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
          morning_assessment: assessment,
          wearable_data: wearableData || undefined,
          is_valid: validity.isValid,
          exclusion_reason: validity.reason,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
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
        logEveningAction,
        acknowledgeEveningProtocol,
        updateStudyConfig,
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
