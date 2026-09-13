"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalDataCard } from "@/components/data/external-data-card";
import { useStudySession } from "@/context/study-context";
import { formatDateKey } from "@/lib/engine/protocol-engine";

function shiftDate(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

export default function DataPage() {
  const { isReady, state, wearableConfig } = useStudySession();
  const defaultDate = useMemo(() => {
    const records = [...state.records].sort((a, b) => b.date.localeCompare(a.date));
    const latestExternal = records.find((record) => record.wearable_data || record.derived_nutrition);
    return latestExternal?.date || records[0]?.date || formatDateKey();
  }, [state.records]);
  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const selectedDate = chosenDate || defaultDate;
  const selectedRecord = state.records.find((record) => record.date === selectedDate);
  const recentExternalDates = useMemo(
    () => [...state.records]
      .filter((record) => record.wearable_data || record.derived_nutrition)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 7),
    [state.records]
  );
  const sourceLabel = wearableConfig.provider_type === "google_health"
    ? "Google Health Connect"
    : wearableConfig.provider_type === "fitbit"
      ? "Fitbit"
      : wearableConfig.provider_type === "mock"
        ? "Mock data"
        : "Manual import";

  if (!isReady) {
    return <div className="flex min-h-[60vh] flex-1 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-200" /></div>;
  }

  return (
    <main className="w-full max-w-md mx-auto px-4 py-8 space-y-6 animate-fade-in pb-24">
      <header className="space-y-1">
        <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Measurements</div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">External data</h1>
        <p className="text-xs text-zinc-400">
          Imported and derived measurements stay separate from your blinded morning answers.
        </p>
      </header>

      <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setChosenDate(shiftDate(selectedDate, -1))}
            className="h-10 w-10 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300"
            aria-label="Previous day"
          >
            ←
          </button>
          <label className="flex-1">
            <span className="sr-only">Measurement date</span>
            <input
              type="date"
              value={selectedDate}
              max={formatDateKey()}
              onChange={(event) => setChosenDate(event.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-center text-sm font-mono text-zinc-100"
            />
          </label>
          <button
            type="button"
            onClick={() => setChosenDate(shiftDate(selectedDate, 1))}
            disabled={selectedDate >= formatDateKey()}
            className="h-10 w-10 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 disabled:opacity-30"
            aria-label="Next day"
          >
            →
          </button>
        </div>

        {recentExternalDates.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {recentExternalDates.map((record) => (
              <button
                key={record.date}
                type="button"
                onClick={() => setChosenDate(record.date)}
                className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-mono ${
                  record.date === selectedDate
                    ? "border-zinc-300 bg-zinc-200 text-black"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400"
                }`}
              >
                {new Date(`${record.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </button>
            ))}
          </div>
        )}
      </section>

      <ExternalDataCard date={selectedDate} record={selectedRecord} />

      <section className="rounded-xl border border-zinc-900 bg-zinc-950/60 p-3 text-xs text-zinc-400">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium text-zinc-200">Source: {sourceLabel}</div>
            <div className="mt-0.5 text-[11px]">Connections, API credentials, and sync behavior live in Settings.</div>
          </div>
          <Link href="/settings" className="shrink-0 rounded-lg border border-zinc-800 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300">
            Settings
          </Link>
        </div>
      </section>
    </main>
  );
}
