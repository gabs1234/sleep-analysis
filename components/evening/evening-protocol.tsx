"use client";

import React, { useState } from "react";
import { useStudySession } from "@/context/study-context";
import { getActiveNightDateKey } from "@/lib/engine/time-context";
import { EventButtons } from "./event-buttons";
import { DailyContextCard } from "./daily-context-card";
import { PreSleepCard } from "@/components/presleep/presleep-card";
import { GITracker } from "@/components/gi/gi-tracker";
import { NutritionFallback } from "@/components/nutrition/nutrition-fallback";

export function EveningProtocol() {
  const {
    tonightInstruction,
    acknowledgeEveningProtocol,
    currentPhaseProgress,
    activePhase,
    state,
    saveDailyContext,
    savePreSleepState,
    saveFoodLogCompleteness,
    saveMissingEatingEvents,
    saveDailyNutritionFallback,
    logBloatingEvent,
    logBowelMovement,
  } = useStudySession();

  const activeNightKey = getActiveNightDateKey();
  const activeRecord = state.records.find((r) => r.date === activeNightKey);

  const [acknowledged, setAcknowledged] = useState(() =>
    Boolean(activeRecord?.evening_acknowledged_at)
  );

  const handleAcknowledge = () => {
    acknowledgeEveningProtocol();
    setAcknowledged(true);
  };

  const isBaseline = tonightInstruction.isBaseline;
  const importedFoodCount = activeRecord?.raw_food_records?.length || 0;

  return (
    <div className="w-full max-w-md mx-auto px-4 py-6 space-y-6 animate-fade-in pb-20">
      {/* Header & Subtle Phase Night Progress */}
      <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
        <span className="uppercase tracking-wider">TONIGHT&apos;S PROTOCOL</span>
        <span>
          NIGHT {tonightInstruction.nightNumberInPhase} (VALID {currentPhaseProgress.validNightsLogged}/{activePhase.valid_nights_required})
        </span>
      </div>

      {/* Main Instruction Card */}
      <div className="space-y-4 p-5 rounded-2xl border border-zinc-900 bg-zinc-950">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 leading-snug">
            {tonightInstruction.primaryInstruction}
          </h1>

          {tonightInstruction.secondaryInstruction && (
            <p className="text-xs text-zinc-400 leading-relaxed">
              {tonightInstruction.secondaryInstruction}
            </p>
          )}
        </div>

        {/* Big Action Acknowledgment Button */}
        <button
          type="button"
          onClick={handleAcknowledge}
          className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] ${
            acknowledged
              ? "bg-zinc-900 text-emerald-400 border border-emerald-500/30"
              : "bg-zinc-100 text-black hover:bg-white"
          }`}
        >
          {acknowledged ? "✓ Understood & Ready" : isBaseline ? "Got it" : "Understood"}
        </button>
      </div>

      {/* Daily Subjective Context Rating Card (~5 taps) */}
      <DailyContextCard
        initialData={activeRecord?.daily_context}
        onSave={saveDailyContext}
      />

      {/* Nutrition Verification & Lightweight Fallback */}
      <NutritionFallback
        initialCompleteness={activeRecord?.food_log_completeness}
        initialMissingEvents={activeRecord?.missing_eating_events}
        initialFallback={activeRecord?.nutrition_fallback}
        importedFoodCount={importedFoodCount}
        onSaveCompleteness={saveFoodLogCompleteness}
        onSaveMissingEvents={saveMissingEatingEvents}
        onSaveFallback={saveDailyNutritionFallback}
      />

      {/* Pre-Sleep State Rating Card (~2 taps) */}
      <PreSleepCard
        initialData={activeRecord?.pre_sleep_state}
        onSave={savePreSleepState}
      />

      {/* Event-Driven GI Symptom Tracking */}
      <GITracker
        bloatingEvents={activeRecord?.bloating_events}
        bowelMovements={activeRecord?.bowel_movements}
        onLogBloating={logBloatingEvent}
        onLogBowelMovement={logBowelMovement}
      />

      {/* Timestamp Event Buttons (e.g. Work end, Screens off, Lights out) */}
      <EventButtons />

      {/* Reassurance Footer */}
      <div className="pt-2 text-center">
        <p className="text-xs text-zinc-400 font-mono">
          Wearable &amp; nutrition streams sync silently in background.
        </p>
      </div>
    </div>
  );
}
