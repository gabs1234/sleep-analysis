"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
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
import { UserPreferences } from "@/types/preferences";
import { PersistenceStatus } from "@/types/persistence";
import { flushHubOutbox, HubFlushResult } from "@/lib/storage/hub-sync";
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
  getPreviousNightDateKey,
  ContextualViewState,
} from "@/lib/engine/time-context";
import {
  loadStoredStudyConfig,
  saveStoredStudyConfig,
  loadStoredStudyState,
  saveStoredStudyState,
  loadWearableConfig,
  saveWearableConfig,
  clearStoredStudyState,
  loadUserPreferences,
  saveUserPreferences,
  migrateStoredStudyState,
  hasLegacyStoredData,
} from "@/lib/storage/study-storage";
import {
  BrowserStorageSnapshot,
  initializeBrowserStorage,
  persistStudyConfig,
  persistStudyState,
  persistUserPreferences,
  persistWearableConfig,
} from "@/lib/storage/indexed-db-storage";
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
  preferences: UserPreferences;
  persistenceStatus: PersistenceStatus;
  isReady: boolean;

  // Actions
  submitMorningAssessment: (
    data: Omit<MorningAssessment, "completed_at">
  ) => Promise<void>;
  updateNightRecord: (date: string, updates: Partial<NightRecord>) => void;
  deleteNightRecord: (date: string) => void;
  syncWearableForDate: (date: string) => Promise<boolean>;
  logEveningAction: (actionId: string, actionLabel: string, customTimestamp?: string, targetDate?: string) => void;
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
  updatePreferences: (preferences: UserPreferences) => void;
  resetStudy: () => void;
  simulateAddCompletedNight: (overrides?: Partial<MorningAssessment>) => Promise<void>;
  syncOutboxNow: () => Promise<HubFlushResult>;
}

const StudyContext = createContext<StudyContextType | undefined>(undefined);

const emptySubscribe = () => () => {};

function rejectAfter<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error("Browser storage initialization timed out")),
      milliseconds
    );
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

export function StudyProvider({ children }: { children: ReactNode }) {
  const clientReady = useSyncExternalStore(
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
      }
    }
    return stored;
  });
  const [preferences, setPreferences] = useState<UserPreferences>(() => loadUserPreferences());
  const [storageReady, setStorageReady] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>({
    backend: "indexeddb",
    phase: "loading",
    pending_mutations: 0,
    migrated_from_local_storage: false,
    hub_sync_phase: "idle",
  });
  const [timeTick, setTimeTick] = useState(0);
  const initialSnapshot = useRef<BrowserStorageSnapshot>({
    config,
    state,
    wearableConfig,
    preferences,
  });
  const isReady = clientReady && storageReady;

  // Hydrate IndexedDB once, using the old localStorage values as a migration
  // source. The page remains in its loading state until the durable snapshot
  // has won, avoiding a default-state flash that could overwrite real data.
  useEffect(() => {
    if (!clientReady) return;
    let cancelled = false;

    rejectAfter(
      Promise.resolve().then(() =>
        initializeBrowserStorage(initialSnapshot.current, hasLegacyStoredData())
      ),
      4_000
    )
      .then(({ snapshot, status }) => {
        if (cancelled) return;
        const hydratedState = migrateStoredStudyState(snapshot.state, snapshot.config);
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const queryParams = new URLSearchParams(window.location.search);
        const accessToken = hashParams.get("access_token") || queryParams.get("access_token");
        const hydratedWearable = accessToken
          ? {
              ...snapshot.wearableConfig,
              provider_type: "google_health" as const,
              access_token: accessToken,
            }
          : snapshot.wearableConfig;

        setConfig(snapshot.config);
        setState(hydratedState);
        setWearableConfigState(hydratedWearable);
        setPreferences(snapshot.preferences);
        setPersistenceStatus(status);
        setStorageReady(true);

        if (accessToken) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("IndexedDB initialization failed; using localStorage fallback:", error);
        setPersistenceStatus({
          backend: "localstorage",
          phase: "error",
          pending_mutations: 0,
          last_saved_at: new Date().toISOString(),
          migrated_from_local_storage: false,
          hub_sync_phase: "error",
          hub_sync_error: "IndexedDB is unavailable, so hub sync is paused",
          error: error instanceof Error ? error.message : "IndexedDB initialization failed",
        });
        setStorageReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [clientReady]);

  const syncOutboxNow = useCallback(async (): Promise<HubFlushResult> => {
    setPersistenceStatus((current) => ({
      ...current,
      hub_sync_phase: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "syncing",
      hub_sync_error: undefined,
    }));
    const result = await flushHubOutbox();
    setPersistenceStatus((current) => ({
      ...current,
      pending_mutations: result.remaining,
      hub_sync_phase: result.outcome === "error"
        ? "error"
        : result.outcome === "offline"
          ? "offline"
          : "idle",
      last_hub_sync_at: result.outcome === "synced" || result.outcome === "idle"
        ? new Date().toISOString()
        : current.last_hub_sync_at,
      hub_sync_error: result.error,
    }));
    return result;
  }, []);

  const trackPersistence = useCallback(
    (operation: () => Promise<PersistenceStatus>, fallback: () => void) => {
      if (!storageReady) return;
      queueMicrotask(() => {
        if (persistenceStatus.backend === "localstorage") {
          fallback();
          setPersistenceStatus((current) => ({
            ...current,
            phase: current.error ? "error" : "ready",
            last_saved_at: new Date().toISOString(),
          }));
          return;
        }

        setPersistenceStatus((current) => ({ ...current, phase: "saving", error: undefined }));
        void operation()
          .then((status) => {
            setPersistenceStatus((current) => ({
              ...current,
              ...status,
              persistent_storage: current.persistent_storage,
              usage_bytes: current.usage_bytes,
              quota_bytes: current.quota_bytes,
            }));
            void syncOutboxNow();
          })
          .catch((error) => {
            console.error("IndexedDB write failed; preserving data in localStorage:", error);
            fallback();
            setPersistenceStatus((current) => ({
              ...current,
              backend: "localstorage",
              phase: "error",
              last_saved_at: new Date().toISOString(),
              error: error instanceof Error ? error.message : "IndexedDB write failed",
            }));
          });
      });
    },
    [persistenceStatus.backend, storageReady, syncOutboxNow]
  );

  useEffect(() => {
    if (!storageReady || persistenceStatus.backend !== "indexeddb") return;
    const sync = () => void syncOutboxNow();
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    sync();
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", syncWhenVisible);
    const timer = window.setInterval(sync, 60_000);
    return () => {
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.clearInterval(timer);
    };
  }, [persistenceStatus.backend, storageReady, syncOutboxNow]);

  useEffect(() => {
    trackPersistence(() => persistStudyState(state), () => saveStoredStudyState(state));
  }, [state, trackPersistence]);

  useEffect(() => {
    trackPersistence(() => persistStudyConfig(config), () => saveStoredStudyConfig(config));
  }, [config, trackPersistence]);

  useEffect(() => {
    trackPersistence(() => persistWearableConfig(wearableConfig), () => saveWearableConfig(wearableConfig));
  }, [trackPersistence, wearableConfig]);

  useEffect(() => {
    trackPersistence(() => persistUserPreferences(preferences), () => saveUserPreferences(preferences));
  }, [preferences, trackPersistence]);

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

  useEffect(() => {
    const timer = window.setInterval(() => setTimeTick((tick) => tick + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Derived study calculations
  const studyCalculations = useMemo(() => {
    return calculateStudyState(config, state.records);
  }, [config, state.records]);

  const activePhase = useMemo(() => {
    return config.phases[studyCalculations.activePhaseIndex] || config.phases[0];
  }, [config, studyCalculations.activePhaseIndex]);

  const activeTonightDateKey = getActiveNightDateKey();
  const tonightInstruction = useMemo(() => {
    return getTonightInstruction(config, state.records, activeTonightDateKey);
  }, [activeTonightDateKey, config, state.records]);

  void timeTick;
  const viewContext = determineTimeWindowContext(config, state);

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
        }

        // The simulator is deliberately excluded from real collection paths.
        // It is used only by the explicit developer simulation action below.
        return { sleep: null, foods: [] as RawFoodRecord[] };
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
            is_valid: updates.is_valid ?? false,
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
      const todayKey = getPreviousNightDateKey();
      const completedAt = new Date().toISOString();

      const assessment: MorningAssessment = {
        ...data,
        completed_at: completedAt,
      };

      // Save subjective answers immediately. External APIs must never delay or
      // endanger the primary morning outcome.
      const sleep = null;
      const foods: RawFoodRecord[] = [];

      setState((prevState) => {
        const records = [...prevState.records];
        const existingIdx = records.findIndex((r) => r.date === todayKey);

        const existingRec = existingIdx >= 0 ? records[existingIdx] : undefined;
        const currentPhaseIdx = existingRec?.phase_index ?? studyCalculations.activePhaseIndex;
        const phase = config.phases.find((item) => item.id === existingRec?.phase_id) || config.phases[currentPhaseIdx];

        const validity = evaluateNightValidity(
          { morning_assessment: assessment },
          phase
        );

        const priorValidNights = records.filter(
          (r) => r.phase_id === phase.id && r.is_valid && r.date !== todayKey
        ).length;

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
          condition_key: existingRec?.condition_key ?? tonightInstruction.conditionKey,
          prescribed_instruction: existingRec?.prescribed_instruction ?? tonightInstruction.primaryInstruction,
          secondary_instruction: existingRec?.secondary_instruction ?? tonightInstruction.secondaryInstruction,
          evening_actions: existingRec ? existingRec.evening_actions : [],
          evening_acknowledged_at: existingRec?.evening_acknowledged_at,
          evening_plan: existingRec?.evening_plan,
          evening_plan_completed_at: existingRec?.evening_plan_completed_at,
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
          life_log_events: existingRec?.life_log_events || [],
          routine_sessions: existingRec?.routine_sessions || [],
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

      void syncWearableForDate(todayKey);
    },
    [
      config,
      studyCalculations.activePhaseIndex,
      tonightInstruction,
      syncWearableForDate,
    ]
  );

  // Action: Log evening event timestamp
  const logEveningAction = useCallback(
    (actionId: string, actionLabel: string, customTimestamp?: string, targetDate?: string) => {
      const todayKey = targetDate || getActiveNightDateKey();
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
          capture_source: customTimestamp ? "recalled_later" as const : "live" as const,
          captured_at: new Date().toISOString(),
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

      setState((prev) => {
        let recordsToKeep = preserveRecords
          ? prev.records.map((record) => {
              const phaseIndex = newConfig.phases.findIndex((phase) => phase.id === record.phase_id);
              return phaseIndex >= 0 ? { ...record, phase_index: phaseIndex } : record;
            })
          : [];

        // A new focused protocol may begin on a day that already contains
        // general timeline entries. Keep those entries, but attach today's
        // record to the new active phase so protocol actions remain valid.
        if (preserveRecords && prev.study_id !== newConfig.study_id && newConfig.phases.length > 0) {
          const activeNightDate = getActiveNightDateKey();
          const activePhaseIndex = calculateStudyState(newConfig, recordsToKeep).activePhaseIndex;
          const nextPhase = newConfig.phases[activePhaseIndex];
          const phaseNightCount = recordsToKeep.filter((record) => record.phase_id === nextPhase.id).length;
          recordsToKeep = recordsToKeep.map((record) => {
            const phaseStillExists = newConfig.phases.some((phase) => phase.id === record.phase_id);
            if (record.date !== activeNightDate || phaseStillExists) return record;
            return {
              ...record,
              phase_id: nextPhase.id,
              phase_index: activePhaseIndex,
              night_number_in_phase: phaseNightCount + 1,
              valid_night_number_in_phase: undefined,
              condition_key: undefined,
              prescribed_instruction: nextPhase.default_instruction || "Follow your normal routine.",
              secondary_instruction: undefined,
              evening_acknowledged_at: undefined,
              is_valid: false,
            };
          });
        }

        const newState: StudyState = {
          data_schema_version: 2,
          study_id: newConfig.study_id,
          status: prev.study_id === newConfig.study_id ? prev.status : "active",
          started_at: prev.started_at || new Date().toISOString(),
          current_phase_index: calculateStudyState(newConfig, recordsToKeep).activePhaseIndex,
          records: recordsToKeep,
          current_night_id: prev.current_night_id || formatDateKey(),
          last_active_at: new Date().toISOString(),
        };
        return newState;
      });
    },
    []
  );

  // Action: Restore full backup data
  const importBackupData = useCallback(
    (importedState: StudyState, importedConfig?: ExperimentConfig) => {
      const effectiveConfig = importedConfig || config;
      const migratedState = migrateStoredStudyState(importedState, effectiveConfig);
      if (importedConfig) {
        setConfig(importedConfig);
      }
      setState(migratedState);
    },
    [config]
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
  }, []);

  const updatePreferences = useCallback((newPreferences: UserPreferences) => {
    setPreferences(newPreferences);
  }, []);

  // Action: Reset study data
  const resetStudy = useCallback(() => {
    const freshState = initializeStudyState(config);
    trackPersistence(() => persistStudyState(freshState), () => {
      clearStoredStudyState();
      saveStoredStudyState(freshState);
    });
    setState(freshState);
  }, [config, trackPersistence]);

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
      const mockProvider = new MockWearableProvider();
      const [sleep, foods] = await Promise.all([
        mockProvider.fetchSleepData(dateKey),
        mockProvider.fetchNutritionData(dateKey),
      ]);

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
        preferences,
        persistenceStatus,
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
        updatePreferences,
        resetStudy,
        simulateAddCompletedNight,
        syncOutboxNow,
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
