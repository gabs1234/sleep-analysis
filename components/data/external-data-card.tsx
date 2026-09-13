"use client";

import React, { useState } from "react";
import { useStudySession } from "@/context/study-context";
import { NightRecord } from "@/types/study";
import { formatLocalTime } from "@/lib/engine/protocol-engine";

export function ExternalDataCard({ date, record }: { date: string; record?: NightRecord }) {
  const { syncWearableForDate, wearableConfig } = useStudySession();
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sleep = record?.wearable_data;
  const hasNutritionData = Boolean(
    record?.raw_food_records?.length ||
    record?.missing_eating_events?.length ||
    record?.nutrition_fallback
  );
  const nutrition = hasNutritionData ? record?.derived_nutrition : undefined;

  const sync = async () => {
    setSyncing(true);
    const ok = await syncWearableForDate(date);
    setNotice(ok ? "Data refreshed" : "No new external data found");
    setSyncing(false);
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">External data</div>
          <h2 className="text-sm font-semibold text-zinc-100 mt-1">What the connected sources recorded</h2>
        </div>
        <button type="button" onClick={sync} disabled={syncing || wearableConfig.provider_type === "manual" || wearableConfig.provider_type === "mock"} className="px-2.5 py-1.5 rounded-lg border border-zinc-800 text-[11px] font-mono text-zinc-300 disabled:opacity-40">
          {syncing ? "Syncing…" : "Refresh"}
        </button>
      </div>

      {notice && <div className="text-[11px] font-mono text-zinc-400">{notice}</div>}

      {!sleep && !nutrition ? (
        <p className="text-xs text-zinc-500">No external data has been imported for this night.</p>
      ) : (
        <div className="space-y-3">
          {sleep && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
              <div className="flex justify-between text-[10px] font-mono uppercase text-zinc-500"><span>Sleep</span><span>{sleep.provider} · {sleep.sync_status}</span></div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Metric label="Onset" value={formatLocalTime(sleep.sleep_onset) || "—"} />
                <Metric label="Final wake" value={formatLocalTime(sleep.final_awakening) || "—"} />
                <Metric label="Duration" value={sleep.duration_minutes !== undefined ? `${sleep.duration_minutes} min` : "—"} />
                <Metric label="Efficiency" value={sleep.sleep_efficiency_pct !== undefined ? `${sleep.sleep_efficiency_pct}%` : "—"} />
                <Metric label="WASO" value={sleep.waso_minutes !== undefined ? `${sleep.waso_minutes} min` : "—"} />
                <Metric label="HRV" value={sleep.hrv_rmssd !== undefined ? `${sleep.hrv_rmssd} ms` : "—"} />
                <Metric label="Resting HR" value={sleep.resting_hr !== undefined ? `${sleep.resting_hr} bpm` : "—"} />
                <Metric label="Steps" value={sleep.steps !== undefined ? String(sleep.steps) : "—"} />
              </div>
            </div>
          )}
          {nutrition && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
              <div className="flex justify-between text-[10px] font-mono uppercase text-zinc-500"><span>Nutrition</span><span>{nutrition.data_provenance_summary || "derived"}</span></div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Metric label="Energy" value={`${nutrition.total_calories} kcal`} />
                <Metric label="Protein" value={`${nutrition.total_protein_g} g`} />
                <Metric label="Last calories" value={formatLocalTime(nutrition.final_caloric_timestamp) || "—"} />
                <Metric label="Caffeine" value={`${nutrition.total_caffeine_mg} mg`} />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-black/40 p-2"><div className="text-[10px] text-zinc-500">{label}</div><div className="font-mono text-zinc-200 mt-0.5">{value}</div></div>;
}
