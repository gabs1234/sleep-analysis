"use client";

import React, { useState } from "react";
import { DailySubjectiveContext } from "@/types/study";

interface DailyContextCardProps {
  initialData?: DailySubjectiveContext;
  onSave: (context: DailySubjectiveContext) => void;
}

const QUESTIONS = [
  {
    id: "overall_stress",
    prompt: "Overall Stress",
    question: "How stressed were you today?",
    options: [
      { val: 0, label: "0", desc: "Relaxed" },
      { val: 1, label: "1", desc: "Mild" },
      { val: 2, label: "2", desc: "Stressed" },
      { val: 3, label: "3", desc: "Very stressed" },
    ],
  },
  {
    id: "work_stress",
    prompt: "Work Stress",
    question: "How stressful was work today?",
    options: [
      { val: 0, label: "0", desc: "Calm" },
      { val: 1, label: "1", desc: "Mild" },
      { val: 2, label: "2", desc: "Stressed" },
      { val: 3, label: "3", desc: "Overwhelming" },
    ],
  },
  {
    id: "work_satisfaction",
    prompt: "Work Satisfaction",
    question: "How did work feel today?",
    options: [
      { val: 0, label: "0", desc: "Bad" },
      { val: 1, label: "1", desc: "Frustrating" },
      { val: 2, label: "2", desc: "Fine" },
      { val: 3, label: "3", desc: "Satisfying" },
    ],
  },
  {
    id: "meaningful_social_contact",
    prompt: "Social Contact",
    question: "How much meaningful social contact did you have?",
    options: [
      { val: 0, label: "0", desc: "None" },
      { val: 1, label: "1", desc: "Brief" },
      { val: 2, label: "2", desc: "Some" },
      { val: 3, label: "3", desc: "Substantial" },
    ],
  },
  {
    id: "routine_adherence",
    prompt: "Routine Adherence",
    question: "How well did you follow your normal routine?",
    options: [
      { val: 0, label: "0", desc: "Fell apart" },
      { val: 1, label: "1", desc: "Partial" },
      { val: 2, label: "2", desc: "Mostly" },
      { val: 3, label: "3", desc: "Complete" },
    ],
  },
  {
    id: "eating_out_of_control",
    prompt: "Eating Control",
    question: "Did eating feel out of control today?",
    options: [
      { val: 0, label: "0", desc: "No" },
      { val: 1, label: "1", desc: "Somewhat" },
      { val: 2, label: "2", desc: "Yes" },
    ],
  },
];

export function DailyContextCard({ initialData, onSave }: DailyContextCardProps) {
  const [data, setData] = useState<DailySubjectiveContext>(() => initialData || {});
  const [isSaved, setIsSaved] = useState(Boolean(initialData?.completed_at));

  const handleSelect = (key: keyof DailySubjectiveContext, val: number) => {
    const updated = {
      ...data,
      [key]: val,
      completed_at: new Date().toISOString(),
    };
    setData(updated);
    onSave(updated);
    setIsSaved(true);
  };

  const completedCount = [
    data.overall_stress,
    data.work_stress,
    data.work_satisfaction,
    data.meaningful_social_contact,
    data.routine_adherence,
    data.eating_out_of_control,
  ].filter((v) => v !== undefined).length;

  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
            DAILY SUBJECTIVE CONTEXT
          </div>
          <div className="text-sm font-semibold text-zinc-100">
            Evening Check (~5 taps)
          </div>
        </div>
        <div className="text-[11px] font-mono text-zinc-400">
          {completedCount}/6 completed {completedCount === 6 && "✓"}
        </div>
      </div>

      <div className="space-y-3 pt-1">
        {QUESTIONS.map((q) => {
          const currentVal = data[q.id as keyof DailySubjectiveContext] as number | undefined;
          return (
            <div key={q.id} className="space-y-1.5 p-2.5 rounded-xl bg-zinc-900/40 border border-zinc-900">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-200">{q.prompt}</span>
                <span className="text-[11px] font-mono text-emerald-400">
                  {currentVal !== undefined
                    ? q.options.find((o) => o.val === currentVal)?.desc
                    : "Tap rating"}
                </span>
              </div>
              <div className={`grid gap-1.5 ${q.options.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
                {q.options.map((opt) => {
                  const isSelected = currentVal === opt.val;
                  return (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => handleSelect(q.id as keyof DailySubjectiveContext, opt.val)}
                      className={`py-2 px-1 rounded-lg border text-center transition-all active:scale-[0.98] ${
                        isSelected
                          ? "bg-zinc-100 text-black border-white font-bold shadow-sm"
                          : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                      }`}
                    >
                      <div className="text-xs font-semibold">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
