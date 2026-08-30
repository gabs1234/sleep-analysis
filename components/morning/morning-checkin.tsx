"use client";

import React, { useState } from "react";
import { useStudySession } from "@/context/study-context";
import { WakeReason, ProtocolAdherence, UnusualNightReason, MorningAssessment } from "@/types/study";

interface MorningCheckinProps {
  initialData?: MorningAssessment;
  onComplete?: () => void;
  onClose?: () => void;
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

const WAKE_REASON_OPTIONS: Array<{ value: WakeReason; label: string; desc: string }> = [
  { value: "natural", label: "Natural awakening", desc: "Woke up on your own without alarms" },
  { value: "alarm", label: "Alarm", desc: "Woken by alarm clock or timer" },
  { value: "light", label: "Light", desc: "Sunlight or ambient light" },
  { value: "noise", label: "Noise", desc: "Environmental or household sounds" },
  { value: "other", label: "Other / unsure", desc: "Physical discomfort, pets, or unknown" },
];

const UNUSUAL_TAGS: Array<{ value: UnusualNightReason; label: string }> = [
  { value: "illness", label: "Illness / fever" },
  { value: "alcohol", label: "Alcohol consumed" },
  { value: "caffeine", label: "Unusual late caffeine" },
  { value: "travel", label: "Travel / different bed" },
  { value: "stress", label: "Unusual stress" },
  { value: "exercise", label: "Hard late exercise" },
  { value: "interruption", label: "Major sleep interruption" },
  { value: "other", label: "Other abnormal factor" },
];

export function MorningCheckin({ initialData, onComplete, onClose }: MorningCheckinProps) {
  const { activePhase, submitMorningAssessment } = useStudySession();

  const [step, setStep] = useState<number>(1);
  const [readiness, setReadiness] = useState<number | null>(() => initialData?.readiness ?? null);
  const [sleepQuality, setSleepQuality] = useState<number | null>(() => initialData?.sleep_quality ?? null);
  const [wakeReason, setWakeReason] = useState<WakeReason | null>(() => initialData?.wake_reason ?? null);
  const [adherence, setAdherence] = useState<ProtocolAdherence | null>(() => initialData?.protocol_adherence ?? null);
  const [adherenceNote, setAdherenceNote] = useState<string>(() => initialData?.adherence_note ?? "");
  const [isUnusual, setIsUnusual] = useState<boolean | null>(() => initialData ? initialData.unusual_night : null);
  const [unusualReasons, setUnusualReasons] = useState<UnusualNightReason[]>(() => initialData?.unusual_reasons ?? []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const hasIntervention = activePhase.type === "randomized_experiment";
  const totalSteps = hasIntervention ? 5 : 4;

  const handlePrevStep = () => {
    if (step > 1) {
      if (step === 5 && !hasIntervention) {
        setStep(3);
      } else {
        setStep(step - 1);
      }
    }
  };

  const handleNextStep = () => {
    if (step === 3 && !hasIntervention) {
      setStep(5);
    } else if (step < 5) {
      setStep(step + 1);
    }
  };

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

  // Step 4: Adherence Selected
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
      await finishAssessment(false, []);
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

  const currentDisplayStep = step === 5 && !hasIntervention ? 4 : step;

  if (isDone) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-12 flex flex-col items-center justify-center text-center space-y-6 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-3xl font-bold border border-emerald-500/20">
          ✓
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Morning Check-in Recorded
          </h2>
          <p className="text-sm text-zinc-400 max-w-xs mx-auto">
            Your readiness, sleep quality, and awakening context have been logged.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (onClose) onClose();
            else if (onComplete) onComplete();
          }}
          className="px-6 py-3 rounded-xl bg-zinc-100 text-black font-semibold text-sm hover:bg-white active:scale-[0.98] transition-all"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto px-4 py-6 space-y-5 animate-fade-in">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
        <div className="flex items-center space-x-2">
          {step > 1 ? (
            <button
              type="button"
              onClick={handlePrevStep}
              className="px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all"
            >
              ← Back
            </button>
          ) : (
            <span className="uppercase tracking-wider">MORNING CHECK-IN</span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-zinc-500">
            {currentDisplayStep} of {totalSteps}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-300 p-1 font-mono text-sm"
              title="Close"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
        <div
          className="bg-amber-400 h-full transition-all duration-300"
          style={{ width: `${(currentDisplayStep / totalSteps) * 100}%` }}
        />
      </div>

      {/* Step 1: Readiness */}
      {step === 1 && (
        <div className="space-y-5 animate-fade-in">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              How ready do you feel?
            </h1>
            <p className="text-xs text-zinc-400">
              Rate your current mental alertness and physical state.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            {READINESS_OPTIONS.map((opt) => {
              const isSelected = readiness === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleReadinessSelect(opt.value)}
                  className={`flex flex-col items-start p-4 rounded-xl border transition-all active:scale-[0.98] text-left ${
                    isSelected
                      ? "bg-zinc-100 text-black border-white shadow-sm"
                      : "bg-zinc-900/60 border-zinc-800 text-zinc-100 hover:bg-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <span className={`text-base font-semibold ${isSelected ? "text-black" : "text-zinc-100"}`}>
                    {opt.label}
                  </span>
                  <span className={`text-xs mt-1 ${isSelected ? "text-zinc-700" : "text-zinc-400"}`}>
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>
          {readiness !== null && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleNextStep}
                className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-semibold transition-all"
              >
                Keep selection & Next →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Sleep Quality */}
      {step === 2 && (
        <div className="space-y-5 animate-fade-in">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              How did the sleep itself feel?
            </h1>
            <p className="text-xs text-zinc-400">
              Rate the overall quality and restfulness of last night&apos;s sleep.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            {SLEEP_QUALITY_OPTIONS.map((opt) => {
              const isSelected = sleepQuality === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSleepQualitySelect(opt.value)}
                  className={`flex flex-col items-start p-4 rounded-xl border transition-all active:scale-[0.98] text-left ${
                    isSelected
                      ? "bg-zinc-100 text-black border-white shadow-sm"
                      : "bg-zinc-900/60 border-zinc-800 text-zinc-100 hover:bg-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <span className={`text-base font-semibold ${isSelected ? "text-black" : "text-zinc-100"}`}>
                    {opt.label}
                  </span>
                  <span className={`text-xs mt-1 ${isSelected ? "text-zinc-700" : "text-zinc-400"}`}>
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>
          {sleepQuality !== null && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleNextStep}
                className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-semibold transition-all"
              >
                Keep selection & Next →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Wake Reason */}
      {step === 3 && (
        <div className="space-y-5 animate-fade-in">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              What woke you up?
            </h1>
            <p className="text-xs text-zinc-400">
              Select the primary cause of your final awakening this morning.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            {WAKE_REASON_OPTIONS.map((opt) => {
              const isSelected = wakeReason === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleWakeReasonSelect(opt.value)}
                  className={`flex items-center justify-between p-4 rounded-xl border transition-all active:scale-[0.98] text-left ${
                    isSelected
                      ? "bg-zinc-100 text-black border-white shadow-sm"
                      : "bg-zinc-900/60 border-zinc-800 text-zinc-100 hover:bg-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <div>
                    <div className={`text-sm font-semibold ${isSelected ? "text-black" : "text-zinc-100"}`}>
                      {opt.label}
                    </div>
                    <div className={`text-xs mt-0.5 ${isSelected ? "text-zinc-600" : "text-zinc-400"}`}>
                      {opt.desc}
                    </div>
                  </div>
                  <span className={`text-xs font-mono ${isSelected ? "text-black" : "text-zinc-500"}`}>→</span>
                </button>
              );
            })}
          </div>
          {wakeReason !== null && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleNextStep}
                className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-semibold transition-all"
              >
                Keep selection & Next →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Adherence (if intervention active) */}
      {step === 4 && hasIntervention && (
        <div className="space-y-5 animate-fade-in">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              Did you follow last night&apos;s protocol?
            </h1>
            <p className="text-xs text-zinc-400">
              Honest logging is essential. Non-adherent nights are accounted for without compromising data.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
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
                placeholder="e.g. Worked late on laptop, had to turn on lights"
                value={adherenceNote}
                onChange={(e) => setAdherenceNote(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
              />
              <button
                type="button"
                onClick={() => setStep(5)}
                className="w-full py-3 rounded-xl bg-zinc-200 text-black font-semibold text-sm hover:bg-white active:scale-[0.98] transition-all"
              >
                Continue →
              </button>
            </div>
          )}

          {adherence === "yes" && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setStep(5)}
                className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-semibold transition-all"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 5: Unusual Night / Confounders */}
      {step === 5 && (
        <div className="space-y-5 animate-fade-in">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              Anything unusual about last night?
            </h1>
            <p className="text-xs text-zinc-400">
              Identifies acute confounders (illness, alcohol, travel, unusual stress).
            </p>
          </div>

          {isUnusual === null ? (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleUnusualDecision(false)}
                disabled={isSubmitting}
                className="py-6 rounded-xl border border-zinc-800 bg-zinc-900/70 hover:bg-zinc-800 active:scale-[0.98] text-lg font-semibold text-zinc-100 transition-all flex flex-col items-center justify-center space-y-1"
              >
                <span>No</span>
                <span className="text-[11px] font-normal text-zinc-400">Normal sleep night</span>
              </button>
              <button
                type="button"
                onClick={() => handleUnusualDecision(true)}
                disabled={isSubmitting}
                className="py-6 rounded-xl border border-zinc-800 bg-zinc-900/70 hover:bg-zinc-800 active:scale-[0.98] text-lg font-semibold text-zinc-100 transition-all flex flex-col items-center justify-center space-y-1"
              >
                <span>Yes</span>
                <span className="text-[11px] font-normal text-amber-400/80">Flag factors</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span>SELECT ALL APPLICABLE FACTORS:</span>
                <button
                  type="button"
                  onClick={() => setIsUnusual(null)}
                  className="text-zinc-500 hover:text-zinc-300 underline"
                >
                  Change
                </button>
              </div>
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
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-300 font-semibold"
                          : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800"
                      }`}
                    >
                      {selected ? "✓ " : ""}{tag.label}
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
                {isSubmitting ? "Saving..." : "Complete Morning Check-in ✓"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
