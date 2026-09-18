"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { AppIcon, AppIconName } from "@/components/common/app-icon";
import { useStudySession } from "@/context/study-context";
import {
  buildFocusedStudyConfig,
  getFocusedStudyId,
  OFFICIAL_PROTOCOL_STRATEGIES,
  ProtocolStrategy,
} from "@/lib/config/study-config";

const strategyPresentation: Record<string, { category: string; summary: string; icon: AppIconName; colors: string }> = {
  baseline: {
    category: "Foundation",
    summary: "Learn what your normal sleep looks like before changing anything.",
    icon: "chart",
    colors: "bg-[#eee9ff] text-[#6848d9]",
  },
  darkness: {
    category: "Environment",
    summary: "Test whether a consistently darker bedroom improves morning readiness.",
    icon: "moon",
    colors: "bg-[#e8e5f7] text-[#5d4e9c]",
  },
  noise: {
    category: "Environment",
    summary: "Compare your usual room with a repeatable noise-reduction setup.",
    icon: "activity",
    colors: "bg-[#e5f0f7] text-[#3475b9]",
  },
  screen_cutoff: {
    category: "Behavior",
    summary: "Find the smallest useful screen-free window before lights-out.",
    icon: "clock",
    colors: "bg-[#fff1ca] text-[#a86d00]",
  },
  structured_winddown: {
    category: "Behavior",
    summary: "See whether a defined 30-minute wind-down helps beyond screen avoidance.",
    icon: "book",
    colors: "bg-[#f3e6dc] text-[#9a5d35]",
  },
  meal_cutoff: {
    category: "Behavior",
    summary: "Test whether finishing food earlier changes sleep and next-day readiness.",
    icon: "coffee",
    colors: "bg-[#f6e8dc] text-[#9b6238]",
  },
  sleep_window_timing: {
    category: "Sleep timing",
    summary: "Compare an earlier and later sleep window at the same duration.",
    icon: "clock",
    colors: "bg-[#e2f1ea] text-[#2b8053]",
  },
  sleep_opportunity: {
    category: "Sleep duration",
    summary: "Find out whether an extra hour available for sleep improves readiness.",
    icon: "moon",
    colors: "bg-[#e7edf8] text-[#486da8]",
  },
  final_protocol_validation: {
    category: "Validation",
    summary: "Compare your optimized routine with your normal practical routine.",
    icon: "spark",
    colors: "bg-[#e9f5df] text-[#4b7b2c]",
  },
};

function labelFromId(value: string): string {
  return value.replaceAll("_", " ");
}

export default function StrategyPage() {
  const {
    isReady,
    config,
    activePhase,
    currentPhaseProgress,
    updateStudyConfig,
  } = useStudySession();
  const initialSelection = OFFICIAL_PROTOCOL_STRATEGIES.some((strategy) => strategy.id === activePhase?.id)
    ? activePhase.id
    : "baseline";
  const [selectedId, setSelectedId] = useState(initialSelection);
  const [notice, setNotice] = useState<string | null>(null);
  const selected = useMemo(
    () => OFFICIAL_PROTOCOL_STRATEGIES.find((strategy) => strategy.id === selectedId) || OFFICIAL_PROTOCOL_STRATEGIES[0],
    [selectedId]
  );
  const activeFocusedId = OFFICIAL_PROTOCOL_STRATEGIES.find(
    (strategy) => config.study_id === getFocusedStudyId(strategy.id)
  )?.id;
  const totalFocusedNights = selected.id === "baseline" ? selected.validNights : selected.validNights + 21;

  const startStrategy = (strategy: ProtocolStrategy) => {
    const focusedConfig = buildFocusedStudyConfig(strategy.id);
    if (!focusedConfig) return;
    const confirmed = window.confirm(
      `Start the ${focusedConfig.study_name}? Your timeline stays intact, and any matching baseline or study nights are retained.`
    );
    if (!confirmed) return;
    updateStudyConfig(focusedConfig, true);
    setNotice(`${focusedConfig.study_name} is now active.`);
    window.setTimeout(() => setNotice(null), 3500);
  };

  if (!isReady) {
    return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-[#d9d5cc] border-t-[#6e55e8]" /></div>;
  }

  return (
    <main className="app-page mx-auto w-full max-w-xl px-5 pb-32 pt-6">
      <header className="mb-6">
        <p className="app-eyebrow">Plan a personal experiment</p>
        <h1 className="mt-1 text-[2rem] font-semibold tracking-[-0.045em] text-[#20201e]">Strategy</h1>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-[#77736b]">Pick one question worth answering. The app will establish a baseline, then guide the selected test night by night.</p>
      </header>

      {notice && <div className="mb-4 rounded-xl bg-[#eef6e9] px-3 py-2.5 text-center text-xs font-semibold text-[#4f7837]">{notice}</div>}

      <section className="rounded-[1.65rem] bg-[#292824] p-5 text-white shadow-[0_16px_38px_rgba(38,35,28,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/50">Active study</p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.025em]">{config.study_name}</h2>
            <p className="mt-1 text-xs leading-relaxed text-white/60">{activePhase.name} · {currentPhaseProgress.validNightsLogged} of {activePhase.valid_nights_required} valid nights</p>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#cbbfff]"><AppIcon name="spark" size={21} /></span>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#a995ff]" style={{ width: `${Math.min(100, currentPhaseProgress.validNightsLogged / Math.max(1, activePhase.valid_nights_required) * 100)}%` }} /></div>
        <Link href="/study" className="mt-4 flex items-center justify-between rounded-xl bg-white/[0.08] px-3.5 py-3 text-xs font-semibold text-white/85">
          Study progress and controls
          <AppIcon name="chevron-right" size={16} />
        </Link>
      </section>

      <section className="mt-8" aria-labelledby="strategy-list-heading">
        <div className="mb-3">
          <p className="app-eyebrow">From your study protocol</p>
          <h2 id="strategy-list-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#292824]">Choose what to test</h2>
        </div>

        <div className="space-y-3">
          {OFFICIAL_PROTOCOL_STRATEGIES.map((strategy) => {
            const presentation = strategyPresentation[strategy.id] || strategyPresentation.baseline;
            const isSelected = selected.id === strategy.id;
            const isActive = activeFocusedId === strategy.id;
            return (
              <div key={strategy.id} className={`overflow-hidden rounded-[1.45rem] border bg-white shadow-[0_7px_22px_rgba(38,35,28,0.04)] transition-colors ${isSelected ? "border-[#8a72ee]/45" : "border-black/[0.05]"}`}>
                <button type="button" onClick={() => setSelectedId(strategy.id)} className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={isSelected}>
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${presentation.colors}`}><AppIcon name={presentation.icon} size={20} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#99958d]">{presentation.category}</span>
                      {isActive && <span className="rounded-full bg-[#e9f5df] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[#4b7b2c]">Active</span>}
                    </span>
                    <span className="mt-0.5 block text-[14px] font-semibold text-[#302e2a]">{strategy.name}</span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-[#8d8981]">{presentation.summary}</span>
                  </span>
                  <AppIcon name="chevron-right" size={17} className={`shrink-0 text-[#aaa69e] transition-transform ${isSelected ? "rotate-90" : ""}`} />
                </button>

                {isSelected && (
                  <div className="border-t border-black/[0.055] bg-[#fbfaf7] px-4 pb-4 pt-3">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#6f6b64] shadow-sm">{strategy.validNights} test nights</span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#6f6b64] shadow-sm">{strategy.conditions.length || 1} condition{strategy.conditions.length === 1 ? "" : "s"}</span>
                      {strategy.id !== "baseline" && <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#6f6b64] shadow-sm">Baseline first</span>}
                    </div>

                    {strategy.rationale && <p className="mt-3 text-[11px] leading-relaxed text-[#77736b]">{strategy.rationale}</p>}
                    {strategy.setupPrompt && (
                      <div className="mt-3 rounded-xl bg-[#eee9ff] px-3 py-2.5">
                        <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#7a65d5]">One-time setup</div>
                        <p className="mt-1 text-[11px] leading-relaxed text-[#57469f]">{strategy.setupPrompt}</p>
                      </div>
                    )}
                    {strategy.conditions.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {strategy.conditions.map((condition, index) => (
                          <div key={condition.id} className="flex gap-2.5 text-[11px] leading-relaxed text-[#77736b]">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[9px] font-bold text-[#6d55e7] shadow-sm">{index + 1}</span>
                            <span>{condition.instruction}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {strategy.holdConstant.length > 0 && (
                      <p className="mt-3 text-[10px] leading-relaxed text-[#99958d]">Keep stable: {strategy.holdConstant.slice(0, 3).map(labelFromId).join(", ")}.</p>
                    )}

                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-black/[0.055] pt-3">
                      <div><div className="text-[10px] text-[#99958d]">Full plan</div><div className="mt-0.5 text-xs font-semibold tabular-nums text-[#34322f]">About {totalFocusedNights} valid nights</div></div>
                      <button type="button" onClick={() => startStrategy(strategy)} disabled={isActive} className="rounded-xl bg-[#6d55e7] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_6px_14px_rgba(84,63,194,0.22)] disabled:bg-[#e9e6df] disabled:text-[#8d8981] disabled:shadow-none">
                        {isActive ? "Current strategy" : "Start strategy"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
