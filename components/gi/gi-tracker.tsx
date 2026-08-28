"use client";

import React from "react";
import { BloatingLogger } from "./bloating-logger";
import { BowelMovementLogger } from "./bowel-movement-logger";
import { BloatingEvent, BowelMovementEvent } from "@/types/gi";

interface GITrackerProps {
  bloatingEvents?: BloatingEvent[];
  bowelMovements?: BowelMovementEvent[];
  onLogBloating: (event: BloatingEvent) => void;
  onLogBowelMovement: (event: BowelMovementEvent) => void;
}

export function GITracker({
  bloatingEvents = [],
  bowelMovements = [],
  onLogBloating,
  onLogBowelMovement,
}: GITrackerProps) {
  return (
    <div className="w-full space-y-3 pt-4 border-t border-zinc-900">
      <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
        <span>GI SYMPTOM TRACKING</span>
        <span>EVENT-DRIVEN LOG</span>
      </div>

      <div className="space-y-2.5">
        <BloatingLogger
          onLogBloating={onLogBloating}
          existingEvents={bloatingEvents}
        />
        <BowelMovementLogger
          onLogBowelMovement={onLogBowelMovement}
          existingEvents={bowelMovements}
        />
      </div>
    </div>
  );
}
