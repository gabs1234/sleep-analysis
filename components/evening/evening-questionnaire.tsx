"use client";

import React, { useMemo, useState } from "react";
import { useStudySession } from "@/context/study-context";
import { DailySubjectiveContext, PreSleepState } from "@/types/study";
import { DailyNutritionFallback, FoodLogCompleteness, GIExposureCategory } from "@/types/nutrition";
import { GI_EXPOSURE_CATEGORIES } from "@/lib/nutrition/nutrition-service";
import { getActiveNightDateKey } from "@/lib/engine/time-context";

interface EveningQuestionnaireProps {
  initialContext?: DailySubjectiveContext;
  initialPreSleep?: PreSleepState;
  initialCompleteness?: FoodLogCompleteness;
  initialFallback?: DailyNutritionFallback;
  importedFoodCount?: number;
  onComplete?: () => void;
  onClose?: () => void;
}

const DAY_TYPES: Array<{ value: NonNullable<DailySubjectiveContext["day_type"]>; label: string }> = [
  { value: "regular", label: "Regular" },
  { value: "business_trip", label: "Business trip" },
  { value: "vacation", label: "Vacation" },
  { value: "sick_day", label: "Sick day" },
  { value: "day_off", label: "Day off" },
  { value: "other", label: "Other" },
];

const RATING_ROWS: Array<{
  key: keyof DailySubjectiveContext;
  label: string;
  options: string[];
  onlyWhenWorked?: boolean;
}> = [
  { key: "overall_stress", label: "Overall stress", options: ["Relaxed", "Mild", "Stressed", "Very"] },
  { key: "work_stress", label: "Work stress", options: ["Calm", "Mild", "Stressed", "Overwhelming"], onlyWhenWorked: true },
  { key: "work_satisfaction", label: "Work felt", options: ["Bad", "Frustrating", "Fine", "Satisfying"], onlyWhenWorked: true },
  { key: "meaningful_social_contact", label: "Meaningful contact", options: ["None", "Brief", "Some", "Substantial"] },
  { key: "routine_adherence", label: "Normal routine", options: ["Fell apart", "Partial", "Mostly", "Complete"] },
  { key: "eating_out_of_control", label: "Eating control", options: ["Normal", "Somewhat off", "Out of control"] },
];

const MENTAL_OPTIONS = ["Quiet", "Active", "Racing", "Can't switch off"];
const SLEEPINESS_OPTIONS = ["Not sleepy", "Slightly", "Sleepy", "Struggling"];

export function EveningQuestionnaire({
  initialContext,
  initialPreSleep,
  initialCompleteness,
  initialFallback,
  importedFoodCount = 0,
  onComplete,
  onClose,
}: EveningQuestionnaireProps) {
  const {
    preferences,
    saveDailyContext,
    savePreSleepState,
    saveFoodLogCompleteness,
    saveDailyNutritionFallback,
  } = useStudySession();
  const nightDate = getActiveNightDateKey();
  const weekday = new Date(`${nightDate}T12:00:00`).getDay();
  const scheduledWorkday = preferences.work_days.includes(weekday);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [context, setContext] = useState<DailySubjectiveContext>(() => ({
    scheduled_workday: initialContext?.scheduled_workday ?? scheduledWorkday,
    did_work: initialContext?.did_work,
    day_type: initialContext?.day_type || "regular",
    timezone: initialContext?.timezone || timezone,
    ...initialContext,
  }));
  const [preSleep, setPreSleep] = useState<PreSleepState>(() => initialPreSleep || {});
  const [completeness, setCompleteness] = useState<FoodLogCompleteness | undefined>(initialCompleteness);
  const [fallbackIntake, setFallbackIntake] = useState(initialFallback?.intake_relative_to_intent ?? 2);
  const [fallbackExposures, setFallbackExposures] = useState<GIExposureCategory[]>(initialFallback?.notable_exposures || []);
  const [error, setError] = useState<string | null>(null);

  const visibleRatings = useMemo(
    () => RATING_ROWS.filter((row) => !row.onlyWhenWorked || context.did_work),
    [context.did_work]
  );

  const setContextValue = (key: keyof DailySubjectiveContext, value: DailySubjectiveContext[keyof DailySubjectiveContext]) => {
    setContext((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const toggleExposure = (value: GIExposureCategory) => {
    setFallbackExposures((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  const save = () => {
    const requiredContextComplete =
      context.did_work !== undefined &&
      context.overall_stress !== undefined &&
      context.meaningful_social_contact !== undefined &&
      context.routine_adherence !== undefined &&
      context.eating_out_of_control !== undefined &&
      (!context.did_work || (context.work_stress !== undefined && context.work_satisfaction !== undefined));
    const preSleepComplete = preSleep.mental_arousal !== undefined && preSleep.sleepiness !== undefined;
    if (!requiredContextComplete || !preSleepComplete || !completeness) {
      setError("Complete the unanswered items before saving. Your selections will stay on this screen.");
      return;
    }

    const now = new Date().toISOString();
    saveDailyContext({
      ...context,
      work_stress: context.did_work ? context.work_stress : undefined,
      work_satisfaction: context.did_work ? context.work_satisfaction : -1,
      completed_at: now,
    });
    savePreSleepState({ ...preSleep, capture_source: "live", completed_at: now });
    saveFoodLogCompleteness(completeness);
    if (completeness !== "yes") {
      saveDailyNutritionFallback({
        ...initialFallback,
        completed_at: now,
        intake_relative_to_intent: fallbackIntake,
        notable_exposures: fallbackExposures,
        source: "manual_approximate",
      });
    }
    onComplete?.();
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 py-6 space-y-5 animate-fade-in pb-24">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-mono text-emerald-400 uppercase tracking-wider">Evening check-in</div>
          <h1 className="text-2xl font-semibold text-zinc-100 mt-1">A quick picture of today</h1>
        </div>
        {onClose && <button type="button" onClick={onClose} className="p-2 text-zinc-500 hover:text-zinc-200" aria-label="Close">✕</button>}
      </div>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">What kind of day was it?</h2>
          <p className="text-xs text-zinc-400 mt-1">Travel is ordinary context and does not invalidate the night.</p>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {DAY_TYPES.map((item) => <Choice key={item.value} selected={context.day_type === item.value} onClick={() => setContextValue("day_type", item.value)}>{item.label}</Choice>)}
        </div>
        <div className="rounded-xl bg-zinc-900/50 border border-zinc-800 p-3 space-y-2">
          <div className="text-xs text-zinc-200">
            {scheduledWorkday ? "This is normally a workday. Did you work?" : "This is normally a day off. Did you work anyway?"}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Choice selected={context.did_work === true} onClick={() => setContextValue("did_work", true)}>Yes, worked</Choice>
            <Choice selected={context.did_work === false} onClick={() => setContextValue("did_work", false)}>No work</Choice>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-100">Day in a few taps</h2>
        {visibleRatings.map((row) => {
          const value = context[row.key] as number | undefined;
          return (
            <div key={row.key} className="space-y-1.5">
              <div className="text-xs text-zinc-300">{row.label}</div>
              <div className={`grid gap-1.5 ${row.options.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
                {row.options.map((label, index) => <Choice key={label} selected={value === index} onClick={() => setContextValue(row.key, index)}>{label}</Choice>)}
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Pre-sleep state</h2>
          <p className="text-xs text-zinc-400 mt-1">If you are not near sleep yet, close this and answer later—or reconstruct it tomorrow.</p>
        </div>
        <Rating label="Mind" options={MENTAL_OPTIONS} value={preSleep.mental_arousal} onChange={(value) => setPreSleep((current) => ({ ...current, mental_arousal: value }))} />
        <Rating label="Sleepiness" options={SLEEPINESS_OPTIONS} value={preSleep.sleepiness} onChange={(value) => setPreSleep((current) => ({ ...current, sleepiness: value }))} />
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-4">
        <div className="flex justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-100">Food log completeness</h2>
          {importedFoodCount > 0 && <span className="text-[10px] font-mono text-emerald-400">{importedFoodCount} imported</span>}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <Choice selected={completeness === "yes"} onClick={() => setCompleteness("yes")}>Complete</Choice>
          <Choice selected={completeness === "mostly"} onClick={() => setCompleteness("mostly")}>Mostly</Choice>
          <Choice selected={completeness === "no"} onClick={() => setCompleteness("no")}>Not logged</Choice>
        </div>
        {completeness && completeness !== "yes" && (
          <div className="space-y-3 pt-2 border-t border-zinc-800">
            <Rating label="Intake versus intention" options={["Light", "Normal", "Heavy", "Very heavy"]} value={Math.max(0, fallbackIntake - 1)} onChange={(value) => setFallbackIntake(value + 1)} />
            <div className="grid grid-cols-2 gap-1.5">
              {GI_EXPOSURE_CATEGORIES.slice(0, 8).map((item) => <Choice key={item.key} selected={fallbackExposures.includes(item.key)} onClick={() => toggleExposure(item.key)}>{item.label}</Choice>)}
            </div>
          </div>
        )}
      </section>

      {error && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">{error}</div>}
      <button type="button" onClick={save} className="w-full py-3.5 rounded-xl bg-zinc-100 text-black font-semibold text-sm active:scale-[0.98] transition-all">Save evening check-in</button>
    </div>
  );
}

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`min-h-10 px-2 py-2 rounded-lg border text-[11px] font-medium transition-all active:scale-[0.98] ${selected ? "bg-zinc-100 border-white text-black" : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800"}`}>{children}</button>;
}

function Rating({ label, options, value, onChange }: { label: string; options: string[]; value?: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-zinc-300">{label}</div>
      <div className={`grid gap-1.5 ${options.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
        {options.map((option, index) => <Choice key={option} selected={value === index} onClick={() => onChange(index)}>{option}</Choice>)}
      </div>
    </div>
  );
}
