"use client";

import React, { useState } from "react";
import { useStudySession } from "@/context/study-context";
import {
  DailySubjectiveContext,
  PreSleepState,
} from "@/types/study";
import {
  FoodLogCompleteness,
  DailyNutritionFallback,
  GIExposureCategory,
} from "@/types/nutrition";
import { GI_EXPOSURE_CATEGORIES } from "@/lib/nutrition/nutrition-service";

interface EveningQuestionnaireProps {
  initialContext?: DailySubjectiveContext;
  initialPreSleep?: PreSleepState;
  initialCompleteness?: FoodLogCompleteness;
  initialFallback?: DailyNutritionFallback;
  importedFoodCount?: number;
  onComplete?: () => void;
  onClose?: () => void;
}

const INTAKE_LEVELS = [
  { val: 1, label: "Light" },
  { val: 2, label: "Normal" },
  { val: 3, label: "Heavy" },
  { val: 4, label: "Very heavy" },
];

const STEPS = [
  {
    id: "overall_stress",
    section: "DAILY CONTEXT",
    title: "How stressed were you today?",
    desc: "Rate your overall perceived stress across all daytime events.",
    options: [
      { val: 0, label: "Relaxed", desc: "Calm, minimal tension" },
      { val: 1, label: "Mild", desc: "Manageable daily baseline stress" },
      { val: 2, label: "Stressed", desc: "Elevated tension, noticeably pressured" },
      { val: 3, label: "Very stressed", desc: "High pressure, acute anxiety or exhaustion" },
    ],
  },
  {
    id: "work_stress",
    section: "DAILY CONTEXT",
    title: "How stressful was work today?",
    desc: "Rate workload demands and work-related cognitive tension.",
    options: [
      { val: 0, label: "Calm", desc: "Low demand or day off" },
      { val: 1, label: "Mild", desc: "Standard demands, handled smoothly" },
      { val: 2, label: "Stressed", desc: "Demanding deadlines or conflicts" },
      { val: 3, label: "Overwhelming", desc: "Severe strain, non-stop pressure" },
    ],
  },
  {
    id: "work_satisfaction",
    section: "DAILY CONTEXT",
    title: "How did work feel today?",
    desc: "Rate your sense of productivity, accomplishment, or day off status.",
    options: [
      { val: -1, label: "No work", desc: "Did not work today / day off" },
      { val: 0, label: "Bad", desc: "Unproductive, frustrating or stuck" },
      { val: 1, label: "Frustrating", desc: "Progress hindered by blockers" },
      { val: 2, label: "Fine", desc: "Standard, decent output" },
      { val: 3, label: "Satisfying", desc: "High accomplishment and flow" },
    ],
  },
  {
    id: "meaningful_social_contact",
    section: "DAILY CONTEXT",
    title: "How much meaningful social contact did you have?",
    desc: "Interactions with family, friends, or colleagues that felt grounding.",
    options: [
      { val: 0, label: "None", desc: "Isolated or purely transactional" },
      { val: 1, label: "Brief", desc: "Quick chat, text, or greeting" },
      { val: 2, label: "Some", desc: "Good conversation or shared meal" },
      { val: 3, label: "Substantial", desc: "Deep connection, extended quality time" },
    ],
  },
  {
    id: "routine_adherence",
    section: "DAILY CONTEXT",
    title: "How well did you follow your normal routine?",
    desc: "Structure of habits, schedule consistency, and daytime rhythm.",
    options: [
      { val: 0, label: "Fell apart", desc: "Completely disrupted or chaotic" },
      { val: 1, label: "Partial", desc: "Several habits/timings skipped" },
      { val: 2, label: "Mostly", desc: "Kept primary rhythm with minor tweaks" },
      { val: 3, label: "Complete", desc: "Followed schedule and routine solidly" },
    ],
  },
  {
    id: "eating_out_of_control",
    section: "DAILY CONTEXT",
    title: "Did eating feel out of control today?",
    desc: "Sense of compulsive snacking, grazing, or feeling disconnected from appetite.",
    options: [
      { val: 0, label: "No", desc: "Eating felt intentional and normal" },
      { val: 1, label: "Somewhat", desc: "Mild grazing or unplanned snacking" },
      { val: 2, label: "Yes", desc: "Felt out of control or binge-like" },
    ],
  },
  {
    id: "mental_arousal",
    section: "PRE-SLEEP STATE",
    title: "What is your mental arousal level right now?",
    desc: "Cognitive speed and ability to settle thoughts for sleep.",
    options: [
      { val: 0, label: "Quiet", desc: "Mind is calm, settled, ready to power down" },
      { val: 1, label: "Active", desc: "Normal evening thoughts, processing the day" },
      { val: 2, label: "Racing", desc: "Busy thoughts, hard to disconnect from tasks" },
      { val: 3, label: "Can't switch off", desc: "Severe cognitive momentum, hyper-alert" },
    ],
  },
  {
    id: "sleepiness",
    section: "PRE-SLEEP STATE",
    title: "How sleepy are you right now?",
    desc: "Physical sleep pressure and heaviness of eyes/body.",
    options: [
      { val: 0, label: "Not sleepy", desc: "Wide awake, no sleep pressure yet" },
      { val: 1, label: "Slightly sleepy", desc: "Mild drowsiness beginning" },
      { val: 2, label: "Sleepy", desc: "Heavy eyes, yawning, ready to sleep" },
      { val: 3, label: "Struggling to stay awake", desc: "Eyes shutting, fighting off immediate sleep" },
    ],
  },
  {
    id: "nutrition_check",
    section: "NUTRITION LOGGING",
    title: "Is today's food logging complete?",
    desc: "Verify whether all meals and snacks were tracked in your nutrition app.",
    options: [
      { val: "yes", label: "Yes, complete", desc: "All meals and snacks are logged in MacroFactor/App" },
      { val: "mostly", label: "Mostly complete", desc: "Logged most food, but missed one snack/drink" },
      { val: "no", label: "No / Skipped logging", desc: "Did not log today, use lightweight fallback" },
    ],
  },
];

export function EveningQuestionnaire({
  initialContext,
  initialPreSleep,
  initialCompleteness = "yes",
  initialFallback,
  importedFoodCount = 0,
  onComplete,
  onClose,
}: EveningQuestionnaireProps) {
  const {
    saveDailyContext,
    savePreSleepState,
    saveFoodLogCompleteness,
    saveDailyNutritionFallback,
  } = useStudySession();

  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Form State
  const [contextData, setContextData] = useState<DailySubjectiveContext>(() => initialContext || {});
  const [preSleepData, setPreSleepData] = useState<PreSleepState>(() => initialPreSleep || {});
  const [completeness, setCompleteness] = useState<FoodLogCompleteness>(initialCompleteness);

  // Nutrition fallback extra fields
  const [fallbackIntake, setFallbackIntake] = useState<number>(
    () => initialFallback?.intake_relative_to_intent ?? 2
  );
  const [fallbackLargeMeal, setFallbackLargeMeal] = useState<boolean>(
    () => Boolean(initialFallback?.final_meal_unusually_large)
  );
  const [fallbackExposures, setFallbackExposures] = useState<GIExposureCategory[]>(
    () => initialFallback?.notable_exposures || []
  );

  const [isDone, setIsDone] = useState(false);

  const currentStep = STEPS[currentStepIndex];
  const totalSteps = STEPS.length;

  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleNextStep = () => {
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      handleFinalSave();
    }
  };

  const handleSelectContextOption = (fieldId: keyof DailySubjectiveContext, val: number) => {
    const updated = {
      ...contextData,
      [fieldId]: val,
      completed_at: new Date().toISOString(),
    };
    setContextData(updated);
    saveDailyContext(updated);
    handleNextStep();
  };

  const handleSelectPreSleepOption = (fieldId: keyof PreSleepState, val: number) => {
    const updated = {
      ...preSleepData,
      [fieldId]: val,
      completed_at: new Date().toISOString(),
    };
    setPreSleepData(updated);
    savePreSleepState(updated);
    handleNextStep();
  };

  const handleSelectNutritionCompleteness = (val: FoodLogCompleteness) => {
    setCompleteness(val);
    saveFoodLogCompleteness(val);

    if (val === "yes") {
      handleFinalSave();
    } else {
      // If "no" or "mostly", we save and complete
      handleFinalSave();
    }
  };

  const toggleFallbackExposure = (key: GIExposureCategory) => {
    setFallbackExposures((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      const updatedFallback: DailyNutritionFallback = {
        ...initialFallback,
        completed_at: initialFallback?.completed_at || new Date().toISOString(),
        intake_relative_to_intent: fallbackIntake,
        final_meal_unusually_large: fallbackLargeMeal,
        notable_exposures: next,
        source: "manual_approximate",
      };
      saveDailyNutritionFallback(updatedFallback);
      return next;
    });
  };

  const handleUpdateIntake = (intake: number) => {
    setFallbackIntake(intake);
    const updatedFallback: DailyNutritionFallback = {
      ...initialFallback,
      completed_at: initialFallback?.completed_at || new Date().toISOString(),
      intake_relative_to_intent: intake,
      final_meal_unusually_large: fallbackLargeMeal,
      notable_exposures: fallbackExposures,
      source: "manual_approximate",
    };
    saveDailyNutritionFallback(updatedFallback);
  };

  const handleFinalSave = () => {
    if (completeness === "no" || completeness === "mostly") {
      saveDailyNutritionFallback({
        ...initialFallback,
        completed_at: initialFallback?.completed_at || new Date().toISOString(),
        intake_relative_to_intent: fallbackIntake,
        final_meal_unusually_large: fallbackLargeMeal,
        notable_exposures: fallbackExposures,
        source: "manual_approximate",
      });
    }
    setIsDone(true);
    if (onComplete) onComplete();
  };

  // Determine current value for the active step
  const getCurrentValue = () => {
    if (currentStep.section === "DAILY CONTEXT") {
      return contextData[currentStep.id as keyof DailySubjectiveContext] as number | undefined;
    }
    if (currentStep.section === "PRE-SLEEP STATE") {
      return preSleepData[currentStep.id as keyof PreSleepState] as number | undefined;
    }
    if (currentStep.id === "nutrition_check") {
      return completeness;
    }
    return undefined;
  };

  const currentValue = getCurrentValue();

  if (isDone) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-10 flex flex-col items-center justify-center text-center space-y-6 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-3xl font-bold border border-emerald-500/20">
          ✓
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Evening Check-in Complete
          </h2>
          <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
            Daily context, pre-sleep state, and nutrition verification saved.
          </p>
        </div>

        {/* Mini Summary Box */}
        <div className="w-full p-4 rounded-xl border border-zinc-900 bg-zinc-950 text-left space-y-2 text-xs font-mono text-zinc-300">
          <div className="flex justify-between border-b border-zinc-900 pb-1.5">
            <span className="text-zinc-500">Overall Stress:</span>
            <span className="text-emerald-400 font-semibold">
              {STEPS[0].options.find((o) => o.val === contextData.overall_stress)?.label || "—"}
            </span>
          </div>
          <div className="flex justify-between border-b border-zinc-900 pb-1.5">
            <span className="text-zinc-500">Work Stress:</span>
            <span className="text-zinc-200">
              {STEPS[1].options.find((o) => o.val === contextData.work_stress)?.label || "—"}
            </span>
          </div>
          <div className="flex justify-between border-b border-zinc-900 pb-1.5">
            <span className="text-zinc-500">Work Satisfaction:</span>
            <span className="text-zinc-200">
              {STEPS[2].options.find((o) => o.val === contextData.work_satisfaction)?.label || "—"}
            </span>
          </div>
          <div className="flex justify-between border-b border-zinc-900 pb-1.5">
            <span className="text-zinc-500">Pre-Sleep Mental State:</span>
            <span className="text-zinc-200">
              {STEPS[6].options.find((o) => o.val === preSleepData.mental_arousal)?.label || "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Sleepiness:</span>
            <span className="text-amber-400 font-semibold">
              {STEPS[7].options.find((o) => o.val === preSleepData.sleepiness)?.label || "—"}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (onClose) onClose();
            else if (onComplete) onComplete();
          }}
          className="w-full py-3.5 rounded-xl bg-zinc-100 text-black font-semibold text-sm hover:bg-white active:scale-[0.98] transition-all"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto px-4 py-6 space-y-5 animate-fade-in">
      {/* Navigation Header */}
      <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
        <div className="flex items-center space-x-2">
          {currentStepIndex > 0 ? (
            <button
              type="button"
              onClick={handlePrevStep}
              className="px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all"
            >
              ← Back
            </button>
          ) : (
            <span className="uppercase tracking-wider text-emerald-400">{currentStep.section}</span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-zinc-500">
            {currentStepIndex + 1} of {totalSteps}
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
          className="bg-emerald-400 h-full transition-all duration-300"
          style={{ width: `${((currentStepIndex + 1) / totalSteps) * 100}%` }}
        />
      </div>

      {/* Step Question Header */}
      <div className="space-y-1">
        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          {currentStep.section}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
          {currentStep.title}
        </h1>
        <p className="text-xs text-zinc-400">
          {currentStep.desc}
        </p>
      </div>

      {/* Standard Step Options */}
      {currentStep.id !== "nutrition_check" && (
        <div className="grid grid-cols-1 gap-2.5 pt-1">
          {currentStep.options.map((opt) => {
            const isSelected = currentValue === opt.val;
            return (
              <button
                key={opt.val}
                type="button"
                onClick={() => {
                  if (currentStep.section === "DAILY CONTEXT") {
                    handleSelectContextOption(currentStep.id as keyof DailySubjectiveContext, opt.val as number);
                  } else {
                    handleSelectPreSleepOption(currentStep.id as keyof PreSleepState, opt.val as number);
                  }
                }}
                className={`flex items-start justify-between p-4 rounded-xl border transition-all active:scale-[0.98] text-left ${
                  isSelected
                    ? "bg-zinc-100 text-black border-white shadow-sm"
                    : "bg-zinc-900/60 border-zinc-800 text-zinc-100 hover:bg-zinc-800 hover:border-zinc-700"
                }`}
              >
                <div className="space-y-0.5">
                  <div className={`text-base font-semibold ${isSelected ? "text-black" : "text-zinc-100"}`}>
                    {opt.label}
                  </div>
                  <div className={`text-xs ${isSelected ? "text-zinc-700" : "text-zinc-400"}`}>
                    {opt.desc}
                  </div>
                </div>
                <span className={`text-xs font-mono pt-0.5 ${isSelected ? "text-black font-bold" : "text-zinc-500"}`}>
                  {isSelected ? "✓" : "→"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Nutrition Step Options */}
      {currentStep.id === "nutrition_check" && (
        <div className="space-y-4 pt-1">
          {importedFoodCount > 0 && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-mono">
              ✓ {importedFoodCount} items synced from MacroFactor
            </div>
          )}

          <div className="grid grid-cols-1 gap-2.5">
            {currentStep.options.map((opt) => {
              const isSelected = completeness === opt.val;
              return (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => handleSelectNutritionCompleteness(opt.val as FoodLogCompleteness)}
                  className={`flex items-start justify-between p-4 rounded-xl border transition-all active:scale-[0.98] text-left ${
                    isSelected
                      ? "bg-zinc-100 text-black border-white shadow-sm"
                      : "bg-zinc-900/60 border-zinc-800 text-zinc-100 hover:bg-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className={`text-base font-semibold ${isSelected ? "text-black" : "text-zinc-100"}`}>
                      {opt.label}
                    </div>
                    <div className={`text-xs ${isSelected ? "text-zinc-700" : "text-zinc-400"}`}>
                      {opt.desc}
                    </div>
                  </div>
                  <span className={`text-xs font-mono pt-0.5 ${isSelected ? "text-black font-bold" : "text-zinc-500"}`}>
                    {isSelected ? "✓" : "→"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Fallback Extras if No or Mostly */}
          {(completeness === "no" || completeness === "mostly") && (
            <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-3.5 animate-fade-in">
              <div className="space-y-1">
                <div className="text-[10px] font-mono text-zinc-400 uppercase">
                  Lightweight Fallback Intake
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {INTAKE_LEVELS.map((lvl) => (
                    <button
                      key={lvl.val}
                      type="button"
                      onClick={() => handleUpdateIntake(lvl.val)}
                      className={`py-1.5 px-1 rounded-md text-[11px] font-medium capitalize border transition-all ${
                        fallbackIntake === lvl.val
                          ? "bg-zinc-100 text-black border-white font-bold"
                          : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      {lvl.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-mono text-zinc-400 uppercase">
                  Notable Exposures (Optional)
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {GI_EXPOSURE_CATEGORIES.slice(0, 6).map((cat) => {
                    const isSelected = fallbackExposures.includes(cat.key);
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => toggleFallbackExposure(cat.key)}
                        className={`p-2 rounded-lg border text-left text-[11px] transition-all ${
                          isSelected
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-300 font-semibold"
                            : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={handleFinalSave}
                className="w-full py-3 rounded-xl bg-zinc-100 text-black font-semibold text-xs hover:bg-white active:scale-[0.98] transition-all"
              >
                Save &amp; Complete Evening Check-in ✓
              </button>
            </div>
          )}
        </div>
      )}

      {/* Keep Selection & Next Button (when answer is already present) */}
      {currentValue !== undefined && currentStep.id !== "nutrition_check" && (
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleNextStep}
            className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-semibold transition-all"
          >
            Keep selection &amp; Next →
          </button>
        </div>
      )}
    </div>
  );
}
