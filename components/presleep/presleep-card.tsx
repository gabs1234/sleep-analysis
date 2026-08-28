"use client";

import React, { useState } from "react";
import { PreSleepState } from "@/types/study";

interface PreSleepCardProps {
  initialData?: PreSleepState;
  onSave: (state: PreSleepState) => void;
}

const MENTAL_AROUSAL_OPTIONS = [
  { val: 0, label: "0 — Quiet", desc: "Mind relaxed, minimal cognitive chatter" },
  { val: 1, label: "1 — Active", desc: "Thinking about today/tomorrow, easy to redirect" },
  { val: 2, label: "2 — Racing", desc: "Fast-moving thoughts, difficult to settle" },
  { val: 3, label: "3 — Can't switch off", desc: "Overstimulated, ruminating, intrusive thoughts" },
];

const SLEEPINESS_OPTIONS = [
  { val: 0, label: "0 — Not sleepy", desc: "Wide awake, alert, no physical drowsiness" },
  { val: 1, label: "1 — Slightly sleepy", desc: "Mild drowsiness, could stay awake easily" },
  { val: 2, label: "2 — Sleepy", desc: "Heavy eyelids, yawning, ready to fall asleep" },
  { val: 3, label: "3 — Struggling", desc: "Fighting to stay awake, nodding off" },
];

export function PreSleepCard({ initialData, onSave }: PreSleepCardProps) {
  const [mentalArousal, setMentalArousal] = useState<number | undefined>(
    initialData?.mental_arousal
  );
  const [sleepiness, setSleepiness] = useState<number | undefined>(
    initialData?.sleepiness
  );

  const handleSelectArousal = (val: number) => {
    setMentalArousal(val);
    onSave({
      mental_arousal: val,
      sleepiness,
      completed_at: new Date().toISOString(),
    });
  };

  const handleSelectSleepiness = (val: number) => {
    setSleepiness(val);
    onSave({
      mental_arousal: mentalArousal,
      sleepiness: val,
      completed_at: new Date().toISOString(),
    });
  };

  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
            PRE-SLEEP STATE
          </div>
          <div className="text-sm font-semibold text-zinc-100">
            Bedtime Check (~2 taps)
          </div>
        </div>
        <div className="text-[11px] font-mono text-emerald-400">
          {mentalArousal !== undefined && sleepiness !== undefined && "✓ Ready"}
        </div>
      </div>

      <div className="space-y-3.5 pt-1">
        {/* Mental Arousal */}
        <div className="space-y-1.5 p-3 rounded-xl bg-zinc-900/40 border border-zinc-900">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-zinc-200">How switched off is your mind?</span>
            <span className="text-[11px] font-mono text-emerald-400">
              {mentalArousal !== undefined
                ? MENTAL_AROUSAL_OPTIONS[mentalArousal]?.label.split("—")[1]?.trim()
                : "Required"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            {MENTAL_AROUSAL_OPTIONS.map((opt) => {
              const isSelected = mentalArousal === opt.val;
              return (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => handleSelectArousal(opt.val)}
                  className={`p-2 rounded-lg border text-left text-xs transition-all active:scale-[0.98] ${
                    isSelected
                      ? "bg-zinc-100 text-black border-white font-semibold shadow-sm"
                      : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  <div className="font-semibold">{opt.label}</div>
                  <div className="text-[10px] opacity-70 mt-0.5 leading-tight">{opt.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sleepiness */}
        <div className="space-y-1.5 p-3 rounded-xl bg-zinc-900/40 border border-zinc-900">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-zinc-200">How sleepy are you right now?</span>
            <span className="text-[11px] font-mono text-emerald-400">
              {sleepiness !== undefined
                ? SLEEPINESS_OPTIONS[sleepiness]?.label.split("—")[1]?.trim()
                : "Required"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            {SLEEPINESS_OPTIONS.map((opt) => {
              const isSelected = sleepiness === opt.val;
              return (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => handleSelectSleepiness(opt.val)}
                  className={`p-2 rounded-lg border text-left text-xs transition-all active:scale-[0.98] ${
                    isSelected
                      ? "bg-zinc-100 text-black border-white font-semibold shadow-sm"
                      : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  <div className="font-semibold">{opt.label}</div>
                  <div className="text-[10px] opacity-70 mt-0.5 leading-tight">{opt.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
