"use client";

import React, { useState } from "react";
import { useStudySession } from "@/context/study-context";
import { MorningCheckin } from "@/components/morning/morning-checkin";
import { MorningRepairCard } from "@/components/morning/morning-repair-card";
import { EveningQuestionnaire } from "@/components/evening/evening-questionnaire";
import { EveningPlanCard } from "@/components/evening/evening-plan-card";
import { PhaseTransitionCard } from "@/components/study/phase-transition-card";
import { EventButtons } from "@/components/evening/event-buttons";
import { GITracker } from "@/components/gi/gi-tracker";
import { DailyRoutineCard } from "@/components/routine/daily-routine-card";
import { ExternalDataCard } from "@/components/data/external-data-card";
import { formatDateKey, formatLocalTime } from "@/lib/engine/protocol-engine";

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
  const activeNightKey = viewContext.todayDateKey;
  const activeRecord = state.records.find((record) => record.date === activeNightKey);
  const tonightDateKey = formatDateKey();
  const tonightRecord = state.records.find((record) => record.date === tonightDateKey);
  const isMorning = viewContext.isMorningWindow;
  const isMorningDone = Boolean(activeRecord?.morning_assessment?.completed_at);
  const isEveningDone = Boolean(
    activeRecord?.daily_context?.completed_at &&
    activeRecord?.pre_sleep_state?.completed_at &&
    activeRecord?.food_log_completeness
  );
  const isProtocolAcknowledged = Boolean(activeRecord?.evening_acknowledged_at);

  if (!isReady) {
    return <div className="flex-1 flex items-center justify-center min-h-[60vh]"><div className="w-6 h-6 border-2 border-zinc-700 border-t-zinc-200 rounded-full animate-spin" /></div>;
  }

  if (activeFlow === "morning") {
    return <MorningCheckin initialData={activeRecord?.morning_assessment} onComplete={() => setActiveFlow(null)} onClose={() => setActiveFlow(null)} />;
  }

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

  return (
    <main className="w-full max-w-md mx-auto px-4 py-6 space-y-6 animate-fade-in pb-24">
      <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
        <span className="uppercase tracking-wider font-semibold text-zinc-300">{isMorning ? "Last night" : activePhase.name}</span>
        <span>VALID {currentPhaseProgress.validNightsLogged} / {activePhase.valid_nights_required}</span>
      </div>

      <DailyRoutineCard />

      {viewContext.context === "phase_transition" ? (
        <PhaseTransitionCard message={viewContext.phaseTransitionMessage} />
      ) : isMorning ? (
        <>
          <section className={`p-4 rounded-2xl border ${isMorningDone ? "border-zinc-900 bg-zinc-950" : "border-amber-500/30 bg-amber-500/5"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><span>🌅</span><h1 className="text-sm font-semibold text-zinc-100">Morning check-in</h1>{isMorningDone && <span className="text-[10px] font-mono text-emerald-400">Done {formatLocalTime(activeRecord?.morning_assessment?.completed_at)}</span>}</div>
                <p className="text-xs text-zinc-400 mt-2">Capture how you feel before reviewing sensor data. The night is filed under {activeNightKey}.</p>
              </div>
            </div>
            <button type="button" onClick={() => setActiveFlow("morning")} className={`w-full mt-3 py-3 rounded-xl text-xs font-semibold ${isMorningDone ? "bg-zinc-900 border border-zinc-800 text-zinc-200" : "bg-amber-300 text-black"}`}>
              {isMorningDone ? "Review / edit answers" : "Start morning check-in"}
            </button>
          </section>

          <MorningRepairCard date={activeNightKey} record={activeRecord} />
          {isMorningDone && <ExternalDataCard date={activeNightKey} record={activeRecord} />}
          {isMorningDone && <EveningPlanCard date={tonightDateKey} record={tonightRecord} />}
        </>
      ) : (
        <>
          <section className="p-5 rounded-2xl border border-zinc-900 bg-zinc-950 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Tonight&apos;s protocol · night {tonightInstruction.nightNumberInPhase}</div>
              {isProtocolAcknowledged && <span className="text-[11px] font-mono text-emerald-400">Ready ✓</span>}
            </div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100 leading-snug">{tonightInstruction.primaryInstruction}</h1>
            {tonightInstruction.secondaryInstruction && <p className="text-xs text-zinc-400">{tonightInstruction.secondaryInstruction}</p>}
            <button type="button" onClick={acknowledgeEveningProtocol} className={`w-full py-2.5 rounded-xl text-xs font-semibold ${isProtocolAcknowledged ? "bg-zinc-900 border border-emerald-500/30 text-emerald-400" : "bg-zinc-100 text-black"}`}>
              {isProtocolAcknowledged ? "Understood & ready ✓" : "Acknowledge instruction"}
            </button>
          </section>

          <EveningPlanCard date={activeNightKey} record={activeRecord} />

          <section className={`p-4 rounded-2xl border ${isEveningDone ? "border-zinc-900 bg-zinc-950" : "border-zinc-800 bg-zinc-950"}`}>
            <div className="flex items-center gap-2"><span>🌙</span><h2 className="text-sm font-semibold text-zinc-100">Evening check-in</h2>{isEveningDone && <span className="text-[10px] font-mono text-emerald-400">Complete ✓</span>}</div>
            <p className="text-xs text-zinc-400 mt-2">Day context, conditional work questions, pre-sleep state, and food-log completeness.</p>
            <button type="button" onClick={() => setActiveFlow("evening")} className="w-full mt-3 py-3 rounded-xl bg-zinc-100 text-black text-xs font-semibold">
              {isEveningDone ? "Review / edit check-in" : "Open compact check-in"}
            </button>
          </section>

          <GITracker bloatingEvents={activeRecord?.bloating_events} bowelMovements={activeRecord?.bowel_movements} onLogBloating={logBloatingEvent} onLogBowelMovement={logBowelMovement} />
          <EventButtons />
        </>
      )}
    </main>
  );
}
