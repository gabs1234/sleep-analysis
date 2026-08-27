"use client";

import React, { useState } from "react";
import { useStudySession } from "@/context/study-context";
import { EventButtons } from "./event-buttons";

export function EveningProtocol() {
  const {
    tonightInstruction,
    acknowledgeEveningProtocol,
    currentPhaseProgress,
    activePhase,
  } = useStudySession();

  const [acknowledged, setAcknowledged] = useState(false);

  const handleAcknowledge = () => {
    acknowledgeEveningProtocol();
    setAcknowledged(true);
  };

  const isBaseline = tonightInstruction.isBaseline;

  return (
    <div className="w-full max-w-md mx-auto px-4 py-8 space-y-8 animate-fade-in">
      {/* Header & Subtle Phase Night Progress */}
      <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
        <span className="uppercase tracking-wider">TONIGHT&apos;S PROTOCOL</span>
        <span>
          NIGHT {tonightInstruction.nightNumberInPhase} (VALID {currentPhaseProgress.validNightsLogged}/{activePhase.valid_nights_required})
        </span>
      </div>

      {/* Main Instruction Card */}
      <div className="space-y-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100 leading-tight">
            {tonightInstruction.primaryInstruction}
          </h1>

          {tonightInstruction.secondaryInstruction && (
            <p className="text-base text-zinc-400 leading-relaxed">
              {tonightInstruction.secondaryInstruction}
            </p>
          )}
        </div>

        {/* Big Action Acknowledgment Button */}
        <button
          type="button"
          onClick={handleAcknowledge}
          className={`w-full py-4 rounded-xl font-semibold text-base transition-all active:scale-[0.98] ${
            acknowledged
              ? "bg-zinc-800 text-emerald-400 border border-emerald-500/30"
              : "bg-zinc-100 text-black hover:bg-white"
          }`}
        >
          {acknowledged ? "✓ Understood & Ready" : isBaseline ? "Got it" : "Understood"}
        </button>
      </div>

      {/* Timestamp Event Buttons (e.g. Screens off, Meal finished, etc.) */}
      <EventButtons />

      {/* Reassurance Footer */}
      <div className="pt-2 text-center">
        <p className="text-xs text-zinc-400 font-mono">
          Wearable data syncs silently in the background.
        </p>
      </div>
    </div>
  );
}
