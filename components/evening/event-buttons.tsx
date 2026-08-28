"use client";

import React, { useState } from "react";
import { useStudySession } from "@/context/study-context";
import { getActiveNightDateKey } from "@/lib/engine/time-context";
import {
  formatLocalTime,
  createOffsetTimestamp,
  timeStringToIso,
} from "@/lib/engine/protocol-engine";

const CORE_ACTIONS = [
  { id: "work_end", label: "Finished work", description: "End of active work session" },
  { id: "screen_end", label: "Active screens done", description: "Last non-study phone/PC/TV interaction" },
  { id: "winddown_start", label: "Start wind-down", description: "Low-demand pre-sleep period" },
  { id: "in_bed_ready", label: "In bed", description: "In bed, done with normal daytime activity" },
  { id: "lights_out", label: "Lights out", description: "Beginning attempt to fall asleep" },
];

export function EventButtons() {
  const {
    tonightInstruction,
    logEveningAction,
    removeEveningAction,
    logCaffeine,
    logNap,
    state,
  } = useStudySession();

  const activeNightKey = getActiveNightDateKey();
  const activeRecord = state.records.find((r) => r.date === activeNightKey);

  const [activePickerId, setActivePickerId] = useState<string | null>(null);
  const [customTimeInput, setCustomTimeInput] = useState<string>("");
  const [showExtraLoggers, setShowExtraLoggers] = useState(false);
  const [caffeineAmount, setCaffeineAmount] = useState<number>(100);
  const [napDuration, setNapDuration] = useState<number>(30);

  // Merge core actions with protocol-specific actions without duplicates
  const instructionActions = tonightInstruction.actions || [];
  const allActionIds = new Set<string>();
  const mergedActions: Array<{ id: string; label: string; description?: string }> = [];

  for (const act of [...CORE_ACTIONS, ...instructionActions]) {
    if (!allActionIds.has(act.id)) {
      allActionIds.add(act.id);
      mergedActions.push(act);
    }
  }

  const handleQuickOffset = (actId: string, actLabel: string, minutesAgo: number) => {
    const timestamp = createOffsetTimestamp(minutesAgo);
    logEveningAction(actId, actLabel, timestamp);
    setActivePickerId(null);
  };

  const handleCustomTimeSubmit = (actId: string, actLabel: string) => {
    if (!customTimeInput) return;
    const timestamp = timeStringToIso(customTimeInput);
    logEveningAction(actId, actLabel, timestamp);
    setActivePickerId(null);
    setCustomTimeInput("");
  };

  const handleOpenPicker = (actId: string, existingTimestamp?: string) => {
    if (activePickerId === actId) {
      setActivePickerId(null);
    } else {
      setActivePickerId(actId);
      if (existingTimestamp) {
        setCustomTimeInput(formatLocalTime(existingTimestamp));
      } else {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        setCustomTimeInput(`${hh}:${mm}`);
      }
    }
  };

  const handleQuickCaffeine = (mg: number) => {
    const nowIso = new Date().toISOString();
    logCaffeine({
      id: `caff_${Date.now()}`,
      timestamp: nowIso,
      amount_mg: mg,
      source: "manual_quick_button",
    });
    logEveningAction("caffeine", `Caffeine (${mg}mg)`, nowIso);
  };

  const handleQuickNap = (minutes: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - minutes * 60 * 1000);
    logNap({
      id: `nap_${Date.now()}`,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration_minutes: minutes,
      source: "manual",
    });
    logEveningAction("nap", `Nap (${minutes}m)`, end.toISOString());
  };

  return (
    <div className="w-full space-y-3 pt-4 border-t border-zinc-900">
      <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
        <span>TIMESTAMPS &amp; EVENTS</span>
        <span>ONE-TAP LOGGING</span>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {mergedActions.map((act) => {
          const matchingLogs =
            activeRecord?.evening_actions.filter((a) => a.action_id === act.id) || [];
          const latestLog = matchingLogs[matchingLogs.length - 1];
          const isPickerOpen = activePickerId === act.id;

          return (
            <div
              key={act.id}
              className="flex flex-col space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-zinc-100">
                    {act.label}
                  </div>
                  {act.description && (
                    <div className="text-[11px] text-zinc-400">
                      {act.description}
                    </div>
                  )}
                </div>

                {/* Main Action Pill */}
                <div className="flex items-center space-x-1.5">
                  {latestLog ? (
                    <button
                      type="button"
                      onClick={() => handleOpenPicker(act.id, latestLog.timestamp)}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-xs hover:bg-emerald-500/20 transition-all"
                      title="Tap to adjust timestamp"
                    >
                      <span>✓ {formatLocalTime(latestLog.timestamp)}</span>
                      <span className="text-[10px] text-emerald-500/70">✏</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => logEveningAction(act.id, act.label)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-mono text-xs font-medium active:scale-[0.98] transition-all"
                    >
                      + Log now
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleOpenPicker(act.id, latestLog?.timestamp)}
                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-mono transition-all"
                    title="Adjust time or log past time"
                  >
                    🕒
                  </button>
                </div>
              </div>

              {/* Quick Retroactive Time Adjuster Drawer */}
              {isPickerOpen && (
                <div className="pt-2 border-t border-zinc-800/80 space-y-2.5 animate-fade-in">
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                    <span>WHEN DID THIS HAPPEN?</span>
                    {latestLog && (
                      <button
                        type="button"
                        onClick={() => {
                          removeEveningAction(act.id);
                          setActivePickerId(null);
                        }}
                        className="text-rose-400 hover:underline"
                      >
                        Clear entry
                      </button>
                    )}
                  </div>

                  {/* Quick Offset Pills */}
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleQuickOffset(act.id, act.label, 0)}
                      className="py-1.5 px-2 rounded-lg bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-[11px] font-mono text-zinc-200 transition-all text-center"
                    >
                      Just now
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickOffset(act.id, act.label, 30)}
                      className="py-1.5 px-2 rounded-lg bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-[11px] font-mono text-zinc-200 transition-all text-center"
                    >
                      30m ago
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickOffset(act.id, act.label, 60)}
                      className="py-1.5 px-2 rounded-lg bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-[11px] font-mono text-zinc-200 transition-all text-center"
                    >
                      1h ago
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickOffset(act.id, act.label, 120)}
                      className="py-1.5 px-2 rounded-lg bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-[11px] font-mono text-zinc-200 transition-all text-center"
                    >
                      2h ago
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickOffset(act.id, act.label, 180)}
                      className="py-1.5 px-2 rounded-lg bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-[11px] font-mono text-zinc-200 transition-all text-center"
                    >
                      3h ago
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickOffset(act.id, act.label, 240)}
                      className="py-1.5 px-2 rounded-lg bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-[11px] font-mono text-zinc-200 transition-all text-center"
                    >
                      4h ago
                    </button>
                  </div>

                  {/* Specific Exact Time Picker */}
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="time"
                      value={customTimeInput}
                      onChange={(e) => setCustomTimeInput(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                    />
                    <button
                      type="button"
                      onClick={() => handleCustomTimeSubmit(act.id, act.label)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-200 text-black font-semibold font-mono text-xs hover:bg-white transition-all"
                    >
                      Set time
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Optional Caffeine & Nap Loggers Collapsible */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowExtraLoggers(!showExtraLoggers)}
          className="text-xs font-mono text-zinc-400 hover:text-zinc-300 flex items-center space-x-1"
        >
          <span>{showExtraLoggers ? "▼ Hide Caffeine & Nap Loggers" : "+ Log Caffeine / Nap manually"}</span>
        </button>

        {showExtraLoggers && (
          <div className="mt-3 p-3.5 rounded-xl border border-zinc-800 bg-zinc-950 space-y-4 animate-fade-in">
            {/* Quick Caffeine */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-zinc-200 flex items-center justify-between">
                <span>☕ Log Caffeine Intake</span>
                <span className="text-[10px] font-mono text-zinc-400">(if not in MacroFactor)</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[50, 100, 150, 200].map((mg) => (
                  <button
                    key={mg}
                    type="button"
                    onClick={() => handleQuickCaffeine(mg)}
                    className="py-1.5 px-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs font-mono text-zinc-200 text-center transition-all active:scale-[0.98]"
                  >
                    +{mg}mg
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Nap */}
            <div className="space-y-2 pt-2 border-t border-zinc-900">
              <div className="text-xs font-semibold text-zinc-200 flex items-center justify-between">
                <span>😴 Log Daytime Nap</span>
                <span className="text-[10px] font-mono text-zinc-400">(if unrecorded by wearable)</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[20, 30, 60].map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => handleQuickNap(min)}
                    className="py-1.5 px-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs font-mono text-zinc-200 text-center transition-all active:scale-[0.98]"
                  >
                    +{min} min nap
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
