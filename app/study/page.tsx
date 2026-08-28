"use client";

import React, { useState } from "react";
import { useStudySession } from "@/context/study-context";
import {
  generateStudyJSON,
  generateStudyCSV,
  generateRawFoodRecordsCSV,
  generateRawGISymptomsCSV,
  downloadFile,
} from "@/lib/storage/data-export";
import { AdherenceCalendar } from "@/components/study/adherence-calendar";

export default function StudyPage() {
  const {
    config,
    state,
    activePhase,
    currentPhaseProgress,
    allPhaseProgresses,
    setStudyStatus,
  } = useStudySession();

  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const handleExportJSON = () => {
    const jsonStr = generateStudyJSON(config, state);
    downloadFile(
      `${config.study_id}_export_${new Date().toISOString().substring(0, 10)}.json`,
      jsonStr,
      "application/json"
    );
    setExportNotice("Exported full study JSON bundle");
    setTimeout(() => setExportNotice(null), 3000);
  };

  const handleExportDailyCSV = () => {
    const csvStr = generateStudyCSV(config, state);
    downloadFile(
      `${config.study_id}_daily_summary_${new Date().toISOString().substring(0, 10)}.csv`,
      csvStr,
      "text/csv"
    );
    setExportNotice("Exported daily summary CSV");
    setTimeout(() => setExportNotice(null), 3000);
  };

  const handleExportRawFoodCSV = () => {
    const csvStr = generateRawFoodRecordsCSV(state);
    downloadFile(
      `${config.study_id}_raw_food_records_${new Date().toISOString().substring(0, 10)}.csv`,
      csvStr,
      "text/csv"
    );
    setExportNotice("Exported raw food stream CSV");
    setTimeout(() => setExportNotice(null), 3000);
  };

  const handleExportRawGICSV = () => {
    const csvStr = generateRawGISymptomsCSV(state);
    downloadFile(
      `${config.study_id}_raw_gi_symptoms_${new Date().toISOString().substring(0, 10)}.csv`,
      csvStr,
      "text/csv"
    );
    setExportNotice("Exported raw GI symptoms CSV");
    setTimeout(() => setExportNotice(null), 3000);
  };

  const togglePause = () => {
    const nextStatus = state.status === "paused" ? "active" : "paused";
    setStudyStatus(nextStatus);
  };

  const startDateFormatted = state.started_at
    ? new Date(state.started_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not started";

  return (
    <div className="w-full max-w-md mx-auto px-4 py-8 space-y-8 animate-fade-in pb-20">
      {/* Header */}
      <div className="space-y-1">
        <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
          PROTOCOL STATUS
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          {config.study_name}
        </h1>
      </div>

      {/* Sparse Study Metadata (Blinded) */}
      <div className="p-5 rounded-2xl border border-zinc-900 bg-zinc-950 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
          <span className="text-xs font-mono text-zinc-400">STUDY STATUS</span>
          <span
            className={`text-xs font-mono px-2 py-0.5 rounded capitalize ${
              state.status === "active"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : state.status === "paused"
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : "bg-zinc-800 text-zinc-400"
            }`}
          >
            {state.status}
          </span>
        </div>

        <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
          <span className="text-xs font-mono text-zinc-400">CURRENT PHASE</span>
          <span className="text-sm font-semibold text-zinc-100">
            Phase {state.current_phase_index + 1} of {config.phases.length} ({activePhase.name})
          </span>
        </div>

        <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
          <span className="text-xs font-mono text-zinc-400">VALID NIGHTS</span>
          <span className="text-sm font-mono font-bold text-zinc-100">
            {currentPhaseProgress.validNightsLogged} / {currentPhaseProgress.validNightsRequired}
          </span>
        </div>

        {currentPhaseProgress.excludedNightsCount > 0 && (
          <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
            <span className="text-xs font-mono text-zinc-400">EXCLUDED NIGHTS</span>
            <span className="text-xs font-mono text-zinc-400">
              {currentPhaseProgress.excludedNightsCount} (phase extended automatically)
            </span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-zinc-400">STUDY STARTED</span>
          <span className="text-xs font-mono text-zinc-300">
            {startDateFormatted}
          </span>
        </div>
      </div>

      {/* GitHub / MacroFactor Style Adherence Heatmap & Amendment */}
      <AdherenceCalendar />

      {/* Phase Roadmap Overview */}
      <div className="space-y-3">
        <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
          ALL PHASES
        </div>
        <div className="space-y-2">
          {config.phases.map((phase, idx) => {
            const prog = allPhaseProgresses[idx];
            const isCurrent = idx === state.current_phase_index;
            const isDone = prog?.isComplete;

            return (
              <div
                key={phase.id}
                className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                  isCurrent
                    ? "border-zinc-700 bg-zinc-900/70 text-zinc-100"
                    : isDone
                    ? "border-zinc-900 bg-zinc-950/50 text-zinc-400"
                    : "border-zinc-900/60 bg-zinc-950/20 text-zinc-600"
                }`}
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold">
                    {idx + 1}. {phase.name}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-400">
                    {phase.type} • {phase.valid_nights_required} valid nights
                  </div>
                </div>

                <div className="text-xs font-mono">
                  {isDone ? (
                    <span className="text-emerald-400">Complete ✓</span>
                  ) : isCurrent ? (
                    <span className="text-zinc-200">
                      {prog?.validNightsLogged || 0}/{phase.valid_nights_required}
                    </span>
                  ) : (
                    <span className="text-zinc-600">Pending</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Data Export & Control Actions */}
      <div className="space-y-3 pt-2">
        <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
          DATA EXPORT &amp; CONTROLS
        </div>

        <button
          type="button"
          onClick={togglePause}
          className="w-full py-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-xs font-mono text-zinc-300 active:scale-[0.98] transition-all"
        >
          {state.status === "paused" ? "▶ Resume study" : "⏸ Pause study"}
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleExportDailyCSV}
            className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-left text-xs transition-all active:scale-[0.98]"
          >
            <div className="font-semibold text-zinc-200">⬇ Daily Summary CSV</div>
            <div className="text-[10px] text-zinc-400 mt-0.5">Context, sleep &amp; outcomes</div>
          </button>

          <button
            type="button"
            onClick={handleExportRawFoodCSV}
            className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-left text-xs transition-all active:scale-[0.98]"
          >
            <div className="font-semibold text-zinc-200">⬇ Raw Food CSV</div>
            <div className="text-[10px] text-zinc-400 mt-0.5">MacroFactor items &amp; timestamps</div>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleExportRawGICSV}
            className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-left text-xs transition-all active:scale-[0.98]"
          >
            <div className="font-semibold text-zinc-200">⬇ Raw GI Symptoms CSV</div>
            <div className="text-[10px] text-zinc-400 mt-0.5">Bloating &amp; Bristol bowel logs</div>
          </button>

          <button
            type="button"
            onClick={handleExportJSON}
            className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-left text-xs transition-all active:scale-[0.98]"
          >
            <div className="font-semibold text-zinc-200">⬇ Full JSON Bundle</div>
            <div className="text-[10px] text-zinc-400 mt-0.5">Complete raw backup</div>
          </button>
        </div>

        {exportNotice && (
          <p className="text-center text-xs font-mono text-emerald-400 animate-fade-in pt-1">
            ✓ {exportNotice}
          </p>
        )}
      </div>

      {/* Scientific Blinding Notice */}
      <div className="p-4 rounded-xl border border-zinc-900 bg-zinc-950/40 text-center">
        <p className="text-[11px] text-zinc-400 font-mono leading-relaxed">
          Active results and condition comparisons remain blinded during the study to avoid expectancy bias.
        </p>
      </div>
    </div>
  );
}
