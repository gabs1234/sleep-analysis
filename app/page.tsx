"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { AppIcon } from "@/components/common/app-icon";
import { EveningQuestionnaire } from "@/components/evening/evening-questionnaire";
import { MorningCheckin } from "@/components/morning/morning-checkin";
import { SleepInsights } from "@/components/dashboard/sleep-insights";
import { useStudySession } from "@/context/study-context";
import { buildTimeline } from "@/lib/timeline/timeline-events";
import { formatLocalTime } from "@/lib/engine/protocol-engine";
import { getActiveNightDateKey } from "@/lib/engine/time-context";

const readinessLabels = ["Wrecked", "Sluggish", "Ready", "Sharp"];
const qualityLabels = ["Bad", "Poor", "Good", "Excellent"];

function durationLabel(minutes?: number): string {
  if (!minutes) return "—";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const {
    isReady,
    viewContext,
    tonightInstruction,
    acknowledgeEveningProtocol,
    currentPhaseProgress,
    activePhase,
    state,
    persistenceStatus,
  } = useStudySession();
  const [activeFlow, setActiveFlow] = useState<"morning" | "evening" | null>(null);
  const morningRecord = viewContext.targetNightRecord || undefined;
  const tonightRecord = state.records.find((record) => record.date === getActiveNightDateKey());
  const timeline = useMemo(() => buildTimeline(state.records).slice(0, 3), [state.records]);
  const latestRecord = useMemo(
    () => [...state.records].sort((a, b) => b.date.localeCompare(a.date)).find((record) => record.wearable_data || record.morning_assessment),
    [state.records]
  );
  const sleep = latestRecord?.wearable_data;
  const morning = latestRecord?.morning_assessment;
  const sleepScore = sleep?.duration_minutes
    ? Math.max(0, Math.min(100, Math.round((sleep.duration_minutes / 480) * 100)))
    : morning
      ? Math.round(((morning.readiness + morning.sleep_quality + 2) / 8) * 100)
      : null;
  const isMorningDone = Boolean(morningRecord?.morning_assessment?.completed_at);
  const isEveningDone = Boolean(tonightRecord?.daily_context?.completed_at && tonightRecord?.pre_sleep_state?.completed_at);
  const isProtocolAcknowledged = Boolean(tonightRecord?.evening_acknowledged_at);
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  if (!isReady) {
    return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-[#d9d5cc] border-t-[#6e55e8]" /></div>;
  }

  if (activeFlow === "morning") {
    return <MorningCheckin initialData={morningRecord?.morning_assessment} hasEveningPlan={Boolean(morningRecord?.evening_plan?.length)} onComplete={() => setActiveFlow(null)} onClose={() => setActiveFlow(null)} />;
  }

  if (activeFlow === "evening") {
    return (
      <EveningQuestionnaire
        initialContext={tonightRecord?.daily_context}
        initialPreSleep={tonightRecord?.pre_sleep_state}
        initialCompleteness={tonightRecord?.food_log_completeness}
        initialFallback={tonightRecord?.nutrition_fallback}
        importedFoodCount={tonightRecord?.raw_food_records?.length || 0}
        onComplete={() => setActiveFlow(null)}
        onClose={() => setActiveFlow(null)}
      />
    );
  }

  return (
    <main className="app-page mx-auto w-full max-w-xl px-5 pb-32 pt-6">
      <header className="mb-7 flex items-start justify-between">
        <div>
          <p className="text-[12px] font-medium text-[#8e8a82]">{dateLabel}</p>
          <h1 className="mt-1 text-[2rem] font-semibold tracking-[-0.045em] text-[#20201e]">{greeting()}</h1>
        </div>
        <Link href="/settings" className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#6d55e7] shadow-[0_7px_22px_rgba(38,35,28,0.08)]" aria-label="Open settings"><AppIcon name="moon" size={20} /></Link>
      </header>

      {persistenceStatus.phase === "error" && (
        <div className="mb-4 rounded-2xl border border-[#e9b9b9] bg-[#fff2f2] px-4 py-3 text-xs text-[#9a4747]">Your entries are being kept in local recovery storage. Open Settings for details.</div>
      )}

      <section className="relative overflow-hidden rounded-[2rem] bg-[#6d55e7] p-5 text-white shadow-[0_20px_45px_rgba(84,63,194,0.28)]">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/[0.08]" />
        <div className="absolute -bottom-20 right-14 h-40 w-40 rounded-full bg-[#9b87fa]/40" />
        <div className="relative">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/65">Latest sleep</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[2.6rem] font-semibold leading-none tracking-[-0.06em]">{sleepScore ?? "—"}</span>
                {sleepScore !== null && <span className="text-sm font-medium text-white/60">/ 100</span>}
              </div>
              <p className="mt-2 text-sm font-medium text-white/80">{morning ? `${qualityLabels[morning.sleep_quality]} sleep · ${readinessLabels[morning.readiness]}` : sleep ? "Synced from your wearable" : "Log a morning summary to get started"}</p>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><AppIcon name="moon" size={24} /></span>
          </div>
          <div className="mt-7 grid grid-cols-3 gap-2 border-t border-white/15 pt-4">
            <DashboardMetric label="Duration" value={durationLabel(sleep?.duration_minutes)} />
            <DashboardMetric label="Bedtime" value={sleep?.sleep_onset ? formatLocalTime(sleep.sleep_onset) : "—"} />
            <DashboardMetric label="Efficiency" value={sleep?.sleep_efficiency_pct ? `${Math.round(sleep.sleep_efficiency_pct)}%` : "—"} />
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setActiveFlow("morning")} className="rounded-[1.45rem] border border-black/[0.05] bg-white p-4 text-left shadow-[0_8px_26px_rgba(38,35,28,0.045)]">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fff1ca] text-[#a86d00]"><AppIcon name="sun" size={18} /></span>
          <div className="mt-3 flex items-center justify-between gap-2"><span className="text-[13px] font-semibold text-[#302e2a]">Morning summary</span>{isMorningDone && <span className="h-2 w-2 rounded-full bg-[#68b487]" />}</div>
          <p className="mt-1 text-[11px] text-[#97938b]">{isMorningDone ? "Completed · tap to review" : `${activePhase.name} outcomes`}</p>
        </button>
        <button type="button" onClick={() => setActiveFlow("evening")} className="rounded-[1.45rem] border border-black/[0.05] bg-white p-4 text-left shadow-[0_8px_26px_rgba(38,35,28,0.045)]">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eee9ff] text-[#6848d9]"><AppIcon name="book" size={18} /></span>
          <div className="mt-3 flex items-center justify-between gap-2"><span className="text-[13px] font-semibold text-[#302e2a]">Evening summary</span>{isEveningDone && <span className="h-2 w-2 rounded-full bg-[#68b487]" />}</div>
          <p className="mt-1 text-[11px] text-[#97938b]">{isEveningDone ? "Completed · tap to review" : `${activePhase.name} context`}</p>
        </button>
      </section>

      <SleepInsights />

      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <div><p className="app-eyebrow">Active protocol</p><h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#292824]">Tonight&apos;s focus</h2></div>
          <Link href="/strategy" className="text-[11px] font-semibold text-[#6d55e7]">View strategy</Link>
        </div>
        <div className="rounded-[1.55rem] border border-black/[0.05] bg-white p-4 shadow-[0_8px_26px_rgba(38,35,28,0.045)]">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#e9f5df] text-[#4b7b2c]"><AppIcon name="spark" size={19} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#918d85]">{viewContext.context === "phase_transition" ? "Study complete" : `${activePhase.name} · night ${tonightInstruction.nightNumberInPhase}`}</span><span className="text-[10px] font-semibold text-[#918d85]">{currentPhaseProgress.validNightsLogged}/{activePhase.valid_nights_required}</span></div>
              <h3 className="mt-1.5 text-[14px] font-semibold leading-snug text-[#302e2a]">{viewContext.context === "phase_transition" ? viewContext.phaseTransitionMessage : tonightInstruction.primaryInstruction}</h3>
              {viewContext.context !== "phase_transition" && tonightInstruction.secondaryInstruction && <p className="mt-1 text-[11px] leading-relaxed text-[#8d8981]">{tonightInstruction.secondaryInstruction}</p>}
            </div>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#efede7]"><div className="h-full rounded-full bg-[#8a72ee]" style={{ width: `${Math.min(100, (currentPhaseProgress.validNightsLogged / Math.max(1, activePhase.valid_nights_required)) * 100)}%` }} /></div>
          {viewContext.context !== "phase_transition" && <button type="button" onClick={acknowledgeEveningProtocol} className={`mt-4 w-full rounded-xl py-2.5 text-xs font-semibold ${isProtocolAcknowledged ? "bg-[#eef6e9] text-[#4f7837]" : "bg-[#242320] text-white"}`}>{isProtocolAcknowledged ? "Ready for tonight ✓" : "I’m ready for tonight"}</button>}
        </div>
      </section>

      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between"><div><p className="app-eyebrow">Recent</p><h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#292824]">Your timeline</h2></div><Link href="/log" className="flex items-center gap-1 text-[11px] font-semibold text-[#6d55e7]">See all <AppIcon name="chevron-right" size={14} /></Link></div>
        <div className="overflow-hidden rounded-[1.55rem] border border-black/[0.05] bg-white shadow-[0_8px_26px_rgba(38,35,28,0.045)]">
          {timeline.length > 0 ? timeline.map((item, index) => (
            <div key={item.id} className={`flex items-center gap-3 px-4 py-3.5 ${index > 0 ? "border-t border-black/[0.055]" : ""}`}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#8a72ee]" />
              <div className="min-w-0 flex-1"><div className="truncate text-[12px] font-semibold text-[#34322f]">{item.title}</div><div className="mt-0.5 truncate text-[10px] text-[#99958d]">{item.detail || item.kind}</div></div>
              <time className="text-[10px] font-semibold tabular-nums text-[#aaa69e]">{formatLocalTime(item.timestamp)}</time>
            </div>
          )) : (
            <Link href="/log" className="flex items-center gap-3 px-4 py-5"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eee9ff] text-[#6848d9]"><AppIcon name="plus" size={18} /></span><div><div className="text-[12px] font-semibold text-[#34322f]">Add your first entry</div><div className="mt-0.5 text-[10px] text-[#99958d]">Thoughts, feelings, events and symptoms</div></div></Link>
          )}
        </div>
      </section>
    </main>
  );
}

function DashboardMetric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] font-medium text-white/55">{label}</div><div className="mt-1 text-sm font-semibold tabular-nums text-white">{value}</div></div>;
}
