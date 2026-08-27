"use client";

import React from "react";
import { useStudySession } from "@/context/study-context";
import { formatDateKey } from "@/lib/engine/protocol-engine";

export function EventButtons() {
  const { tonightInstruction, logEveningAction, state } = useStudySession();
  const todayKey = formatDateKey();
  const todayRecord = state.records.find((r) => r.date === todayKey);

  const actions = tonightInstruction.actions || [];
  if (actions.length === 0) return null;

  return (
    <div className="w-full space-y-3 pt-4 border-t border-zinc-900">
      <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
        <span>EVENT LOGGING</span>
        <span>ONE-TAP TIMESTAMP</span>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {actions.map((act) => {
          const matchingLogs =
            todayRecord?.evening_actions.filter((a) => a.action_id === act.id) || [];
          const latestLog = matchingLogs[matchingLogs.length - 1];

          return (
            <div key={act.id} className="flex flex-col space-y-1">
              <button
                type="button"
                onClick={() => logEveningAction(act.id, act.label)}
                className="w-full flex items-center justify-between p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 hover:border-zinc-700 active:scale-[0.98] transition-all text-left group"
              >
                <div>
                  <div className="text-sm font-semibold text-zinc-100 group-hover:text-white">
                    {act.label}
                  </div>
                  {act.description && (
                    <div className="text-xs text-zinc-400 mt-0.5">
                      {act.description}
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  {latestLog && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {latestLog.timestamp.substring(11, 16)}
                    </span>
                  )}
                  <span className="text-xs font-mono text-zinc-400 group-hover:text-zinc-300">
                    + Log now
                  </span>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
