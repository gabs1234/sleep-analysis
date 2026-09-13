"use client";

import React, { useMemo, useState } from "react";
import { useStudySession } from "@/context/study-context";
import { NightRecord, PreSleepState } from "@/types/study";
import { formatLocalTime, timeStringToNightIso } from "@/lib/engine/protocol-engine";

const DEFAULT_EVENTS = [
  { id: "meal_end", label: "Last meal" },
  { id: "screen_end", label: "Active screens done" },
  { id: "winddown_start", label: "Start wind-down" },
  { id: "in_bed_ready", label: "In bed" },
  { id: "lights_out", label: "Lights out" },
];

const AROUSAL = ["Quiet", "Active", "Racing", "Couldn't switch off"];
const SLEEPINESS = ["Not sleepy", "Slightly", "Sleepy", "Struggling"];

export function MorningRepairCard({ date, record }: { date: string; record?: NightRecord }) {
  const { updateNightRecord } = useStudySession();
  const expectedEvents = record?.evening_plan?.length
    ? record.evening_plan.map((item) => ({ id: item.action_id, label: item.action_label }))
    : DEFAULT_EVENTS;
  const missingEvents = expectedEvents.filter(
    (item) => !record?.evening_actions.some((actual) => actual.action_id === item.id)
  );
  const [times, setTimes] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      missingEvents.map((item) => {
        const planned = record?.evening_plan?.find((event) => event.action_id === item.id);
        return [item.id, planned ? formatLocalTime(planned.planned_timestamp) : ""];
      })
    )
  );
  const [notice, setNotice] = useState<string | null>(null);

  const liveMissing = useMemo(
    () => expectedEvents.filter((item) => !record?.evening_actions.some((actual) => actual.action_id === item.id)),
    [expectedEvents, record?.evening_actions]
  );
  const missingPreSleep = record?.pre_sleep_state?.mental_arousal === undefined || record?.pre_sleep_state?.sleepiness === undefined;

  if (liveMissing.length === 0 && !missingPreSleep) return null;

  const saveEvent = (id: string, label: string) => {
    const clock = times[id];
    if (!clock) return;
    const now = new Date().toISOString();
    const otherActions = (record?.evening_actions || []).filter((item) => item.action_id !== id);
    updateNightRecord(date, {
      evening_actions: [
        ...otherActions,
        {
          action_id: id,
          action_label: label,
          timestamp: timeStringToNightIso(clock, date),
          capture_source: "recalled_next_morning",
          captured_at: now,
        },
      ],
    });
    setNotice(`${label} added from memory`);
  };

  const savePreSleep = (updates: Partial<PreSleepState>) => {
    const now = new Date().toISOString();
    updateNightRecord(date, {
      pre_sleep_state: {
        ...record?.pre_sleep_state,
        ...updates,
        completed_at: record?.pre_sleep_state?.completed_at || now,
        capture_source: "recalled_next_morning",
        recalled_at: now,
      },
    });
  };

  return (
    <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 space-y-4">
      <div>
        <div className="text-xs font-mono text-amber-300 uppercase tracking-wider">Fill gaps from last night</div>
        <p className="text-xs text-zinc-400 mt-1">Approximate answers are useful and are saved as recalled, never as live measurements.</p>
      </div>

      {notice && <div className="text-[11px] font-mono text-emerald-400">✓ {notice}</div>}

      {liveMissing.map((item) => {
        const planned = record?.evening_plan?.find((event) => event.action_id === item.id);
        return (
          <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-zinc-200">{item.label}</span>
              {planned && <span className="text-[10px] font-mono text-zinc-500">planned {formatLocalTime(planned.planned_timestamp)}</span>}
            </div>
            <div className="flex gap-2">
              <input
                type="time"
                value={times[item.id] || ""}
                onChange={(event) => setTimes((current) => ({ ...current, [item.id]: event.target.value }))}
                className="min-w-0 flex-1 rounded-lg bg-black border border-zinc-700 px-2.5 py-2 text-sm font-mono text-zinc-100"
              />
              <button type="button" onClick={() => saveEvent(item.id, item.label)} disabled={!times[item.id]} className="px-3 rounded-lg bg-zinc-100 disabled:opacity-40 text-black font-semibold text-xs">
                {planned && times[item.id] === formatLocalTime(planned.planned_timestamp) ? "As planned" : "Add"}
              </button>
            </div>
          </div>
        );
      })}

      {missingPreSleep && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-3">
          <div className="text-xs font-medium text-zinc-200">Remember your pre-sleep state?</div>
          {record?.pre_sleep_state?.mental_arousal === undefined && (
            <div className="grid grid-cols-2 gap-1.5">
              {AROUSAL.map((label, value) => <button key={label} type="button" onClick={() => savePreSleep({ mental_arousal: value })} className="p-2 rounded-lg border border-zinc-800 bg-zinc-900 text-[11px] text-zinc-300">Mind: {label}</button>)}
            </div>
          )}
          {record?.pre_sleep_state?.sleepiness === undefined && (
            <div className="grid grid-cols-2 gap-1.5">
              {SLEEPINESS.map((label, value) => <button key={label} type="button" onClick={() => savePreSleep({ sleepiness: value })} className="p-2 rounded-lg border border-zinc-800 bg-zinc-900 text-[11px] text-zinc-300">Body: {label}</button>)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
