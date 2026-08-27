"use client";

import React, { useState } from "react";
import { useStudySession } from "@/context/study-context";
import { WakeReason, ProtocolAdherence, UnusualNightReason } from "@/types/study";

interface MorningCheckinProps {
  onComplete?: () => void;
}

const READINESS_OPTIONS = [
  { value: 0, label: "0 — Wrecked", description: "Exhausted, brain fog, struggling" },
  { value: 1, label: "1 — Sluggish", description: "Low energy, slow to start" },
  { value: 2, label: "2 — Ready", description: "Normal baseline, alert and functional" },
  { value: 3, label: "3 — Sharp", description: "Optimal energy, fully refreshed" },
];

const SLEEP_QUALITY_OPTIONS = [
  { value: 0, label: "0 — Bad", description: "Restless, fragmented, unrefreshing" },
  { value: 1, label: "1 — Poor", description: "Below average, woke multiple times" },
  { value: 2, label: "2 — Good", description: "Solid, continuous, sound sleep" },
  { value: 3, label: "3 — Excellent", description: "Deep, unbroken, deeply restorative" },
];

const WAKE_REASON_OPTIONS: Array<{ value: WakeReason; label: string }> = [
  { value: "natural", label: "Natural awakening" },
  { value: "alarm", label: "Alarm" },
  { value: "light", label: "Light" },
  { value: "noise", label: "Noise" },
  { value: "other", label: "Other / unsure" },
];

const UNUSUAL_TAGS: Array<{ value: UnusualNightReason; label: string }> = [
  { value: "illness", label: "Illness / fever" },
  { value: "alcohol", label: "Alcohol" },
  { value: "caffeine", label: "Unusual caffeine" },
  { value: "travel", label: "Travel / different bed" },
  { value: "stress", label: "Unusual stress" },
  { value: "exercise", label: "Hard late exercise" },
  { value: "interruption", label: "Unusual interruption" },
  { value: "other", label: "Other abnormal factor" },
];

export function MorningCheckin({ onComplete }: MorningCheckinProps) {
  const { activePhase, submitMorningAssessment } = useStudySession();

  const [step, setStep] = useState<number>(1);
  const [readiness, setReadiness] = useState<number | null>(null);
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);
  const [wakeReason, setWakeReason] = useState<WakeReason | null>(null);
  const [adherence, setAdherence] = useState<ProtocolAdherence | null>(null);
  const [adherenceNote, setAdherenceNote] = useState<string>("");
  const [isUnusual, setIsUnusual] = useState<boolean | null>(null);
  const [unusualReasons, setUnusualReasons] = useState<UnusualNightReason[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const hasIntervention = activePhase.type === "randomized_experiment";

  // Step 1: Readiness Selected
  const handleReadinessSelect = (val: number) => {
    setReadiness(val);
    setStep(2);
  };

  // Step 2: Sleep Quality Selected
  const handleSleepQualitySelect = (val: number) => {
    setSleepQuality(val);
    setStep(3);
  };

  // Step 3: Wake Reason Selected
  const handleWakeReasonSelect = (val: WakeReason) => {
    setWakeReason(val);
    if (hasIntervention) {
      setStep(4);
    } else {
      setStep(5);
    }
  };

  // Step 4: Adherence Selected (if applicable)
  const handleAdherenceSelect = (val: ProtocolAdherence) => {
    setAdherence(val);
    if (val === "yes") {
      setStep(5);
    }
  };

  // Step 5: Unusual Night Handling
  const handleUnusualDecision = async (unusual: boolean) => {
    setIsUnusual(unusual);
    if (!unusual) {
      // Direct completion
      await finishAssessment(unusual, []);
    }
  };

  const toggleUnusualReason = (reason: UnusualNightReason) => {
    setUnusualReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  };

  const handleFinishUnusual = async () => {
    await finishAssessment(true, unusualReasons);
  };

  const finishAssessment = async (
    unusualFlag: boolean,
    tags: UnusualNightReason[]
  ) => {
    if (readiness === null || sleepQuality === null || wakeReason === null) return;
    setIsSubmitting(true);
    try {
      await submitMorningAssessment({
        readiness,
        sleep_quality: sleepQuality,
        wake_reason: wakeReason,
        protocol_adherence: adherence || undefined,
        adherence_note: adherenceNote.trim() || undefined,
        unusual_night: unusualFlag,
        unusual_reasons: tags.length > 0 ? tags : undefined,
      });
      setIsDone(true);
      if (onComplete) onComplete();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isDone) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-6 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-3xl font-bold border border-emerald-500/20">
          ✓
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
            All done for today
          </h2>
          <p className="text-sm text-zinc-400 max-w-xs mx-auto">
            Morning assessment recorded. Wearable sync active in background.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto px-4 py-8 space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center justify-between text-xs text-zinc-400 font-mono tracking-wider">
        <span>MORNING CHECK-IN</span>
        <span>
          STEP {step} OF {hasIntervention ? 5 : 4}
        </span>
      </div>

      {/* Step 1: Readiness */}
      {step === 1 && (
        <div className="space-y-6 animate-fade-in">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              How ready do you feel?
            </h1>
            <p className="text-sm text-zinc-400">
              Tap the option matching your physical and mental alertness.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {READINESS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleReadinessSelect(opt.value)}
                className="flex flex-col items-start p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 hover:border-zinc-700 active:scale-[0.98] transition-all text-left group"
              >
                <span className="text-lg font-medium text-zinc-100 group-hover:text-white">
                  {opt.label}
                </span>
                <span className="text-xs text-zinc-400 mt-1">
                  {opt.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Sleep Quality */}
      {step === 2 && (
        <div className="space-y-6 animate-fade-in">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              How did the sleep itself feel?
            </h1>
            <p className="text-sm text-zinc-400">
              Rate the overall quality and depth of last night&apos;s rest.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {SLEEP_QUALITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSleepQualitySelect(opt.value)}
                className="flex flex-col items-start p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 hover:border-zinc-700 active:scale-[0.98] transition-all text-left group"
              >
                <span className="text-lg font-medium text-zinc-100 group-hover:text-white">
                  {opt.label}
                </span>
                <span className="text-xs text-zinc-400 mt-1">
                  {opt.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Wake Reason */}
      {step === 3 && (
        <div className="space-y-6 animate-fade-in">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              What woke you?
            </h1>
            <p className="text-sm text-zinc-400">
              Select the primary cause of your final awakening.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            {WAKE_REASON_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleWakeReasonSelect(opt.value)}
                className="flex items-center justify-between p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 hover:border-zinc-700 active:scale-[0.98] transition-all text-left font-medium text-zinc-100"
              >
                <span>{opt.label}</span>
                <span className="text-zinc-600 group-hover:text-zinc-400">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 4: Adherence (if intervention active) */}
      {step === 4 && hasIntervention && (
        <div className="space-y-6 animate-fade-in">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              Did you follow last night&apos;s protocol?
            </h1>
            <p className="text-sm text-zinc-400">
              Honest logging is essential. Non-adherent nights are kept safely for analysis.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(["yes", "mostly", "no"] as ProtocolAdherence[]).map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => handleAdherenceSelect(val)}
                className={`py-4 rounded-xl border font-semibold capitalize text-center transition-all ${
                  adherence === val
                    ? "border-zinc-100 bg-zinc-100 text-black"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                {val}
              </button>
            ))}
          </div>

          {adherence && adherence !== "yes" && (
            <div className="space-y-3 pt-2">
              <label className="block text-xs font-mono text-zinc-400">
                WHAT HAPPENED? (OPTIONAL)
              </label>
              <input
                type="text"
                placeholder="e.g. Worked late on laptop"
                value={adherenceNote}
                onChange={(e) => setAdherenceNote(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
              />
              <button
                type="button"
                onClick={() => setStep(5)}
                className="w-full py-3 rounded-xl bg-zinc-200 text-black font-semibold text-sm hover:bg-white active:scale-[0.98] transition-all"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 5: Unusual Night */}
      {step === 5 && (
        <div className="space-y-6 animate-fade-in">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              Anything unusual about last night?
            </h1>
            <p className="text-sm text-zinc-400">
              Identifies acute confounders (illness, alcohol, travel, unusual stress).
            </p>
          </div>

          {isUnusual === null ? (
            <div className="grid grid-cols-2 gap-4 pt-2">
              <button
                type="button"
                onClick={() => handleUnusualDecision(false)}
                disabled={isSubmitting}
                className="py-6 rounded-xl border border-zinc-800 bg-zinc-900/70 hover:bg-zinc-800 active:scale-[0.98] text-lg font-semibold text-zinc-100 transition-all"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => handleUnusualDecision(true)}
                disabled={isSubmitting}
                className="py-6 rounded-xl border border-zinc-800 bg-zinc-900/70 hover:bg-zinc-800 active:scale-[0.98] text-lg font-semibold text-zinc-100 transition-all"
              >
                Yes
              </button>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <p className="text-xs font-mono text-zinc-400">
                SELECT ALL FACTORS THAT APPLIED:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {UNUSUAL_TAGS.map((tag) => {
                  const selected = unusualReasons.includes(tag.value);
                  return (
                    <button
                      key={tag.value}
                      type="button"
                      onClick={() => toggleUnusualReason(tag.value)}
                      className={`p-3 rounded-lg border text-xs font-medium text-left transition-all ${
                        selected
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                          : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800"
                      }`}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={handleFinishUnusual}
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-xl bg-zinc-100 text-black font-semibold text-sm hover:bg-white active:scale-[0.98] transition-all mt-4"
              >
                {isSubmitting ? "Saving..." : "Finish Check-in ✓"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
