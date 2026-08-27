"use client";

import React, { useState, useMemo } from "react";
import { useStudySession } from "@/context/study-context";
import { NightRecord, WakeReason, ProtocolAdherence, UnusualNightReason } from "@/types/study";
import { formatDateKey } from "@/lib/engine/protocol-engine";

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

export function AdherenceCalendar() {
  const { state, updateNightRecord, deleteNightRecord } = useStudySession();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Edit form state
  const [editValidity, setEditValidity] = useState<boolean>(true);
  const [editReadiness, setEditReadiness] = useState<number>(2);
  const [editQuality, setEditQuality] = useState<number>(2);
  const [editWakeReason, setEditWakeReason] = useState<WakeReason>("natural");
  const [editAdherence, setEditAdherence] = useState<ProtocolAdherence>("yes");
  const [editUnusual, setEditUnusual] = useState<boolean>(false);
  const [editUnusualReasons, setEditUnusualReasons] = useState<UnusualNightReason[]>([]);
  const [editReasonNote, setEditReasonNote] = useState<string>("");
  const [amendSaveNotice, setAmendSaveNotice] = useState<string | null>(null);

  // Generate calendar matrix for past 28 days (4 weeks)
  const calendarDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const studyStart = state.started_at
      ? new Date(state.started_at)
      : new Date(today);
    studyStart.setHours(0, 0, 0, 0);

    const daysToShow = 28;
    const days: Array<{
      date: Date;
      dateStr: string;
      dayOfWeek: number;
      dayNumber: number;
      isToday: boolean;
      isPast: boolean;
      isFuture: boolean;
      record: NightRecord | null;
      status: "valid" | "excluded" | "missed" | "future" | "today_pending";
    }> = [];

    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = formatDateKey(d);

      const record = state.records.find((r) => r.date === dateStr) || null;
      const isToday = i === 0;
      const isFuture = d > today;
      const isBeforeStart = d < studyStart;

      let status: "valid" | "excluded" | "missed" | "future" | "today_pending" = "missed";

      if (isFuture) {
        status = "future";
      } else if (record) {
        if (record.is_valid) {
          status = "valid";
        } else {
          status = "excluded";
        }
      } else if (isToday) {
        status = "today_pending";
      } else if (isBeforeStart && state.records.length === 0) {
        status = "future";
      } else {
        status = "missed";
      }

      days.push({
        date: d,
        dateStr,
        dayOfWeek: d.getDay(),
        dayNumber: d.getDate(),
        isToday,
        isPast: !isToday && !isFuture,
        isFuture,
        record,
        status,
      });
    }

    return days;
  }, [state.records, state.started_at]);

  const stats = useMemo(() => {
    let valid = 0;
    let excluded = 0;
    let missed = 0;

    for (const d of calendarDays) {
      if (d.status === "valid") valid++;
      else if (d.status === "excluded") excluded++;
      else if (d.status === "missed") missed++;
    }

    const tracked = valid + excluded;
    const totalDays = tracked + missed;
    const adherencePct = totalDays > 0 ? Math.round((valid / totalDays) * 100) : 100;

    return { valid, excluded, missed, tracked, adherencePct };
  }, [calendarDays]);

  const selectedRecord = useMemo(() => {
    if (!selectedDate) return null;
    return state.records.find((r) => r.date === selectedDate) || null;
  }, [selectedDate, state.records]);

  // Open edit modal/card for a date
  const startEditing = (dateStr: string) => {
    setSelectedDate(dateStr);
    const existing = state.records.find((r) => r.date === dateStr);

    if (existing) {
      setEditValidity(existing.is_valid);
      setEditReadiness(existing.morning_assessment?.readiness ?? 2);
      setEditQuality(existing.morning_assessment?.sleep_quality ?? 2);
      setEditWakeReason(existing.morning_assessment?.wake_reason ?? "natural");
      setEditAdherence(existing.morning_assessment?.protocol_adherence ?? "yes");
      setEditUnusual(existing.morning_assessment?.unusual_night ?? false);
      setEditUnusualReasons(existing.morning_assessment?.unusual_reasons || []);
      setEditReasonNote(existing.exclusion_reason || existing.morning_assessment?.adherence_note || "");
    } else {
      setEditValidity(true);
      setEditReadiness(2);
      setEditQuality(2);
      setEditWakeReason("natural");
      setEditAdherence("yes");
      setEditUnusual(false);
      setEditUnusualReasons([]);
      setEditReasonNote("");
    }
    setIsEditing(true);
  };

  const toggleUnusualReason = (reason: UnusualNightReason) => {
    setEditUnusualReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  };

  const handleSaveAmendment = () => {
    if (!selectedDate) return;

    updateNightRecord(selectedDate, {
      is_valid: editValidity,
      exclusion_reason: !editValidity
        ? editReasonNote.trim() ||
          (editUnusualReasons.length > 0 ? editUnusualReasons.join(", ") : "Manual exclusion")
        : undefined,
      morning_assessment: {
        completed_at: selectedRecord?.morning_assessment?.completed_at || new Date().toISOString(),
        readiness: editReadiness,
        sleep_quality: editQuality,
        wake_reason: editWakeReason,
        protocol_adherence: editAdherence,
        adherence_note: editReasonNote.trim() || undefined,
        unusual_night: editUnusual,
        unusual_reasons: editUnusualReasons.length > 0 ? editUnusualReasons : undefined,
      },
    });

    setIsEditing(false);
    setAmendSaveNotice(`✓ Updated record for ${selectedDate}`);
    setTimeout(() => setAmendSaveNotice(null), 3000);
  };

  const handleDeleteEntry = () => {
    if (!selectedDate) return;
    if (confirm(`Delete tracking entry for ${selectedDate}?`)) {
      deleteNightRecord(selectedDate);
      setIsEditing(false);
      setSelectedDate(null);
      setAmendSaveNotice(`✓ Erased entry for ${selectedDate}`);
      setTimeout(() => setAmendSaveNotice(null), 3000);
    }
  };

  const getStatusColor = (
    status: "valid" | "excluded" | "missed" | "future" | "today_pending",
    isSelected: boolean
  ) => {
    switch (status) {
      case "valid":
        return isSelected
          ? "bg-emerald-400 text-black ring-2 ring-white ring-offset-2 ring-offset-black scale-105"
          : "bg-emerald-500 text-black hover:bg-emerald-400 hover:scale-105";
      case "excluded":
        return isSelected
          ? "bg-amber-400 text-black ring-2 ring-white ring-offset-2 ring-offset-black scale-105"
          : "bg-amber-500/80 text-black hover:bg-amber-400 hover:scale-105";
      case "today_pending":
        return isSelected
          ? "bg-zinc-700 text-white border border-zinc-400 ring-2 ring-white ring-offset-2 ring-offset-black"
          : "bg-zinc-900 border border-zinc-700 text-zinc-300 hover:border-zinc-500 animate-pulse";
      case "missed":
        return isSelected
          ? "bg-rose-950/60 border border-rose-600 text-rose-300 ring-2 ring-white ring-offset-2 ring-offset-black"
          : "bg-zinc-900/60 border border-dashed border-zinc-800 text-zinc-600 hover:border-zinc-700";
      case "future":
      default:
        return "bg-zinc-950 border border-zinc-900/60 text-zinc-800";
    }
  };

  return (
    <div className="p-5 rounded-2xl border border-zinc-900 bg-zinc-950 space-y-4">
      {/* Header & Adherence Metric */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
            TRACKING ADHERENCE
          </div>
          <div className="text-sm font-semibold text-zinc-100">
            Activity &amp; Valid Nights
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs font-mono font-bold text-emerald-400">
            {stats.adherencePct}% ADHERENCE
          </div>
          <div className="text-[10px] font-mono text-zinc-400">
            {stats.valid} valid • {stats.excluded} excluded
          </div>
        </div>
      </div>

      {amendSaveNotice && (
        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-300 text-center animate-fade-in">
          {amendSaveNotice}
        </div>
      )}

      {/* GitHub / MacroFactor Style Grid (4 weeks x 7 days) */}
      <div className="space-y-1.5 pt-1">
        {/* Day of Week Headers */}
        <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-mono text-zinc-400 pb-1">
          <span>M</span>
          <span>T</span>
          <span>W</span>
          <span>T</span>
          <span>F</span>
          <span>S</span>
          <span>S</span>
        </div>

        {/* Days Matrix */}
        <div className="grid grid-cols-7 gap-1.5">
          {calendarDays.map((day) => {
            const isSelected = selectedDate === day.dateStr;
            return (
              <button
                key={day.dateStr}
                type="button"
                onClick={() => {
                  setSelectedDate(day.dateStr);
                  setIsEditing(false);
                }}
                title={`${day.dateStr}: ${day.status}`}
                className={`h-9 rounded-lg flex flex-col items-center justify-center font-mono text-xs font-semibold transition-all cursor-pointer ${getStatusColor(
                  day.status,
                  isSelected
                )}`}
              >
                <span>{day.dayNumber}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-900 text-[11px] font-mono text-zinc-400">
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
          <span>Valid ({stats.valid})</span>
        </div>

        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/80 inline-block" />
          <span>Excluded ({stats.excluded})</span>
        </div>

        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-sm border border-dashed border-zinc-700 inline-block" />
          <span>Missed ({stats.missed})</span>
        </div>
      </div>

      {/* Selected Day Inspector View */}
      {selectedDate && !isEditing && (
        <div className="mt-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900/90 text-xs space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="font-mono text-zinc-200 font-semibold text-sm">
              {new Date(selectedDate + "T12:00:00").toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>

            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                selectedRecord?.is_valid
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : selectedRecord
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {selectedRecord?.is_valid
                ? "Valid Tracked ✓"
                : selectedRecord
                ? "Excluded / Abnormal"
                : "Not Recorded"}
            </span>
          </div>

          {selectedRecord ? (
            <div className="space-y-1.5 text-zinc-400 font-mono text-[11px] pt-1 border-t border-zinc-800/80">
              <div className="text-zinc-200">
                Protocol: {selectedRecord.prescribed_instruction}
              </div>

              {selectedRecord.exclusion_reason && (
                <div className="text-amber-400">
                  Reason: {selectedRecord.exclusion_reason}
                </div>
              )}

              {selectedRecord.morning_assessment && (
                <div className="text-zinc-300">
                  Readiness: {selectedRecord.morning_assessment.readiness}/3 • Quality:{" "}
                  {selectedRecord.morning_assessment.sleep_quality}/3 • Wake:{" "}
                  {selectedRecord.morning_assessment.wake_reason}
                </div>
              )}

              {selectedRecord.wearable_data && (
                <div className="text-zinc-400">
                  Smartwatch: {selectedRecord.wearable_data.duration_minutes}m duration •{" "}
                  {selectedRecord.wearable_data.sleep_efficiency_pct}% efficiency
                </div>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-zinc-400 font-mono pt-1">
              No tracking data recorded for this date.
            </div>
          )}

          <div className="pt-2 flex items-center justify-between border-t border-zinc-800/80">
            <button
              type="button"
              onClick={() => startEditing(selectedDate)}
              className="px-3 py-1.5 rounded-lg bg-zinc-100 text-black font-semibold text-xs hover:bg-white transition-all"
            >
              ✏ Amend / Edit this Day
            </button>

            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="text-[11px] font-mono text-zinc-400 hover:text-zinc-300"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Interactive Amendment Form */}
      {selectedDate && isEditing && (
        <div className="mt-3 p-4 rounded-xl border border-zinc-700 bg-zinc-900 text-xs space-y-4 animate-fade-in">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="font-mono text-zinc-200 font-semibold">
              Amend Record: {selectedDate}
            </span>
            <span className="text-[10px] font-mono text-amber-400">EDITING MODE</span>
          </div>

          {/* 1. Validity Override */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono text-zinc-400">
              STUDY VALIDITY STATUS
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEditValidity(true)}
                className={`py-2 px-3 rounded-lg border font-mono text-xs font-semibold transition-all ${
                  editValidity
                    ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                    : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                ✓ Valid Night (Counts)
              </button>
              <button
                type="button"
                onClick={() => setEditValidity(false)}
                className={`py-2 px-3 rounded-lg border font-mono text-xs font-semibold transition-all ${
                  !editValidity
                    ? "bg-amber-500/20 border-amber-500 text-amber-300"
                    : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                ⚠ Excluded (Abnormal)
              </button>
            </div>
          </div>

          {/* 2. Readiness (0 - 3) */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono text-zinc-400">
              READINESS: {editReadiness} (0=Wrecked, 1=Sluggish, 2=Ready, 3=Sharp)
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[0, 1, 2, 3].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setEditReadiness(val)}
                  className={`py-1.5 rounded font-mono font-semibold transition-all ${
                    editReadiness === val
                      ? "bg-zinc-100 text-black"
                      : "bg-zinc-950 border border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Sleep Quality (0 - 3) */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono text-zinc-400">
              SLEEP QUALITY: {editQuality} (0=Bad, 1=Poor, 2=Good, 3=Excellent)
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[0, 1, 2, 3].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setEditQuality(val)}
                  className={`py-1.5 rounded font-mono font-semibold transition-all ${
                    editQuality === val
                      ? "bg-zinc-100 text-black"
                      : "bg-zinc-950 border border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Protocol Adherence */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono text-zinc-400">
              PROTOCOL FOLLOWED?
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(["yes", "mostly", "no"] as ProtocolAdherence[]).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    setEditAdherence(val);
                    if (val === "no") setEditValidity(false);
                  }}
                  className={`py-1.5 rounded capitalize font-mono font-semibold transition-all ${
                    editAdherence === val
                      ? "bg-zinc-100 text-black"
                      : "bg-zinc-950 border border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          {/* 5. Unusual Factors */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-mono text-zinc-400">
                UNUSUAL FACTORS / CONFOUNDERS
              </label>
              <button
                type="button"
                onClick={() => {
                  const next = !editUnusual;
                  setEditUnusual(next);
                  if (next) setEditValidity(false);
                }}
                className="text-[10px] font-mono text-amber-400 underline"
              >
                {editUnusual ? "Mark Normal" : "+ Flag Unusual"}
              </button>
            </div>

            {editUnusual && (
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {UNUSUAL_TAGS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => toggleUnusualReason(t.value)}
                    className={`p-2 rounded border text-[10px] font-mono text-left transition-all ${
                      editUnusualReasons.includes(t.value)
                        ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 6. Notes / Reason */}
          <div className="space-y-1">
            <label className="block text-[11px] font-mono text-zinc-400">
              AMENDMENT NOTE / REASON (OPTIONAL)
            </label>
            <input
              type="text"
              value={editReasonNote}
              onChange={(e) => setEditReasonNote(e.target.value)}
              placeholder="e.g. Corrected illness tag, woke at 5am"
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center space-x-2">
            <button
              type="button"
              onClick={handleSaveAmendment}
              className="flex-1 py-2.5 rounded-lg bg-zinc-100 text-black font-semibold text-xs hover:bg-white transition-all"
            >
              Save Changes ✓
            </button>

            {selectedRecord && (
              <button
                type="button"
                onClick={handleDeleteEntry}
                className="py-2.5 px-3 rounded-lg border border-rose-900/40 bg-rose-950/20 hover:bg-rose-950/40 text-rose-300 text-xs font-mono transition-all"
              >
                Delete
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="py-2.5 px-3 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-400 text-xs font-mono hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
