"use client";

import React, { useState } from "react";
import {
  FoodLogCompleteness,
  MissingEatingEvent,
  DailyNutritionFallback,
  GIExposureCategory,
  MealSize,
} from "@/types/nutrition";
import {
  GI_EXPOSURE_CATEGORIES,
  MEAL_SIZE_OPTIONS,
  INTAKE_RELATIVE_OPTIONS,
} from "@/lib/nutrition/nutrition-service";
import {
  formatLocalTime,
  createOffsetTimestamp,
  timeStringToIso,
} from "@/lib/engine/protocol-engine";

interface NutritionFallbackProps {
  initialCompleteness?: FoodLogCompleteness;
  initialMissingEvents?: MissingEatingEvent[];
  initialFallback?: DailyNutritionFallback;
  importedFoodCount?: number;
  onSaveCompleteness: (completeness: FoodLogCompleteness) => void;
  onSaveMissingEvents: (events: MissingEatingEvent[]) => void;
  onSaveFallback: (fallback: DailyNutritionFallback) => void;
}

export function NutritionFallback({
  initialCompleteness,
  initialMissingEvents = [],
  initialFallback,
  importedFoodCount = 0,
  onSaveCompleteness,
  onSaveMissingEvents,
  onSaveFallback,
}: NutritionFallbackProps) {
  const [completeness, setCompleteness] = useState<FoodLogCompleteness | undefined>(
    initialCompleteness
  );
  const [missingEvents, setMissingEvents] = useState<MissingEatingEvent[]>(
    initialMissingEvents
  );
  const [fallbackData, setFallbackData] = useState<DailyNutritionFallback>(
    () =>
      initialFallback || {
        completed_at: new Date().toISOString(),
        source: "manual_approximate",
      }
  );

  // Missing meal event builder state (for "Mostly")
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [eventTime, setEventTime] = useState<string>(() => new Date().toISOString());
  const [customTimeInput, setCustomTimeInput] = useState<string>("");
  const [mealSize, setMealSize] = useState<MealSize>("normal");
  const [selectedCategories, setSelectedCategories] = useState<GIExposureCategory[]>([]);
  const [roughCalories, setRoughCalories] = useState<string>("");

  // Handle completeness choice
  const handleSelectCompleteness = (choice: FoodLogCompleteness) => {
    setCompleteness(choice);
    onSaveCompleteness(choice);
  };

  // Missing Event Handlers
  const toggleCategory = (cat: GIExposureCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleQuickEventOffset = (minutesAgo: number) => {
    const timestamp = createOffsetTimestamp(minutesAgo);
    setEventTime(timestamp);
    setCustomTimeInput("");
  };

  const handleCustomEventTimeChange = (timeStr: string) => {
    setCustomTimeInput(timeStr);
    if (timeStr) {
      setEventTime(timeStringToIso(timeStr));
    }
  };

  const handleAddMissingEvent = () => {
    const newEvent: MissingEatingEvent = {
      id: `missing_meal_${Date.now()}`,
      timestamp: eventTime,
      time_is_approximate: true,
      meal_size: mealSize,
      categories: selectedCategories,
      rough_calories: roughCalories ? Number(roughCalories) : undefined,
      source: "manual_approximate",
    };

    const updated = [...missingEvents, newEvent];
    setMissingEvents(updated);
    onSaveMissingEvents(updated);

    // Reset drawer state
    setIsAddingEvent(false);
    setSelectedCategories([]);
    setRoughCalories("");
    setEventTime(new Date().toISOString());
  };

  const handleRemoveMissingEvent = (id: string) => {
    const updated = missingEvents.filter((ev) => ev.id !== id);
    setMissingEvents(updated);
    onSaveMissingEvents(updated);
  };

  // Daily Fallback Handlers (for "No")
  const updateFallback = (updates: Partial<DailyNutritionFallback>) => {
    const updated: DailyNutritionFallback = {
      ...fallbackData,
      ...updates,
      completed_at: new Date().toISOString(),
      source: "manual_approximate",
    };
    setFallbackData(updated);
    onSaveFallback(updated);
  };

  const toggleFallbackCategory = (cat: GIExposureCategory) => {
    const prev = fallbackData.notable_exposures || [];
    const updated = prev.includes(cat)
      ? prev.filter((c) => c !== cat)
      : [...prev, cat];
    updateFallback({ notable_exposures: updated });
  };

  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
            NUTRITION DATA VERIFICATION
          </div>
          <div className="text-sm font-semibold text-zinc-100">
            Is today&apos;s food log complete?
          </div>
        </div>
        {importedFoodCount > 0 && (
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            {importedFoodCount} items imported
          </span>
        )}
      </div>

      {/* Primary Question: Yes / Mostly / No */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        {(["yes", "mostly", "no"] as FoodLogCompleteness[]).map((opt) => {
          const isSelected = completeness === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => handleSelectCompleteness(opt)}
              className={`py-3 px-2 rounded-xl border text-center font-semibold text-xs capitalize transition-all active:scale-[0.98] ${
                isSelected
                  ? "bg-zinc-100 text-black border-white shadow-sm"
                  : "bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {opt === "yes" && "✓ Yes"}
              {opt === "mostly" && "⚡ Mostly"}
              {opt === "no" && "✗ No"}
            </button>
          );
        })}
      </div>

      {/* Case 1: IF YES */}
      {completeness === "yes" && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 space-y-1 animate-fade-in">
          <div className="font-semibold flex items-center space-x-1.5">
            <span>✓ Complete log confirmed</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            All imported MacroFactor / Health Connect records are authoritative. No manual food-recall needed.
          </p>
        </div>
      )}

      {/* Case 2: IF MOSTLY (Keep imported + supplement missing events) */}
      {completeness === "mostly" && (
        <div className="space-y-3 pt-2 border-t border-zinc-900 animate-fade-in">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-zinc-200">
              Supplement Missing Eating Event(s)
            </div>
            <p className="text-[11px] text-zinc-400">
              Imported records are kept. Only log the unrecorded meal or snack.
            </p>
          </div>

          {/* List of existing supplemented events */}
          {missingEvents.length > 0 && (
            <div className="space-y-1.5">
              {missingEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <div className="font-mono text-zinc-200 flex items-center space-x-2">
                      <span>{formatLocalTime(ev.timestamp)}</span>
                      <span className="text-zinc-500">•</span>
                      <span className="capitalize text-emerald-400 font-semibold">{ev.meal_size} meal</span>
                      {ev.rough_calories && (
                        <span className="text-zinc-400">(~{ev.rough_calories} kcal)</span>
                      )}
                    </div>
                    {ev.categories.length > 0 && (
                      <div className="text-[10px] text-zinc-400">
                        {ev.categories.map((c) => GI_EXPOSURE_CATEGORIES.find((g) => g.key === c)?.label).join(", ")}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveMissingEvent(ev.id)}
                    className="text-rose-400 hover:text-rose-300 text-xs px-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Missing Meal Drawer / Form */}
          {isAddingEvent ? (
            <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                <span>Add Missing Eating Event</span>
                <button
                  type="button"
                  onClick={() => setIsAddingEvent(false)}
                  className="text-zinc-400 hover:text-zinc-200 font-mono text-[11px]"
                >
                  Cancel
                </button>
              </div>

              {/* 1. When was it? */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono text-zinc-400">1. WHEN WAS IT?</div>
                <div className="grid grid-cols-4 gap-1">
                  {[0, 60, 120, 180].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleQuickEventOffset(m)}
                      className="py-1 px-1 rounded-md bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-zinc-300 hover:bg-zinc-800 text-center"
                    >
                      {m === 0 ? "Just now" : `${m / 60}h ago`}
                    </button>
                  ))}
                </div>
                <input
                  type="time"
                  value={customTimeInput}
                  onChange={(e) => handleCustomEventTimeChange(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100"
                />
              </div>

              {/* 2. How large was it? */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono text-zinc-400">2. HOW LARGE WAS IT?</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {MEAL_SIZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setMealSize(opt.key)}
                      className={`py-2 px-1 rounded-lg border text-center text-xs transition-all ${
                        mealSize === opt.key
                          ? "bg-zinc-100 text-black border-white font-bold"
                          : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. What broad food categories were present? */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono text-zinc-400">
                  3. FOOD CATEGORIES PRESENT (MULTI-SELECT)
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-1">
                  {GI_EXPOSURE_CATEGORIES.map((cat) => {
                    const isSelected = selectedCategories.includes(cat.key);
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => toggleCategory(cat.key)}
                        className={`p-2 rounded-lg border text-left text-[11px] transition-all ${
                          isSelected
                            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-semibold"
                            : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Optional: Rough calories */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span>4. ROUGH CALORIES? (OPTIONAL)</span>
                  <span className="text-zinc-500">Never required</span>
                </div>
                <input
                  type="number"
                  placeholder="e.g. 500"
                  value={roughCalories}
                  onChange={(e) => setRoughCalories(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100"
                />
              </div>

              <button
                type="button"
                onClick={handleAddMissingEvent}
                className="w-full py-2.5 rounded-xl bg-zinc-100 text-black font-semibold text-xs hover:bg-white active:scale-[0.98] transition-all"
              >
                + Add This Eating Event
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingEvent(true)}
              className="w-full py-2.5 rounded-xl border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 text-xs font-mono text-zinc-200 transition-all active:scale-[0.98]"
            >
              + Log Missing Eating Event
            </button>
          )}
        </div>
      )}

      {/* Case 3: IF NO (Unusable or absent MacroFactor data - lightweight fallback) */}
      {completeness === "no" && (
        <div className="space-y-4 pt-2 border-t border-zinc-900 animate-fade-in">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-zinc-200">
              Lightweight Daily Fallback
            </div>
            <p className="text-[11px] text-zinc-400">
              5 lightweight questions to rescue timing, meal size, and GI food exposures without macro reconstruction.
            </p>
          </div>

          {/* 1. Intake relative to intended */}
          <div className="space-y-1.5 p-2.5 rounded-xl bg-zinc-900/40 border border-zinc-900">
            <div className="text-xs font-medium text-zinc-200">
              1. How much did you eat relative to what you intended?
            </div>
            <div className="grid grid-cols-1 gap-1">
              {INTAKE_RELATIVE_OPTIONS.map((opt) => {
                const isSelected = fallbackData.intake_relative_to_intent === opt.val;
                return (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => updateFallback({ intake_relative_to_intent: opt.val as 0 | 1 | 2 | 3 | 4 })}
                    className={`py-1.5 px-2.5 rounded-lg border text-left text-xs transition-all ${
                      isSelected
                        ? "bg-zinc-100 text-black border-white font-semibold"
                        : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    <span className="font-semibold">{opt.label}</span>
                    <span className="text-[10px] opacity-70 ml-2">({opt.desc})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Did eating feel out of control? */}
          <div className="space-y-1.5 p-2.5 rounded-xl bg-zinc-900/40 border border-zinc-900">
            <div className="text-xs font-medium text-zinc-200">
              2. Did eating feel out of control today?
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { val: 0, label: "0 — No" },
                { val: 1, label: "1 — Somewhat" },
                { val: 2, label: "2 — Yes" },
              ].map((opt) => {
                const isSelected = fallbackData.eating_out_of_control === opt.val;
                return (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => updateFallback({ eating_out_of_control: opt.val as 0 | 1 | 2 })}
                    className={`py-2 px-1 rounded-lg border text-center text-xs transition-all ${
                      isSelected
                        ? "bg-zinc-100 text-black border-white font-bold"
                        : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. When did you finish your last caloric intake? */}
          <div className="space-y-1.5 p-2.5 rounded-xl bg-zinc-900/40 border border-zinc-900">
            <div className="flex items-center justify-between text-xs font-medium text-zinc-200">
              <span>3. When was your final caloric intake?</span>
              {fallbackData.final_caloric_timestamp && (
                <span className="font-mono text-emerald-400">
                  {formatLocalTime(fallbackData.final_caloric_timestamp)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[0, 60, 120, 180].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => updateFallback({ final_caloric_timestamp: createOffsetTimestamp(m) })}
                  className="py-1 px-1 rounded-md bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-zinc-300 hover:bg-zinc-800 text-center"
                >
                  {m === 0 ? "Just now" : `${m / 60}h ago`}
                </button>
              ))}
            </div>
            <input
              type="time"
              onChange={(e) => {
                if (e.target.value) {
                  updateFallback({ final_caloric_timestamp: timeStringToIso(e.target.value) });
                }
              }}
              className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100"
            />
          </div>

          {/* 4. Was your final meal unusually large? */}
          <div className="space-y-1.5 p-2.5 rounded-xl bg-zinc-900/40 border border-zinc-900">
            <div className="text-xs font-medium text-zinc-200">
              4. Was your final meal unusually large?
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => updateFallback({ final_meal_unusually_large: false })}
                className={`py-2 px-3 rounded-lg border text-xs font-mono transition-all ${
                  fallbackData.final_meal_unusually_large === false
                    ? "bg-zinc-100 text-black border-white font-bold"
                    : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => updateFallback({ final_meal_unusually_large: true })}
                className={`py-2 px-3 rounded-lg border text-xs font-mono transition-all ${
                  fallbackData.final_meal_unusually_large === true
                    ? "bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold"
                    : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                Yes
              </button>
            </div>
          </div>

          {/* 5. Any notable GI-relevant food exposures today? */}
          <div className="space-y-1.5 p-2.5 rounded-xl bg-zinc-900/40 border border-zinc-900">
            <div className="text-xs font-medium text-zinc-200">
              5. Notable GI-relevant food exposures today:
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {GI_EXPOSURE_CATEGORIES.map((cat) => {
                const isSelected = (fallbackData.notable_exposures || []).includes(cat.key);
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => toggleFallbackCategory(cat.key)}
                    className={`p-2 rounded-lg border text-left text-[11px] transition-all ${
                      isSelected
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-semibold"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
