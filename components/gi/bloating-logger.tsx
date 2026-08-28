"use client";

import React, { useState } from "react";
import { BloatingSeverity, BloatingEvent } from "@/types/gi";
import { formatLocalTime } from "@/lib/engine/protocol-engine";

interface BloatingLoggerProps {
  onLogBloating: (event: BloatingEvent) => void;
  existingEvents?: BloatingEvent[];
}

const BLOATING_LEVELS: Array<{
  value: BloatingSeverity;
  label: string;
  desc: string;
  badgeColor: string;
}> = [
  { value: 0, label: "0 — None", desc: "No abdominal fullness or distension", badgeColor: "border-zinc-700 text-zinc-300" },
  { value: 1, label: "1 — Mild", desc: "Slight awareness of pressure/fullness", badgeColor: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" },
  { value: 2, label: "2 — Noticeable", desc: "Uncomfortable distension, clothes tight", badgeColor: "border-amber-500/30 text-amber-400 bg-amber-500/10" },
  { value: 3, label: "3 — Strong", desc: "Painful, pronounced abdominal tightness", badgeColor: "border-rose-500/30 text-rose-400 bg-rose-500/10" },
];

export function BloatingLogger({ onLogBloating, existingEvents = [] }: BloatingLoggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSeverity, setSelectedSeverity] = useState<BloatingSeverity | null>(null);

  const handleSelectSeverity = (severity: BloatingSeverity) => {
    setSelectedSeverity(severity);
    const newEvent: BloatingEvent = {
      id: `bloat_${Date.now()}`,
      timestamp: new Date().toISOString(),
      severity,
    };
    onLogBloating(newEvent);
    setTimeout(() => {
      setIsOpen(false);
      setSelectedSeverity(null);
    }, 400);
  };

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3.5 space-y-3 transition-all">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="text-sm font-semibold text-zinc-100 flex items-center space-x-2">
            <span>💨 Bloating Check</span>
            {existingEvents.length > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                {existingEvents.length} logged today
              </span>
            )}
          </div>
          <div className="text-[11px] text-zinc-400">
            Log abdominal distension as it happens
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all active:scale-[0.98] ${
            isOpen
              ? "bg-zinc-800 text-zinc-300 border border-zinc-700"
              : "bg-zinc-100 hover:bg-white text-black font-semibold"
          }`}
        >
          {isOpen ? "Close" : "+ Bloated now"}
        </button>
      </div>

      {/* Existing events list today */}
      {existingEvents.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {existingEvents.map((ev) => {
            const level = BLOATING_LEVELS.find((l) => l.value === ev.severity);
            return (
              <div
                key={ev.id}
                className={`text-[11px] font-mono px-2 py-0.5 rounded-md border flex items-center space-x-1.5 ${
                  level?.badgeColor || "border-zinc-800 text-zinc-300"
                }`}
              >
                <span>{formatLocalTime(ev.timestamp)}:</span>
                <span className="font-semibold">{level?.label.split("—")[1]?.trim() || `Level ${ev.severity}`}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Selector Drawer */}
      {isOpen && (
        <div className="pt-2 border-t border-zinc-800 space-y-2 animate-fade-in">
          <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
            HOW SEVERE IS THE BLOATING RIGHT NOW?
          </div>
          <div className="grid grid-cols-2 gap-2">
            {BLOATING_LEVELS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelectSeverity(opt.value)}
                className={`p-2.5 rounded-lg border text-left text-xs transition-all active:scale-[0.98] ${
                  selectedSeverity === opt.value
                    ? "bg-zinc-100 text-black border-white font-semibold"
                    : "bg-zinc-950/80 border-zinc-800 text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className="text-[10px] opacity-70 mt-0.5 leading-tight">
                  {opt.desc}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
