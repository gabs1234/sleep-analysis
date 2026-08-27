"use client";

import React from "react";
import { useStudySession } from "@/context/study-context";

interface PhaseTransitionCardProps {
  message?: string;
}

export function PhaseTransitionCard({ message }: PhaseTransitionCardProps) {
  const { currentPhaseProgress, activePhase } = useStudySession();

  return (
    <div className="w-full max-w-md mx-auto px-4 py-12 space-y-8 animate-fade-in text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-3xl font-bold border border-emerald-500/20 mx-auto">
        ✓
      </div>

      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          Phase Complete
        </h1>
        <p className="text-sm text-zinc-400 max-w-xs mx-auto leading-relaxed">
          {message ||
            activePhase.next_phase_prep_instruction ||
            "Tomorrow begins the next part of the study. No action required tonight."}
        </p>
      </div>

      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 text-xs font-mono text-zinc-400">
        VALID NIGHTS COMPLETED: {currentPhaseProgress.validNightsLogged} /{" "}
        {currentPhaseProgress.validNightsRequired}
      </div>
    </div>
  );
}
