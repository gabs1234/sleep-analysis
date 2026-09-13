"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useStudySession } from "@/context/study-context";
import { formatDateKey } from "@/lib/engine/protocol-engine";
import { DailyRoutineSession } from "@/types/study";
import { createClientId } from "@/lib/client-id";

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function DailyRoutineCard() {
  const { preferences, state, updateNightRecord } = useStudySession();
  const config = preferences.routine;
  const today = formatDateKey();
  const record = state.records.find((item) => item.date === today);
  const sessions = useMemo(() => record?.routine_sessions || [], [record?.routine_sessions]);
  const completed = sessions.filter((session) => session.completed_at);
  const active = sessions.find((session) => !session.completed_at);
  const [now, setNow] = useState(() => Date.now());

  const targetSeconds = (active?.target_minutes || config.minutes_per_session) * 60;
  const elapsedSeconds = active ? Math.floor((now - new Date(active.started_at).getTime()) / 1000) : 0;
  const remainingSeconds = Math.max(0, targetSeconds - elapsedSeconds);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!active || remainingSeconds > 0) return;
    updateNightRecord(today, {
      routine_sessions: sessions.map((session) =>
        session.id === active.id ? { ...session, completed_at: new Date().toISOString() } : session
      ),
    });
  }, [active, remainingSeconds, sessions, today, updateNightRecord]);

  if (!config.enabled) return null;

  const startNext = () => {
    if (active || completed.length >= config.session_count) return;
    const session: DailyRoutineSession = {
      id: createClientId(config.id),
      activity_id: config.id,
      slot: completed.length + 1,
      target_minutes: config.minutes_per_session,
      started_at: new Date().toISOString(),
      source: "timer",
    };
    updateNightRecord(today, { routine_sessions: [...sessions, session] });
    setNow(Date.now());
  };

  const markDone = () => {
    if (active || completed.length >= config.session_count) return;
    const nowIso = new Date().toISOString();
    updateNightRecord(today, {
      routine_sessions: [
        ...sessions,
        {
          id: createClientId(config.id),
          activity_id: config.id,
          slot: completed.length + 1,
          target_minutes: config.minutes_per_session,
          started_at: nowIso,
          completed_at: nowIso,
          source: "manual",
        },
      ],
    });
  };

  const cancelTimer = () => {
    if (!active) return;
    updateNightRecord(today, { routine_sessions: sessions.filter((session) => session.id !== active.id) });
  };

  const undoLast = () => {
    const last = completed[completed.length - 1];
    if (!last) return;
    updateNightRecord(today, { routine_sessions: sessions.filter((session) => session.id !== last.id) });
  };

  const totalMinutes = completed.length * config.minutes_per_session;
  const goalMinutes = config.session_count * config.minutes_per_session;

  return (
    <section className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-mono text-sky-300 uppercase tracking-wider">Daily routine</div>
          <h2 className="text-sm font-semibold text-zinc-100 mt-1">{config.label}</h2>
          <p className="text-xs text-zinc-400 mt-1">{totalMinutes}/{goalMinutes} minutes · {completed.length}/{config.session_count} sessions</p>
        </div>
        <div className="flex gap-1.5" aria-label={`${completed.length} of ${config.session_count} sessions complete`}>
          {Array.from({ length: config.session_count }, (_, index) => (
            <span key={index} className={`w-3 h-3 rounded-full border ${index < completed.length ? "bg-sky-300 border-sky-300" : index === completed.length && active ? "bg-sky-400/30 border-sky-300 animate-pulse" : "border-zinc-700"}`} />
          ))}
        </div>
      </div>

      {active ? (
        <div className="rounded-xl border border-sky-400/30 bg-black p-4 text-center space-y-3">
          <div className="text-[10px] font-mono text-zinc-400 uppercase">Session {active.slot} in progress</div>
          <div className="text-4xl tabular-nums font-mono font-semibold text-sky-200">{formatCountdown(remainingSeconds)}</div>
          <button type="button" onClick={cancelTimer} className="text-xs font-mono text-zinc-500 hover:text-zinc-300">Cancel timer</button>
        </div>
      ) : completed.length >= config.session_count ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-center text-sm font-semibold text-emerald-300">Daily target complete ✓</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={startNext} className="py-3 rounded-xl bg-sky-200 text-sky-950 font-semibold text-xs">Start {config.minutes_per_session}-min timer</button>
          <button type="button" onClick={markDone} className="py-3 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-200 font-semibold text-xs">Already did one</button>
        </div>
      )}

      {completed.length > 0 && !active && <button type="button" onClick={undoLast} className="text-[11px] font-mono text-zinc-500 hover:text-zinc-300">Undo last completed session</button>}
    </section>
  );
}
