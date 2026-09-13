"use client";

import React, { useMemo, useState } from "react";
import { useStudySession } from "@/context/study-context";
import { NightRecord, PlannedEveningEvent } from "@/types/study";
import { formatLocalTime, timeStringToNightIso } from "@/lib/engine/protocol-engine";
import { EventButtons } from "@/components/evening/event-buttons";

const PLAN_ITEMS = [
  { id: "meal_end", label: "Last meal", offset: -180 },
  { id: "screen_end", label: "Active screens done", offset: -60 },
  { id: "winddown_start", label: "Start wind-down", offset: -45 },
  { id: "in_bed_ready", label: "In bed", offset: -15 },
  { id: "lights_out", label: "Lights out", offset: 0 },
];

function offsetClock(clock: string, offsetMinutes: number): string {
  const [hours, minutes] = clock.split(":").map(Number);
  const total = (hours * 60 + minutes + offsetMinutes + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function EveningPlanCard({ date, record }: { date: string; record?: NightRecord }) {
  const { config, preferences, state, updateNightRecord } = useStudySession();
  const previousPlan = useMemo(
    () =>
      [...state.records]
        .filter((item) => item.date < date && item.evening_plan?.length)
        .sort((a, b) => b.date.localeCompare(a.date))[0]?.evening_plan,
    [date, state.records]
  );

  const initialTimes = useMemo(() => {
    const target = config.target_bedtime || "23:00";
    return Object.fromEntries(
      PLAN_ITEMS.map((item) => {
        const saved = record?.evening_plan?.find((event) => event.action_id === item.id);
        const prior = previousPlan?.find((event) => event.action_id === item.id);
        return [item.id, saved || prior ? formatLocalTime((saved || prior)?.planned_timestamp) : offsetClock(target, item.offset)];
      })
    );
  }, [config.target_bedtime, previousPlan, record?.evening_plan]);

  const [times, setTimes] = useState<Record<string, string>>(initialTimes);
  const [saved, setSaved] = useState(Boolean(record?.evening_plan_completed_at));
  const displayedPlan: PlannedEveningEvent[] = PLAN_ITEMS.map((item) => ({
    action_id: item.id,
    action_label: item.label,
    planned_timestamp: timeStringToNightIso(times[item.id], date),
  }));

  if (!preferences.evening_plan_enabled) return null;

  const savePlan = () => {
    updateNightRecord(date, {
      evening_plan: displayedPlan,
      evening_plan_completed_at: new Date().toISOString(),
    });
    setSaved(true);
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-mono text-violet-300 uppercase tracking-wider">Tonight&apos;s intention</div>
          <h2 className="text-sm font-semibold text-zinc-100 mt-1">Plan while you still have energy</h2>
          <p className="text-xs text-zinc-400 mt-1">These are expectations, not claims about what actually happened.</p>
        </div>
        {saved && <span className="text-[11px] font-mono text-emerald-400">Saved ✓</span>}
      </div>

      <EventButtons
        date={date}
        plannedEvents={displayedPlan}
        onPlannedTimeChange={(actionId, time) => {
          setTimes((current) => ({ ...current, [actionId]: time }));
          setSaved(false);
        }}
        embedded
      />

      <button type="button" onClick={savePlan} className="w-full py-3 rounded-xl bg-violet-200 text-violet-950 font-semibold text-sm active:scale-[0.98] transition-all">
        {saved ? "Save intention changes" : "Save tonight's intentions"}
      </button>
    </section>
  );
}
