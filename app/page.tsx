"use client";

import React, { useState } from "react";
import { useStudySession } from "@/context/study-context";
import { MorningCheckin } from "@/components/morning/morning-checkin";
import { EveningQuestionnaire } from "@/components/evening/evening-questionnaire";
import { PhaseTransitionCard } from "@/components/study/phase-transition-card";
import { EventButtons } from "@/components/evening/event-buttons";
import { GITracker } from "@/components/gi/gi-tracker";
import { getActiveNightDateKey } from "@/lib/engine/time-context";
import { formatLocalTime } from "@/lib/engine/protocol-engine";

export default function HomePage() {
  const {
    isReady,
    viewContext,
    tonightInstruction,
    acknowledgeEveningProtocol,
    currentPhaseProgress,
    activePhase,
    state,
    logBloatingEvent,
    logBowelMovement,
  } = useStudySession();

  const [activeFlow, setActiveFlow] = useState<"morning" | "evening" | null>(null);

  const activeNightKey = getActiveNightDateKey();
  const activeRecord = state.records.find((r) => r.date === activeNightKey);

  const isMorningDone = Boolean(activeRecord?.morning_assessment?.completed_at);
  const isEveningDone = Boolean(
    activeRecord?.daily_context?.completed_at || activeRecord?.pre_sleep_state?.completed_at
  );
  const isProtocolAcknowledged = Boolean(activeRecord?.evening_acknowledged_at);

  if (!isReady) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-zinc-200 rounded-full animate-spin" />
      </div>
    );
  }

  // Phase transition state
  if (viewContext.context === "phase_transition") {
    return <PhaseTransitionCard message={viewContext.phaseTransitionMessage} />;
  }

  // Active Flow: Morning Questionnaire
  if (activeFlow === "morning") {
    return (
      <MorningCheckin
        initialData={activeRecord?.morning_assessment}
        onComplete={() => setActiveFlow(null)}
        onClose={() => setActiveFlow(null)}
      />
    );
  }

  // Active Flow: Evening Questionnaire
  if (activeFlow === "evening") {
    return (
      <EveningQuestionnaire
        initialContext={activeRecord?.daily_context}
        initialPreSleep={activeRecord?.pre_sleep_state}
        initialCompleteness={activeRecord?.food_log_completeness}
        initialFallback={activeRecord?.nutrition_fallback}
        importedFoodCount={activeRecord?.raw_food_records?.length || 0}
        onComplete={() => setActiveFlow(null)}
        onClose={() => setActiveFlow(null)}
      />
    );
  }

  // Main Dashboard
  return (
    <div className="w-full max-w-md mx-auto px-4 py-6 space-y-6 animate-fade-in pb-24">
      {/* Header & Phase Progress */}
      <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
        <span className="uppercase tracking-wider font-semibold text-zinc-300">
          {activePhase.name}
        </span>
        <span>
          VALID {currentPhaseProgress.validNightsLogged} / {activePhase.valid_nights_required}
        </span>
      </div>

      {/* Tonight's Instruction & Protocol Card */}
      <div className="p-5 rounded-2xl border border-zinc-900 bg-zinc-950 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            TONIGHT&apos;S PROTOCOL (NIGHT {tonightInstruction.nightNumberInPhase})
          </div>
          {isProtocolAcknowledged && (
            <span className="text-[11px] font-mono text-emerald-400">✓ Ready</span>
          )}
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-zinc-100 leading-snug">
            {tonightInstruction.primaryInstruction}
          </h2>
          {tonightInstruction.secondaryInstruction && (
            <p className="text-xs text-zinc-400 leading-relaxed">
              {tonightInstruction.secondaryInstruction}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={acknowledgeEveningProtocol}
          className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.98] ${
            isProtocolAcknowledged
              ? "bg-zinc-900 border border-emerald-500/30 text-emerald-400"
              : "bg-zinc-100 text-black hover:bg-white"
          }`}
        >
          {isProtocolAcknowledged ? "✓ Understood & Ready" : "Acknowledge Instruction"}
        </button>
      </div>

      {/* Daily Checkpoints / Sequential Questionnaires */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
          <span>DAILY CHECKPOINTS</span>
          <span>SEQUENTIAL CHECK-INS</span>
        </div>

        {/* 1. Morning Check-in Card */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            isMorningDone
              ? "border-zinc-900 bg-zinc-950"
              : "border-amber-500/30 bg-amber-500/5 shadow-sm"
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="text-base">🌅</span>
                <span className="text-sm font-semibold text-zinc-100">
                  Morning Check-in
                </span>
                {isMorningDone && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Done {activeRecord?.morning_assessment?.completed_at ? formatLocalTime(activeRecord.morning_assessment.completed_at) : ""}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400">
                {isMorningDone
                  ? `Readiness: ${
                      ["Wrecked", "Sluggish", "Ready", "Sharp"][
                        activeRecord?.morning_assessment?.readiness ?? 2
                      ]
                    } • Quality: ${
                      ["Bad", "Poor", "Good", "Excellent"][
                        activeRecord?.morning_assessment?.sleep_quality ?? 2
                      ]
                    }`
                  : "Rate wakeup readiness, sleep quality, and protocol adherence (~4 taps)."}
              </p>
            </div>
          </div>

          <div className="pt-3">
            <button
              type="button"
              onClick={() => setActiveFlow("morning")}
              className={`w-full py-2.5 rounded-xl font-semibold text-xs transition-all active:scale-[0.98] ${
                isMorningDone
                  ? "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  : "bg-amber-400 text-black hover:bg-amber-300 font-bold shadow"
              }`}
            >
              {isMorningDone ? "Review / Edit Morning Answers ✏" : "Start Morning Check-in →"}
            </button>
          </div>
        </div>

        {/* 2. Evening Check-in Card */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            isEveningDone
              ? "border-zinc-900 bg-zinc-950"
              : "border-zinc-800 bg-zinc-950"
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="text-base">🌙</span>
                <span className="text-sm font-semibold text-zinc-100">
                  Evening Check-in
                </span>
                {isEveningDone && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Done {activeRecord?.daily_context?.completed_at ? formatLocalTime(activeRecord.daily_context.completed_at) : ""}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400">
                {isEveningDone
                  ? `Stress: ${
                      ["Relaxed", "Mild", "Stressed", "Very stressed"][
                        activeRecord?.daily_context?.overall_stress ?? 1
                      ]
                    } • Sleepiness: ${
                      ["Not sleepy", "Slightly", "Sleepy", "Struggling"][
                        activeRecord?.pre_sleep_state?.sleepiness ?? 2
                      ]
                    }`
                  : "Rate daily stress, work satisfaction, pre-sleep state, and food log (~8 taps)."}
              </p>
            </div>
          </div>

          <div className="pt-3">
            <button
              type="button"
              onClick={() => setActiveFlow("evening")}
              className={`w-full py-2.5 rounded-xl font-semibold text-xs transition-all active:scale-[0.98] ${
                isEveningDone
                  ? "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  : "bg-zinc-100 text-black hover:bg-white font-bold"
              }`}
            >
              {isEveningDone ? "Review / Edit Evening Answers ✏" : "Start Evening Check-in →"}
            </button>
          </div>
        </div>
      </div>

      {/* Multi-Log Tool 1: Daytime Event-Driven GI Symptom Tracking */}
      <GITracker
        bloatingEvents={activeRecord?.bloating_events}
        bowelMovements={activeRecord?.bowel_movements}
        onLogBloating={logBloatingEvent}
        onLogBowelMovement={logBowelMovement}
      />

      {/* Multi-Log Tool 2: Timestamp Event Buttons & Quick Actions */}
      <EventButtons />
    </div>
  );
}
