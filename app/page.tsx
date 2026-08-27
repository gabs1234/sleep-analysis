"use client";

import React, { useState } from "react";
import { useStudySession } from "@/context/study-context";
import { MorningCheckin } from "@/components/morning/morning-checkin";
import { EveningProtocol } from "@/components/evening/evening-protocol";
import { PhaseTransitionCard } from "@/components/study/phase-transition-card";
import { EventButtons } from "@/components/evening/event-buttons";

export default function HomePage() {
  const {
    isReady,
    viewContext,
    tonightInstruction,
    currentPhaseProgress,
    activePhase,
  } = useStudySession();

  const [overrideShowMorning, setOverrideShowMorning] = useState(false);

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

  // Active Morning Checkin
  if (viewContext.context === "morning_checkin" || overrideShowMorning) {
    return (
      <MorningCheckin
        onComplete={() => {
          setOverrideShowMorning(false);
        }}
      />
    );
  }

  // Evening Protocol
  if (viewContext.context === "evening_protocol") {
    return <EveningProtocol />;
  }

  // All Done for Today
  return (
    <div className="w-full max-w-md mx-auto px-4 py-12 space-y-8 animate-fade-in">
      {/* Status Pill */}
      <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
        <span className="uppercase tracking-wider">{activePhase.name}</span>
        <span>
          VALID {currentPhaseProgress.validNightsLogged} / {activePhase.valid_nights_required}
        </span>
      </div>

      {/* Done Card */}
      <div className="flex flex-col items-center justify-center py-10 px-6 text-center space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-2xl font-bold border border-emerald-500/20">
          ✓
        </div>
        <div className="space-y-1.5">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
            All done for today
          </h2>
          <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
            Tonight: {tonightInstruction.primaryInstruction}
          </p>
        </div>
      </div>

      {/* Optional Event Buttons if any exist for tonight */}
      <EventButtons />

      {/* Quick Access to Morning checkin if need to redo */}
      <div className="pt-4 flex justify-center">
        <button
          type="button"
          onClick={() => setOverrideShowMorning(true)}
          className="text-xs font-mono text-zinc-400 hover:text-zinc-400 underline decoration-zinc-700 transition-colors"
        >
          Redo morning check-in
        </button>
      </div>
    </div>
  );
}
