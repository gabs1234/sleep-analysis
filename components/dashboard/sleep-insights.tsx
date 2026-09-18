"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { AppIcon } from "@/components/common/app-icon";
import { useStudySession } from "@/context/study-context";
import { formatDateKey, formatLocalTime } from "@/lib/engine/protocol-engine";

function average(values: Array<number | undefined>): number | undefined {
  const present = values.filter((value): value is number => value !== undefined);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : undefined;
}

function durationLabel(minutes?: number): string {
  if (minutes === undefined) return "—";
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}

export function SleepInsights() {
  const { state, syncWearableForDate, wearableConfig } = useStudySession();
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sleepRecords = useMemo(
    () => [...state.records].filter((record) => record.wearable_data).sort((a, b) => a.date.localeCompare(b.date)),
    [state.records]
  );
  const week = sleepRecords.slice(-7);
  const latest = week.at(-1);
  const averageDuration = average(week.map((record) => record.wearable_data?.duration_minutes));
  const averageEfficiency = average(week.map((record) => record.wearable_data?.sleep_efficiency_pct));
  const averageHrv = average(week.map((record) => record.wearable_data?.hrv_rmssd));

  const sync = async () => {
    setSyncing(true);
    const ok = await syncWearableForDate(formatDateKey());
    setNotice(ok ? "Latest data imported" : "No new data found");
    setSyncing(false);
    window.setTimeout(() => setNotice(null), 3000);
  };

  const canSync = wearableConfig.provider_type !== "manual" && wearableConfig.provider_type !== "mock";

  return (
    <section className="mt-7" aria-labelledby="sleep-patterns-heading">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="app-eyebrow">Last seven nights</p>
          <h2 id="sleep-patterns-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#292824]">Sleep patterns</h2>
        </div>
        <button type="button" onClick={sync} disabled={syncing || !canSync} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#6d55e7] shadow-[0_7px_22px_rgba(38,35,28,0.07)] disabled:opacity-35" aria-label="Refresh wearable data">
          <AppIcon name="activity" size={18} />
        </button>
      </div>

      {notice && <div className="mb-3 rounded-xl bg-[#eef6e9] px-3 py-2 text-center text-xs font-medium text-[#4f7837]">{notice}</div>}

      <div className="grid grid-cols-3 gap-3">
        <InsightMetric label="Avg sleep" value={durationLabel(averageDuration)} accent="text-[#6d55e7]" />
        <InsightMetric label="Efficiency" value={averageEfficiency === undefined ? "—" : `${Math.round(averageEfficiency)}%`} accent="text-[#3475b9]" />
        <InsightMetric label="Avg HRV" value={averageHrv === undefined ? "—" : `${Math.round(averageHrv)} ms`} accent="text-[#2b8053]" />
      </div>

      <div className="mt-3 rounded-[1.55rem] border border-black/[0.05] bg-[#fffff8] p-5 shadow-[0_8px_26px_rgba(38,35,28,0.045)]">
        {week.length >= 3 ? (
          <SleepTrend records={week.map((record) => ({ date: record.date, minutes: record.wearable_data?.duration_minutes || 0 }))} />
        ) : (
          <div className="py-8 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eee9ff] text-[#6848d9]"><AppIcon name="chart" size={20} /></span>
            <h3 className="mt-3 text-sm font-semibold text-[#34322f]">Your weekly pattern will appear here</h3>
            <p className="mx-auto mt-1.5 max-w-[16rem] text-xs leading-relaxed text-[#918d85]">Three nights of sleep data are enough to start seeing a useful trend.</p>
          </div>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-[1.55rem] border border-black/[0.05] bg-white shadow-[0_8px_26px_rgba(38,35,28,0.045)]">
        <div className="flex items-center justify-between border-b border-black/[0.055] px-4 py-3.5">
          <span className="text-xs font-semibold text-[#34322f]">Latest night</span>
          <span className="text-[11px] font-medium text-[#9a968e]">{latest ? new Date(`${latest.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "No data"}</span>
        </div>
        <DetailRow label="Sleep onset" value={latest?.wearable_data?.sleep_onset ? formatLocalTime(latest.wearable_data.sleep_onset) : "—"} />
        <DetailRow label="Final wake" value={latest?.wearable_data?.final_awakening ? formatLocalTime(latest.wearable_data.final_awakening) : "—"} />
        <DetailRow label="Awake during night" value={latest?.wearable_data?.waso_minutes === undefined ? "—" : `${latest.wearable_data.waso_minutes} min`} />
        <DetailRow label="Resting heart rate" value={latest?.wearable_data?.resting_hr === undefined ? "—" : `${latest.wearable_data.resting_hr} bpm`} />
        <DetailRow label="Respiratory rate" value={latest?.wearable_data?.respiratory_rate === undefined ? "—" : `${latest.wearable_data.respiratory_rate} /min`} last />
      </div>

      <Link href="/settings" className="mt-3 flex items-center justify-between rounded-[1.25rem] border border-black/[0.05] bg-white px-4 py-3.5 text-xs font-semibold text-[#4c4943] shadow-sm">
        <span className="flex items-center gap-2"><AppIcon name="settings" size={17} className="text-[#8b75ec]" /> Data sources and connections</span>
        <AppIcon name="chevron-right" size={16} className="text-[#aaa69e]" />
      </Link>
    </section>
  );
}

function InsightMetric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return <div className="rounded-[1.25rem] border border-black/[0.05] bg-white px-3 py-4 shadow-[0_7px_22px_rgba(38,35,28,0.04)]"><div className="text-[10px] font-medium text-[#99958d]">{label}</div><div className={`mt-1.5 text-[15px] font-semibold tracking-[-0.02em] ${accent}`}>{value}</div></div>;
}

function DetailRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return <div className={`flex items-center justify-between px-4 py-3 ${last ? "" : "border-b border-black/[0.055]"}`}><span className="text-xs text-[#77736b]">{label}</span><span className="text-xs font-semibold tabular-nums text-[#34322f]">{value}</span></div>;
}

function SleepTrend({ records }: { records: Array<{ date: string; minutes: number }> }) {
  const values = records.map((record) => record.minutes);
  const target = 480;
  const min = Math.max(0, Math.min(...values, target) - 45);
  const max = Math.max(...values, target) + 45;
  const x = (index: number) => 24 + (index / Math.max(1, records.length - 1)) * 292;
  const y = (value: number) => 155 - ((value - min) / Math.max(1, max - min)) * 110;
  const points = records.map((record, index) => `${x(index)},${y(record.minutes)}`).join(" ");
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const latest = values.at(-1) || 0;
  const finding = latest >= avg ? "Latest sleep is above your weekly average" : "Latest sleep is below your weekly average";

  return (
    <div>
      <h3 className="font-serif text-[17px] font-medium text-[#292824]">{finding}</h3>
      <p className="mt-1 text-[11px] text-[#77736b]">Nightly duration compared with an 8-hour target</p>
      <svg viewBox="0 0 340 210" className="mt-4 block h-auto w-full" role="img" aria-label={`${finding}. Weekly average ${durationLabel(avg)}. Latest night ${durationLabel(latest)}.`}>
        <line x1="24" x2="316" y1={y(target)} y2={y(target)} stroke="#c9c5bd" strokeWidth="1" strokeDasharray="4 4" />
        <text x="316" y={y(target) - 7} textAnchor="end" fill="#77736b" fontSize="10" fontFamily="system-ui, sans-serif">8h target</text>
        <line x1="24" x2="316" y1="155" y2="155" stroke="#d4d0c8" strokeWidth="0.75" />
        <polyline points={points} fill="none" stroke="#66635e" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {records.map((record, index) => (
          <g key={record.date}>
            <circle cx={x(index)} cy={y(record.minutes)} r={index === records.length - 1 ? 4 : 2.5} fill={index === records.length - 1 ? "#6d55e7" : "#66635e"}><title>{`${record.date}: ${durationLabel(record.minutes)}`}</title></circle>
            <text x={x(index)} y="177" textAnchor="middle" fill="#77736b" fontSize="10" fontFamily="system-ui, sans-serif">{new Date(`${record.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "narrow" })}</text>
          </g>
        ))}
        <text x={x(records.length - 1)} y={y(latest) - 10} textAnchor="middle" fill="#4f38b4" fontSize="11" fontFamily="Georgia, serif">{durationLabel(latest)}</text>
      </svg>
    </div>
  );
}
