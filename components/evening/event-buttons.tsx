"use client";

import React, { useState } from "react";
import { useStudySession } from "@/context/study-context";
import { getActiveNightDateKey } from "@/lib/engine/time-context";
import {
  formatLocalTime,
  createOffsetTimestamp,
  timeStringToIso,
} from "@/lib/engine/protocol-engine";

export function EventButtons() {
  const { tonightInstruction, logEveningAction, removeEveningAction, state } = useStudySession();
  const activeNightKey = getActiveNightDateKey();
  const activeRecord = state.records.find((r) => r.date === activeNightKey);

  const [activePickerId, setActivePickerId] = useState<string | null>(null);
  const [customTimeInput, setCustomTimeInput] = useState<string>("");

  const actions = tonightInstruction.actions || [];
  if (actions.length === 0) return null;

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

  return (
    <div className="w-full space-y-3 pt-4 border-t border-zinc-900">
      <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
        <span>EVENT LOGGING</span>
        <span>ONE-TAP TIMESTAMP</span>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {actions.map((act) => {
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
    </div>
  );
}
