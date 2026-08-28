"use client";

import React, { useState } from "react";
import { BristolStoolType, BowelUrgency, BowelMovementEvent } from "@/types/gi";
import { formatLocalTime } from "@/lib/engine/protocol-engine";

interface BowelMovementLoggerProps {
  onLogBowelMovement: (event: BowelMovementEvent) => void;
  existingEvents?: BowelMovementEvent[];
}

const BRISTOL_TYPES: Array<{
  type: BristolStoolType;
  label: string;
  desc: string;
  category: "constipated" | "ideal" | "loose";
}> = [
  { type: 1, label: "Type 1", desc: "Separate hard lumps (hard to pass)", category: "constipated" },
  { type: 2, label: "Type 2", desc: "Sausage-shaped, but lumpy", category: "constipated" },
  { type: 3, label: "Type 3", desc: "Like a sausage with cracks on surface", category: "ideal" },
  { type: 4, label: "Type 4", desc: "Smooth & soft snake (Ideal)", category: "ideal" },
  { type: 5, label: "Type 5", desc: "Soft blobs with clear edges", category: "loose" },
  { type: 6, label: "Type 6", desc: "Fluffy ragged pieces, mushy", category: "loose" },
  { type: 7, label: "Type 7", desc: "Watery, no solid pieces (Liquid)", category: "loose" },
];

const URGENCY_OPTIONS: Array<{ value: BowelUrgency; label: string }> = [
  { value: 0, label: "0 — None" },
  { value: 1, label: "1 — Some" },
  { value: 2, label: "2 — Strong" },
];

export function BowelMovementLogger({ onLogBowelMovement, existingEvents = [] }: BowelMovementLoggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"bristol" | "details">("bristol");
  const [selectedBristol, setSelectedBristol] = useState<BristolStoolType | null>(null);
  const [selectedUrgency, setSelectedUrgency] = useState<BowelUrgency>(0);
  const [completeEvacuation, setCompleteEvacuation] = useState<boolean>(true);

  const handleSelectBristol = (type: BristolStoolType) => {
    setSelectedBristol(type);
    setStep("details");
  };

  const handleFinish = () => {
    if (!selectedBristol) return;
    const newEvent: BowelMovementEvent = {
      id: `bm_${Date.now()}`,
      timestamp: new Date().toISOString(),
      bristol_type: selectedBristol,
      urgency: selectedUrgency,
      complete_evacuation: completeEvacuation,
    };
    onLogBowelMovement(newEvent);
    setIsOpen(false);
    setStep("bristol");
    setSelectedBristol(null);
    setSelectedUrgency(0);
    setCompleteEvacuation(true);
  };

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3.5 space-y-3 transition-all">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="text-sm font-semibold text-zinc-100 flex items-center space-x-2">
            <span>🚽 Bowel Movement</span>
            {existingEvents.length > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                {existingEvents.length} logged today
              </span>
            )}
          </div>
          <div className="text-[11px] text-zinc-400">
            Bristol scale, urgency & completeness
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            setStep("bristol");
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all active:scale-[0.98] ${
            isOpen
              ? "bg-zinc-800 text-zinc-300 border border-zinc-700"
              : "bg-zinc-100 hover:bg-white text-black font-semibold"
          }`}
        >
          {isOpen ? "Close" : "+ Bowel movement"}
        </button>
      </div>

      {/* Existing events list today */}
      {existingEvents.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {existingEvents.map((ev) => (
            <div
              key={ev.id}
              className="text-[11px] font-mono px-2 py-0.5 rounded-md border border-zinc-800 bg-zinc-950 text-zinc-300 flex items-center space-x-1.5"
            >
              <span>{formatLocalTime(ev.timestamp)}:</span>
              <span className="font-semibold text-emerald-400">Bristol Type {ev.bristol_type}</span>
              <span className="text-zinc-500">•</span>
              <span className="text-zinc-400">{ev.complete_evacuation ? "Complete" : "Incomplete"}</span>
            </div>
          ))}
        </div>
      )}

      {/* Modal / Step Selector */}
      {isOpen && (
        <div className="pt-2 border-t border-zinc-800 space-y-3 animate-fade-in">
          {step === "bristol" && (
            <div className="space-y-2">
              <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                BRISTOL STOOL FORM SCALE (1–7)
              </div>
              <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto pr-1">
                {BRISTOL_TYPES.map((b) => (
                  <button
                    key={b.type}
                    type="button"
                    onClick={() => handleSelectBristol(b.type)}
                    className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800 text-left text-xs flex items-center justify-between transition-all active:scale-[0.99]"
                  >
                    <div>
                      <span className="font-mono font-bold text-zinc-100">{b.label}: </span>
                      <span className="text-zinc-300">{b.desc}</span>
                    </div>
                    <span className="text-zinc-500 text-xs">→</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "details" && selectedBristol && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-400">TYPE {selectedBristol} SELECTED</span>
                <button
                  type="button"
                  onClick={() => setStep("bristol")}
                  className="text-emerald-400 hover:underline"
                >
                  Change type
                </button>
              </div>

              {/* Urgency */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono text-zinc-400">URGENCY</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {URGENCY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSelectedUrgency(opt.value)}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-mono transition-all ${
                        selectedUrgency === opt.value
                          ? "bg-zinc-100 text-black border-white font-semibold"
                          : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Complete Evacuation */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono text-zinc-400">COMPLETE EVACUATION?</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCompleteEvacuation(true)}
                    className={`py-2 px-3 rounded-lg border text-xs font-mono font-medium transition-all ${
                      completeEvacuation
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                    }`}
                  >
                    ✓ Yes (Complete)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompleteEvacuation(false)}
                    className={`py-2 px-3 rounded-lg border text-xs font-mono font-medium transition-all ${
                      !completeEvacuation
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                    }`}
                  >
                    ✗ No (Incomplete)
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleFinish}
                className="w-full py-2.5 rounded-xl bg-zinc-100 text-black font-semibold text-xs hover:bg-white active:scale-[0.98] transition-all"
              >
                Save Bowel Movement Log ✓
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
