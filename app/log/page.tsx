"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AppIcon, AppIconName } from "@/components/common/app-icon";
import { EveningQuestionnaire } from "@/components/evening/evening-questionnaire";
import { MorningCheckin } from "@/components/morning/morning-checkin";
import { useStudySession } from "@/context/study-context";
import { createClientId } from "@/lib/client-id";
import { formatDateKey, formatLocalTime } from "@/lib/engine/protocol-engine";
import { getActiveNightDateKey } from "@/lib/engine/time-context";
import { getPhaseTrackingActionIds } from "@/lib/config/study-config";
import { buildTimeline, TimelineItem, timelineItemsForDate, TimelineKind } from "@/lib/timeline/timeline-events";
import { consumeLogComposerRequest, OPEN_LOG_COMPOSER_EVENT } from "@/lib/timeline/log-composer-request";
import { BloatingEvent, BloatingSeverity, BowelMovementEvent, BristolStoolType } from "@/types/gi";
import { EveningActionDefinition } from "@/types/experiment";
import { LifeLogEvent, LifeLogEventKind, TimedEventLog } from "@/types/study";

type ComposerKind = LifeLogEventKind | "bowel" | "bloating";
type AddKind = ComposerKind | "timed";
type ActiveFlow = "morning" | "evening" | null;

interface TimedEventOption {
  id: string;
  label: string;
  defaultMinutes: number;
  source: "study" | "custom";
  group: "plan" | "custom";
}

const QUICK_ACTIONS: Array<{ kind: AddKind; label: string; icon: AppIconName; color: string }> = [
  { kind: "thought", label: "Thought", icon: "brain", color: "bg-[var(--log-purple-bg)] text-[var(--log-purple-fg)]" },
  { kind: "feeling", label: "Feeling", icon: "heart", color: "bg-[var(--log-pink-bg)] text-[var(--log-pink-fg)]" },
  { kind: "event", label: "Event", icon: "calendar", color: "bg-[var(--log-blue-bg)] text-[var(--log-blue-fg)]" },
  { kind: "sleep", label: "Sleep", icon: "moon", color: "bg-[var(--log-indigo-bg)] text-[var(--log-indigo-fg)]" },
  { kind: "bowel", label: "Bowel", icon: "bathroom", color: "bg-[var(--log-orange-bg)] text-[var(--log-orange-fg)]" },
  { kind: "bloating", label: "Bloating", icon: "activity", color: "bg-[var(--log-green-bg)] text-[var(--log-green-fg)]" },
  { kind: "timed", label: "Timed", icon: "clock", color: "bg-[var(--log-blue-bg)] text-[var(--log-blue-fg)]" },
];

const KIND_STYLE: Record<TimelineKind, { icon: AppIconName; className: string }> = {
  thought: { icon: "brain", className: "bg-[var(--log-purple-bg)] text-[var(--log-purple-fg)]" },
  feeling: { icon: "heart", className: "bg-[var(--log-pink-bg)] text-[var(--log-pink-fg)]" },
  event: { icon: "calendar", className: "bg-[var(--log-blue-bg)] text-[var(--log-blue-fg)]" },
  sleep: { icon: "moon", className: "bg-[var(--log-indigo-bg)] text-[var(--log-indigo-fg)]" },
  bowel: { icon: "bathroom", className: "bg-[var(--log-orange-bg)] text-[var(--log-orange-fg)]" },
  bloating: { icon: "activity", className: "bg-[var(--log-green-bg)] text-[var(--log-green-fg)]" },
  morning: { icon: "sun", className: "bg-[var(--log-yellow-bg)] text-[var(--log-yellow-fg)]" },
  evening: { icon: "book", className: "bg-[var(--log-purple-bg)] text-[var(--log-purple-fg)]" },
  protocol: { icon: "spark", className: "bg-[var(--log-green-bg)] text-[var(--log-green-fg)]" },
  caffeine: { icon: "coffee", className: "bg-[var(--log-orange-bg)] text-[var(--log-orange-fg)]" },
  routine: { icon: "activity", className: "bg-[var(--log-green-bg)] text-[var(--log-green-fg)]" },
  timed: { icon: "clock", className: "bg-[var(--log-blue-bg)] text-[var(--log-blue-fg)]" },
};

const TRACKING_ACTION_PRESENTATION: Record<string, { label: string; icon: AppIconName; color: string }> = {
  meal_end: { label: "Finished last meal", icon: "coffee", color: "bg-[var(--log-orange-bg)] text-[var(--log-orange-fg)]" },
  screen_end: { label: "Screens done", icon: "x", color: "bg-[var(--log-blue-bg)] text-[var(--log-blue-fg)]" },
  winddown_start: { label: "Start pre-sleep routine", icon: "book", color: "bg-[var(--log-purple-bg)] text-[var(--log-purple-fg)]" },
  in_bed_ready: { label: "In bed", icon: "moon", color: "bg-[var(--log-indigo-bg)] text-[var(--log-indigo-fg)]" },
  lights_out: { label: "Lights out", icon: "spark", color: "bg-[var(--log-green-bg)] text-[var(--log-green-fg)]" },
};

function shiftDate(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return formatDateKey(date);
}

function weekFor(dateKey: string): string[] {
  const date = new Date(`${dateKey}T12:00:00`);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date);
    day.setDate(day.getDate() + index);
    return formatDateKey(day);
  });
}

function localTimestamp(dateKey: string, time: string): string {
  return new Date(`${dateKey}T${time}:00`).toISOString();
}

function currentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function timeInputValue(timestamp: string): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function timeForHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function hourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function friendlyDate(dateKey: string): string {
  const today = formatDateKey();
  if (dateKey === today) return "Today";
  if (dateKey === shiftDate(today, -1)) return "Yesterday";
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function LogPage() {
  const { isReady, state, activePhase, preferences, updatePreferences, updateNightRecord, logEveningAction, viewContext } = useStudySession();
  const today = formatDateKey();
  const [selectedDate, setSelectedDate] = useState(today);
  const [composer, setComposer] = useState<{ kind: AddKind; time: string; editingItem?: TimelineItem } | null>(null);
  const [protocolEditor, setProtocolEditor] = useState<TimelineItem | null>(null);
  const [pickerTime, setPickerTime] = useState<string | null>(null);
  const [showAllHours, setShowAllHours] = useState(true);
  const [activeFlow, setActiveFlow] = useState<ActiveFlow>(null);
  const allItems = useMemo(() => buildTimeline(state.records), [state.records]);
  const visibleItems = useMemo(
    () => timelineItemsForDate(allItems, selectedDate).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [allItems, selectedDate]
  );
  const weekDates = useMemo(() => weekFor(selectedDate), [selectedDate]);
  const morningRecord = viewContext.targetNightRecord || undefined;
  const tonightRecord = state.records.find((record) => record.date === getActiveNightDateKey());
  const trackingActions = useMemo(() => {
    const configuredActions = activePhase.evening_actions || [];
    const relevantIds = getPhaseTrackingActionIds(activePhase.id);
    return relevantIds
      ? configuredActions.filter((action) => relevantIds.includes(action.id))
      : configuredActions;
  }, [activePhase]);
  const timedEventOptions = useMemo<TimedEventOption[]>(() => {
    const planOptions: TimedEventOption[] = (activePhase.timed_events || []).map((event) => ({
      id: `study:${event.id}`,
      label: event.label,
      defaultMinutes: event.default_minutes,
      source: "study",
      group: "plan",
    }));
    if (preferences.routine.enabled) {
      planOptions.push({
        id: `routine:${preferences.routine.id}`,
        label: preferences.routine.label,
        defaultMinutes: preferences.routine.minutes_per_session,
        source: "study",
        group: "plan",
      });
    }

    const remembered = new Map(
      (preferences.timed_event_tags || []).map((tag) => [tag.id, {
        id: tag.id,
        label: tag.label,
        defaultMinutes: tag.default_minutes,
        source: "custom" as const,
        group: "custom" as const,
      }])
    );
    for (const record of state.records) {
      for (const event of record.timed_events || []) {
        if (event.source !== "custom" || remembered.has(event.tag_id)) continue;
        remembered.set(event.tag_id, {
          id: event.tag_id,
          label: event.label,
          defaultMinutes: event.duration_minutes,
          source: "custom",
          group: "custom",
        });
      }
    }
    return [...planOptions, ...remembered.values()];
  }, [activePhase.timed_events, preferences.routine, preferences.timed_event_tags, state.records]);
  const lastTimedDurations = useMemo(() => {
    const latest = new Map<string, { timestamp: string; minutes: number }>();
    for (const record of state.records) {
      for (const event of record.timed_events || []) {
        const current = latest.get(event.tag_id);
        const enteredAt = event.logged_at || event.timestamp;
        if (!current || enteredAt > current.timestamp) {
          latest.set(event.tag_id, { timestamp: enteredAt, minutes: event.duration_minutes });
        }
      }
    }
    return new Map([...latest].map(([id, value]) => [id, value.minutes]));
  }, [state.records]);
  const itemsByHour = useMemo(() => {
    const grouped = new Map<number, TimelineItem[]>();
    for (const item of visibleItems) {
      const hour = new Date(item.timestamp).getHours();
      grouped.set(hour, [...(grouped.get(hour) || []), item]);
    }
    return grouped;
  }, [visibleItems]);
  const displayedHours = useMemo(() => {
    if (showAllHours) return Array.from({ length: 24 }, (_, index) => index);
    const occupiedHours = new Set(itemsByHour.keys());
    if (selectedDate === today) occupiedHours.add(new Date().getHours());
    if (!occupiedHours.size) return [12];
    return [...occupiedHours].sort((a, b) => a - b);
  }, [itemsByHour, selectedDate, showAllHours, today]);

  useEffect(() => {
    const showKindPicker = () => {
      setActiveFlow(null);
      setComposer(null);
      setPickerTime(currentTime());
    };
    const openComposer = () => {
      consumeLogComposerRequest();
      showKindPicker();
    };
    const consumePendingRequest = () => {
      const requestedByHash = window.location.hash === "#add";
      const requestedBeforeNavigation = consumeLogComposerRequest();
      if (!requestedByHash && !requestedBeforeNavigation) return;
      showKindPicker();
      if (requestedByHash) {
        const cleanUrl = `${window.location.pathname}${window.location.search}`;
        window.history.replaceState(window.history.state, "", cleanUrl);
      }
    };

    window.addEventListener(OPEN_LOG_COMPOSER_EVENT, openComposer);
    window.addEventListener("hashchange", consumePendingRequest);
    window.addEventListener("pageshow", consumePendingRequest);
    const frame = window.requestAnimationFrame(consumePendingRequest);
    const fallback = window.setTimeout(consumePendingRequest, 50);

    return () => {
      window.removeEventListener(OPEN_LOG_COMPOSER_EVENT, openComposer);
      window.removeEventListener("hashchange", consumePendingRequest);
      window.removeEventListener("pageshow", consumePendingRequest);
      window.cancelAnimationFrame(frame);
      window.clearTimeout(fallback);
    };
  }, []);

  const saveLifeEvent = (event: LifeLogEvent, editingItem?: TimelineItem) => {
    const recordDate = editingItem?.recordDate || selectedDate;
    const record = state.records.find((item) => item.date === recordDate);
    const events = record?.life_log_events || [];
    updateNightRecord(recordDate, {
      life_log_events: editingItem ? events.map((entry) => entry.id === event.id ? event : entry) : [...events, event],
    });
  };

  const saveBowelMovement = (event: BowelMovementEvent, editingItem?: TimelineItem) => {
    const recordDate = editingItem?.recordDate || selectedDate;
    const record = state.records.find((item) => item.date === recordDate);
    const events = record?.bowel_movements || [];
    updateNightRecord(recordDate, {
      bowel_movements: editingItem ? events.map((entry) => entry.id === event.id ? event : entry) : [...events, event],
    });
  };

  const saveBloating = (event: BloatingEvent, editingItem?: TimelineItem) => {
    const recordDate = editingItem?.recordDate || selectedDate;
    const record = state.records.find((item) => item.date === recordDate);
    const events = record?.bloating_events || [];
    updateNightRecord(recordDate, {
      bloating_events: editingItem ? events.map((entry) => entry.id === event.id ? event : entry) : [...events, event],
    });
  };

  const saveTimedEvent = (event: TimedEventLog, editingItem?: TimelineItem) => {
    const recordDate = editingItem?.recordDate || selectedDate;
    const record = state.records.find((item) => item.date === recordDate);
    const events = record?.timed_events || [];
    updateNightRecord(recordDate, {
      timed_events: editingItem ? events.map((entry) => entry.id === event.id ? event : entry) : [...events, event],
    });
  };

  const createTimedEventTag = (label: string, defaultMinutes: number): TimedEventOption => {
    const existing = (preferences.timed_event_tags || []).find(
      (tag) => tag.label.toLocaleLowerCase() === label.trim().toLocaleLowerCase()
    );
    if (existing) {
      return {
        id: existing.id,
        label: existing.label,
        defaultMinutes: existing.default_minutes,
        source: "custom",
        group: "custom",
      };
    }
    const tag = {
      id: createClientId("timed-tag"),
      label: label.trim(),
      default_minutes: defaultMinutes,
    };
    updatePreferences({
      ...preferences,
      timed_event_tags: [...(preferences.timed_event_tags || []), tag],
    });
    return {
      id: tag.id,
      label: tag.label,
      defaultMinutes: tag.default_minutes,
      source: "custom",
      group: "custom",
    };
  };

  const removeItem = (item: TimelineItem) => {
    if (!item.removable) return;
    const record = state.records.find((candidate) => candidate.date === item.recordDate);
    if (!record) return;
    const { collection, id } = item.removable;
    if (collection === "life_log_events") updateNightRecord(item.recordDate, { life_log_events: (record.life_log_events || []).filter((entry) => entry.id !== id) });
    else if (collection === "bowel_movements") updateNightRecord(item.recordDate, { bowel_movements: (record.bowel_movements || []).filter((entry) => entry.id !== id) });
    else if (collection === "bloating_events") updateNightRecord(item.recordDate, { bloating_events: (record.bloating_events || []).filter((entry) => entry.id !== id) });
    else if (collection === "timed_events") updateNightRecord(item.recordDate, { timed_events: (record.timed_events || []).filter((entry) => entry.id !== id) });
    else updateNightRecord(item.recordDate, { evening_actions: record.evening_actions.filter((entry) => entry.action_id !== id) });
  };

  const editItem = (item: TimelineItem) => {
    if (!item.removable) return;
    setPickerTime(null);
    if (item.removable.collection === "evening_actions") {
      setProtocolEditor(item);
      setComposer(null);
      return;
    }
    const record = state.records.find((candidate) => candidate.date === item.recordDate);
    if (!record) return;
    let kind: AddKind | undefined;
    if (item.removable.collection === "life_log_events") {
      kind = record.life_log_events?.find((entry) => entry.id === item.removable?.id)?.kind;
    } else if (item.removable.collection === "bowel_movements") {
      kind = "bowel";
    } else if (item.removable.collection === "bloating_events") {
      kind = "bloating";
    } else if (item.removable.collection === "timed_events") {
      kind = "timed";
    }
    if (kind) setComposer({ kind, time: timeInputValue(item.timestamp), editingItem: item });
  };

  const saveProtocolEdit = (item: TimelineItem, time: string) => {
    if (!item.removable || item.removable.collection !== "evening_actions") return;
    const record = state.records.find((candidate) => candidate.date === item.recordDate);
    if (!record) return;
    updateNightRecord(item.recordDate, {
      evening_actions: record.evening_actions.map((action) => action.action_id === item.removable?.id
        ? { ...action, timestamp: localTimestamp(selectedDate, time), captured_at: new Date().toISOString() }
        : action),
    });
    setProtocolEditor(null);
  };

  const logTrackingAction = (action: EveningActionDefinition, time: string) => {
    const presentation = TRACKING_ACTION_PRESENTATION[action.id];
    logEveningAction(
      action.id,
      presentation?.label || action.label,
      localTimestamp(selectedDate, time),
      selectedDate
    );
    setPickerTime(null);
  };

  const editingRecord = composer?.editingItem
    ? state.records.find((record) => record.date === composer.editingItem?.recordDate)
    : undefined;
  const editingId = composer?.editingItem?.removable?.id;
  const initialLifeEvent = editingRecord?.life_log_events?.find((event) => event.id === editingId);
  const initialBowelEvent = editingRecord?.bowel_movements?.find((event) => event.id === editingId);
  const initialBloatingEvent = editingRecord?.bloating_events?.find((event) => event.id === editingId);
  const initialTimedEvent = editingRecord?.timed_events?.find((event) => event.id === editingId);

  if (!isReady) return <div className="flex min-h-[60vh] items-center justify-center bg-[var(--log-bg)]"><div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--log-line)] border-t-[var(--log-accent)]" /></div>;

  if (activeFlow === "morning") return <MorningCheckin initialData={morningRecord?.morning_assessment} hasEveningPlan={Boolean(morningRecord?.evening_plan?.length)} onComplete={() => setActiveFlow(null)} onClose={() => setActiveFlow(null)} />;

  if (activeFlow === "evening") {
    return <EveningQuestionnaire initialContext={tonightRecord?.daily_context} initialPreSleep={tonightRecord?.pre_sleep_state} initialCompleteness={tonightRecord?.food_log_completeness} initialFallback={tonightRecord?.nutrition_fallback} importedFoodCount={tonightRecord?.raw_food_records?.length || 0} onComplete={() => setActiveFlow(null)} onClose={() => setActiveFlow(null)} />;
  }

  return (
    <main className="min-h-screen bg-[var(--log-bg)] pb-28 text-[var(--log-text)]">
      <div className="mx-auto w-full max-w-xl">
        <header className="bg-[var(--log-header)] px-3 pb-4 pt-5">
          <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center">
            <button type="button" onClick={() => setShowAllHours((value) => !value)} className={`flex h-9 w-9 items-center justify-center rounded-lg ${showAllHours ? "text-[var(--log-text)]" : "bg-[var(--log-surface-muted)] text-[var(--log-accent)]"}`} aria-label={showAllHours ? "Show compact timeline" : "Show every hour"} aria-pressed={!showAllHours}><AppIcon name="log" size={21} /></button>
            <div className="flex items-center justify-center gap-4">
              <button type="button" onClick={() => setSelectedDate(shiftDate(selectedDate, -1))} className="p-1 text-[var(--log-text)]" aria-label="Previous day"><AppIcon name="chevron-left" size={22} strokeWidth={2.5} /></button>
              <button type="button" onClick={() => setSelectedDate(today)} className="min-w-20 text-center text-[17px] font-bold tracking-[-0.02em]">{friendlyDate(selectedDate)}</button>
              <button type="button" onClick={() => setSelectedDate(shiftDate(selectedDate, 1))} disabled={selectedDate >= today} className="p-1 text-[var(--log-text)] disabled:opacity-20" aria-label="Next day"><AppIcon name="chevron-right" size={22} strokeWidth={2.5} /></button>
            </div>
            <span className="h-9 w-9" aria-hidden="true" />
          </div>

          <div className="mt-4 grid grid-cols-7 gap-0.5">
            {weekDates.map((dateKey) => {
              const date = new Date(`${dateKey}T12:00:00`);
              const selected = dateKey === selectedDate;
              const count = timelineItemsForDate(allItems, dateKey).length;
              return (
                <button key={dateKey} type="button" onClick={() => setSelectedDate(dateKey)} className="flex flex-col items-center gap-1">
                  <span className={`flex h-[3.3rem] w-[2.45rem] flex-col items-center justify-center rounded-full border-2 ${selected ? "border-[var(--log-accent)] bg-[var(--log-surface-muted)]" : count ? "border-[var(--log-accent)]" : "border-[var(--log-line)]"}`}>
                    <span className="text-[10px] font-medium text-[var(--log-muted)]">{date.toLocaleDateString(undefined, { weekday: "narrow" })}</span>
                    <span className="mt-0.5 text-[15px] font-semibold">{date.getDate()}</span>
                  </span>
                  <span className={`h-1.5 w-1.5 rounded-full ${dateKey === today ? "bg-[var(--log-text)]" : count ? "bg-[var(--log-accent)]" : "bg-transparent"}`} />
                </button>
              );
            })}
          </div>

        </header>

        <section className="relative px-3 pb-5 pt-5 before:absolute before:bottom-0 before:left-[3.15rem] before:top-5 before:w-px before:bg-[var(--log-line)]">
          {displayedHours.map((hour) => {
            const hourItems = itemsByHour.get(hour) || [];
            return (
              <div key={hour} className="relative pb-7">
                <div className="relative z-10 grid grid-cols-[5.6rem_1fr] items-center">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setPickerTime(timeForHour(hour))} className="min-w-[3.7rem] rounded-full bg-[var(--log-surface-muted)] px-2.5 py-2 text-center text-[12px] font-semibold text-[var(--log-text)]">{hourLabel(hour)}</button>
                    <button type="button" onClick={() => setPickerTime(timeForHour(hour))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--log-surface-muted)] text-[var(--log-text)]" aria-label={`Add at ${hourLabel(hour)}`}><AppIcon name="plus" size={17} strokeWidth={2.3} /></button>
                  </div>
                  <div className="pl-3 text-right text-[10px] font-medium text-[var(--log-faint)]">{hourItems.length ? `${hourItems.length} ${hourItems.length === 1 ? "entry" : "entries"}` : ""}</div>
                </div>

                {hourItems.map((item) => {
                  const style = KIND_STYLE[item.kind];
                  return (
                    <article key={item.id} className="group relative z-10 mt-3 grid grid-cols-[5.6rem_1fr] items-center">
                      <time className="pr-3 text-center text-[10px] font-medium tabular-nums text-[var(--log-muted)]">{formatLocalTime(item.timestamp)}</time>
                      <div
                        className={`ml-3 flex min-h-[4.35rem] items-center gap-3 rounded-xl bg-[var(--log-surface)] px-3.5 py-3 shadow-[var(--log-shadow)] ${item.removable ? "cursor-pointer transition-transform active:scale-[0.99]" : ""}`}
                        onClick={() => editItem(item)}
                        onKeyDown={(event) => { if (item.removable && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); editItem(item); } }}
                        role={item.removable ? "button" : undefined}
                        tabIndex={item.removable ? 0 : undefined}
                        aria-label={item.removable ? `Edit ${item.title}` : undefined}
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.className}`}><AppIcon name={style.icon} size={18} /></span>
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate text-[13px] font-semibold text-[var(--log-text)]">{item.title}</h2>
                          {item.detail && <p className={`mt-1 text-[11px] leading-relaxed text-[var(--log-muted)] ${item.kind === "morning" || item.kind === "evening" ? "" : "line-clamp-2"}`}>{item.detail}</p>}
                        </div>
                        {item.removable && <button type="button" onClick={(event) => { event.stopPropagation(); removeItem(item); }} className="rounded-md p-1.5 text-[var(--log-faint)] opacity-0 transition-opacity hover:text-[#d95672] group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${item.title}`}><AppIcon name="trash" size={15} /></button>}
                      </div>
                    </article>
                  );
                })}
              </div>
            );
          })}
        </section>
      </div>

      {pickerTime && <KindPicker time={pickerTime} studyName={activePhase.name} trackingActions={trackingActions} showSummaries={selectedDate === today} onClose={() => setPickerTime(null)} onTrack={(action) => logTrackingAction(action, pickerTime)} onSelect={(kind) => { setComposer({ kind, time: pickerTime }); setPickerTime(null); }} onMorning={() => { setPickerTime(null); setActiveFlow("morning"); }} onEvening={() => { setPickerTime(null); setActiveFlow("evening"); }} />}

      {composer?.kind === "timed" && <TimedEventComposer initialTime={composer.time} initialEvent={initialTimedEvent} dateKey={selectedDate} options={timedEventOptions} lastDurations={lastTimedDurations} onCreateTag={createTimedEventTag} onClose={() => setComposer(null)} onSave={(entry) => { saveTimedEvent(entry, composer.editingItem); setComposer(null); }} />}

      {composer && composer.kind !== "timed" && <LogComposer kind={composer.kind} initialTime={composer.time} initialLifeEvent={initialLifeEvent} initialBowelEvent={initialBowelEvent} initialBloatingEvent={initialBloatingEvent} dateKey={selectedDate} onClose={() => setComposer(null)} onSaveLife={(entry) => { saveLifeEvent(entry, composer.editingItem); setComposer(null); }} onSaveBowel={(entry) => { saveBowelMovement(entry, composer.editingItem); setComposer(null); }} onSaveBloating={(entry) => { saveBloating(entry, composer.editingItem); setComposer(null); }} />}

      {protocolEditor && <ProtocolEventEditor item={protocolEditor} initialTime={timeInputValue(protocolEditor.timestamp)} dateKey={selectedDate} onClose={() => setProtocolEditor(null)} onSave={(time) => saveProtocolEdit(protocolEditor, time)} />}
    </main>
  );
}

function KindPicker({ time, studyName, trackingActions, showSummaries, onClose, onTrack, onSelect, onMorning, onEvening }: { time: string; studyName: string; trackingActions: EveningActionDefinition[]; showSummaries: boolean; onClose: () => void; onTrack: (action: EveningActionDefinition) => void; onSelect: (kind: AddKind) => void; onMorning: () => void; onEvening: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 px-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="mb-2 max-h-[92vh] w-full max-w-xl animate-sheet-up overflow-y-auto rounded-[1.7rem] bg-[var(--log-surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[var(--log-text)] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="mb-5 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--log-faint)]">Add at {time}</p><h2 className="mt-1 text-xl font-semibold">What are you logging?</h2></div><button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--log-surface-muted)] text-[var(--log-muted)]" aria-label="Close"><AppIcon name="x" size={17} /></button></div>
        {trackingActions.length > 0 && (
          <div className="mb-4">
            <div className="mb-2.5 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--log-faint)]">Study timestamps</span><span className="max-w-[12rem] truncate text-[10px] text-[var(--log-muted)]">{studyName}</span></div>
            <div className="grid grid-cols-2 gap-2">
              {trackingActions.map((action) => {
                const presentation = TRACKING_ACTION_PRESENTATION[action.id] || { label: action.label, icon: "clock" as AppIconName, color: "bg-[var(--log-blue-bg)] text-[var(--log-blue-fg)]" };
                return <button key={action.id} type="button" onClick={() => onTrack(action)} className="flex min-h-14 items-center gap-2.5 rounded-xl bg-[var(--log-surface-muted)] px-3 py-2.5 text-left"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${presentation.color}`}><AppIcon name={presentation.icon} size={16} /></span><span className="text-[11px] font-semibold leading-tight text-[var(--log-text)]">{presentation.label}</span></button>;
              })}
            </div>
          </div>
        )}
        <div className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--log-faint)]">Other entries</div>
        <div className="grid grid-cols-3 gap-3">{QUICK_ACTIONS.map((action) => <button key={action.kind} type="button" onClick={() => onSelect(action.kind)} className="flex flex-col items-center gap-2.5 rounded-2xl bg-[var(--log-surface-muted)] px-2 py-4 text-center"><span className={`flex h-11 w-11 items-center justify-center rounded-xl ${action.color}`}><AppIcon name={action.icon} size={19} /></span><span className="text-[11px] font-semibold text-[var(--log-text)]">{action.label}</span></button>)}</div>
        {showSummaries && <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--log-line)] pt-4"><button type="button" onClick={onMorning} className="flex items-center gap-2 rounded-xl bg-[var(--log-yellow-bg)] px-3 py-3 text-left text-xs font-semibold text-[var(--log-yellow-fg)]"><AppIcon name="sun" size={17} /> Morning summary</button><button type="button" onClick={onEvening} className="flex items-center gap-2 rounded-xl bg-[var(--log-purple-bg)] px-3 py-3 text-left text-xs font-semibold text-[var(--log-purple-fg)]"><AppIcon name="book" size={17} /> Evening summary</button></div>}
      </section>
    </div>
  );
}

function TimedEventComposer({ initialTime, initialEvent, dateKey, options, lastDurations, onCreateTag, onClose, onSave }: {
  initialTime: string;
  initialEvent?: TimedEventLog;
  dateKey: string;
  options: TimedEventOption[];
  lastDurations: Map<string, number>;
  onCreateTag: (label: string, defaultMinutes: number) => TimedEventOption;
  onClose: () => void;
  onSave: (event: TimedEventLog) => void;
}) {
  const savedOption = initialEvent ? options.find((option) => option.id === initialEvent.tag_id) || {
    id: initialEvent.tag_id,
    label: initialEvent.label,
    defaultMinutes: initialEvent.duration_minutes,
    source: initialEvent.source,
    group: initialEvent.source === "custom" ? "custom" as const : "plan" as const,
  } : null;
  const firstOption = savedOption || options[0] || null;
  const [time, setTime] = useState(initialTime);
  const [selected, setSelected] = useState<TimedEventOption | null>(firstOption);
  const [duration, setDuration] = useState(() => initialEvent?.duration_minutes ?? (firstOption ? lastDurations.get(firstOption.id) ?? firstOption.defaultMinutes : 60));
  const [note, setNote] = useState(initialEvent?.note || "");
  const [addingCustom, setAddingCustom] = useState(options.length === 0);
  const [customLabel, setCustomLabel] = useState("");
  const inputClass = "w-full rounded-xl bg-[var(--log-surface-muted)] px-3.5 py-3 text-sm text-[var(--log-text)] outline-none placeholder:text-[var(--log-faint)] focus:ring-2 focus:ring-[var(--log-accent)]/20";
  const visibleOptions = selected && !options.some((option) => option.id === selected.id)
    ? [...options, selected]
    : options;
  const planOptions = visibleOptions.filter((option) => option.group === "plan");
  const customOptions = visibleOptions.filter((option) => option.group === "custom");

  const choose = (option: TimedEventOption) => {
    setSelected(option);
    setDuration(lastDurations.get(option.id) ?? option.defaultMinutes);
    setAddingCustom(false);
  };

  const addCustom = () => {
    const label = customLabel.trim();
    if (!label) return;
    const option = onCreateTag(label, Math.max(1, duration));
    setSelected(option);
    setDuration(lastDurations.get(option.id) ?? option.defaultMinutes);
    setCustomLabel("");
    setAddingCustom(false);
  };

  const save = () => {
    if (!selected || duration < 1) return;
    onSave({
      id: initialEvent?.id || createClientId("timed"),
      tag_id: selected.id,
      label: selected.label,
      timestamp: localTimestamp(dateKey, time),
      logged_at: new Date().toISOString(),
      duration_minutes: duration,
      source: selected.source,
      note: note.trim() || undefined,
    });
  };

  const optionButton = (option: TimedEventOption) => (
    <button
      key={option.id}
      type="button"
      onClick={() => choose(option)}
      className={`rounded-xl px-3 py-3 text-left transition-colors ${selected?.id === option.id ? "bg-[var(--log-accent)] text-white" : "bg-[var(--log-surface-muted)] text-[var(--log-text)]"}`}
    >
      <span className="block text-xs font-semibold">{option.label}</span>
      <span className={`mt-0.5 block text-[10px] ${selected?.id === option.id ? "text-white/70" : "text-[var(--log-muted)]"}`}>
        {lastDurations.has(option.id) ? `Last: ${lastDurations.get(option.id)} min` : `Default: ${option.defaultMinutes} min`}
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 px-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="mb-2 max-h-[92vh] w-full max-w-xl animate-sheet-up overflow-y-auto rounded-[1.7rem] bg-[var(--log-surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[var(--log-text)] shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
        <div className="mb-5 flex items-center justify-between">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--log-faint)]">{friendlyDate(dateKey)} · {time}</p><h2 className="mt-1 text-xl font-semibold">{initialEvent ? "Edit timed event" : "Log timed event"}</h2></div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--log-surface-muted)] text-[var(--log-muted)]" aria-label="Close"><AppIcon name="x" size={17} /></button>
        </div>

        <div className="space-y-4">
          {planOptions.length > 0 && <div><span className="mb-2 block text-[11px] font-semibold text-[var(--log-muted)]">Current plan</span><div className="grid grid-cols-2 gap-2">{planOptions.map(optionButton)}</div></div>}
          {customOptions.length > 0 && <div><span className="mb-2 block text-[11px] font-semibold text-[var(--log-muted)]">Your activities</span><div className="grid grid-cols-2 gap-2">{customOptions.map(optionButton)}</div></div>}

          {addingCustom ? (
            <div className="rounded-2xl bg-[var(--log-surface-muted)] p-3">
              <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-[var(--log-muted)]">New activity name</span><input autoFocus value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addCustom(); }} placeholder="Yoga, meditation, reading…" className="w-full rounded-xl bg-[var(--log-surface)] px-3.5 py-3 text-sm text-[var(--log-text)] outline-none placeholder:text-[var(--log-faint)]" /></label>
              <button type="button" onClick={addCustom} disabled={!customLabel.trim()} className="mt-2.5 w-full rounded-xl bg-[var(--log-primary-button)] px-3 py-2.5 text-xs font-semibold text-[var(--log-primary-button-text)] disabled:opacity-35">Add activity</button>
            </div>
          ) : (
            <button type="button" onClick={() => setAddingCustom(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--log-surface-muted)] px-3 py-3 text-xs font-semibold text-[var(--log-text)]"><AppIcon name="plus" size={16} /> Add custom activity</button>
          )}

          <DarkField label="Started at"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} className={inputClass} /></DarkField>
          <DarkField label="Minutes spent"><input type="number" min="1" max="1440" inputMode="numeric" value={duration} onChange={(event) => setDuration(Math.max(1, Math.min(1440, Number(event.target.value) || 1)))} className={inputClass} /></DarkField>
          <div className="grid grid-cols-5 gap-2">
            {[15, 30, 45, 60, 90].map((minutes) => <button key={minutes} type="button" onClick={() => setDuration(minutes)} className={`rounded-xl py-2.5 text-[11px] font-semibold ${duration === minutes ? "bg-[var(--log-accent)] text-white" : "bg-[var(--log-surface-muted)] text-[var(--log-text)]"}`}>{minutes}</button>)}
          </div>
          <DarkField label="Note (optional)"><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="How did it go?" className={`${inputClass} resize-none`} /></DarkField>
          <button type="button" onClick={save} disabled={!selected || duration < 1} className="h-[3.25rem] w-full rounded-xl bg-[var(--log-primary-button)] text-sm font-bold text-[var(--log-primary-button-text)] active:scale-[0.99] disabled:opacity-35">{initialEvent ? "Save changes" : `Add ${duration} min to timeline`}</button>
        </div>
      </section>
    </div>
  );
}

function ProtocolEventEditor({ item, initialTime, dateKey, onClose, onSave }: { item: TimelineItem; initialTime: string; dateKey: string; onClose: () => void; onSave: (time: string) => void }) {
  const [time, setTime] = useState(initialTime);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 px-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="mb-2 w-full max-w-xl animate-sheet-up rounded-[1.7rem] bg-[var(--log-surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[var(--log-text)] shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
        <div className="mb-5 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--log-faint)]">{friendlyDate(dateKey)}</p><h2 className="mt-1 text-xl font-semibold">Edit {item.title}</h2></div><button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--log-surface-muted)] text-[var(--log-muted)]" aria-label="Close"><AppIcon name="x" size={17} /></button></div>
        <DarkField label="Time"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="w-full rounded-xl bg-[var(--log-surface-muted)] px-3.5 py-3 text-sm text-[var(--log-text)] outline-none focus:ring-2 focus:ring-[var(--log-accent)]/20" /></DarkField>
        <button type="button" onClick={() => onSave(time)} className="mt-4 h-[3.25rem] w-full rounded-xl bg-[var(--log-primary-button)] text-sm font-bold text-[var(--log-primary-button-text)] active:scale-[0.99]">Save changes</button>
      </section>
    </div>
  );
}

function LogComposer({ kind, initialTime, initialLifeEvent, initialBowelEvent, initialBloatingEvent, dateKey, onClose, onSaveLife, onSaveBowel, onSaveBloating }: { kind: ComposerKind; initialTime: string; initialLifeEvent?: LifeLogEvent; initialBowelEvent?: BowelMovementEvent; initialBloatingEvent?: BloatingEvent; dateKey: string; onClose: () => void; onSaveLife: (event: LifeLogEvent) => void; onSaveBowel: (event: BowelMovementEvent) => void; onSaveBloating: (event: BloatingEvent) => void }) {
  const [time, setTime] = useState(initialTime);
  const [title, setTitle] = useState(initialLifeEvent?.title || (kind === "event" ? "" : kind === "sleep" ? "Sleep" : kind === "feeling" ? "Feeling" : "Thought"));
  const [note, setNote] = useState(initialLifeEvent?.note || initialBowelEvent?.note || initialBloatingEvent?.note || "");
  const [rating, setRating] = useState(initialLifeEvent?.rating || 3);
  const [bristol, setBristol] = useState<BristolStoolType>(initialBowelEvent?.bristol_type || 4);
  const [urgency, setUrgency] = useState<0 | 1 | 2>(initialBowelEvent?.urgency || 0);
  const [complete, setComplete] = useState(initialBowelEvent?.complete_evacuation ?? true);
  const [bloating, setBloating] = useState<BloatingSeverity>(initialBloatingEvent?.severity ?? 1);
  const [sleepEnd, setSleepEnd] = useState(initialLifeEvent?.ended_at ? timeInputValue(initialLifeEvent.ended_at) : "");
  const isEditing = Boolean(initialLifeEvent || initialBowelEvent || initialBloatingEvent);
  const inputClass = "w-full rounded-xl bg-[var(--log-surface-muted)] px-3.5 py-3 text-sm text-[var(--log-text)] outline-none placeholder:text-[var(--log-faint)] focus:ring-2 focus:ring-[var(--log-accent)]/20";

  const save = () => {
    const timestamp = localTimestamp(dateKey, time);
    let sleepEndTimestamp: string | undefined;
    if (kind === "sleep" && sleepEnd) { const end = new Date(`${dateKey}T${sleepEnd}:00`); if (sleepEnd <= time) end.setDate(end.getDate() + 1); sleepEndTimestamp = end.toISOString(); }
    if (kind === "bowel") { onSaveBowel({ id: initialBowelEvent?.id || createClientId("bm"), timestamp, bristol_type: bristol, urgency, complete_evacuation: complete, note: note || undefined }); return; }
    if (kind === "bloating") { onSaveBloating({ id: initialBloatingEvent?.id || createClientId("bloat"), timestamp, severity: bloating, note: note || undefined }); return; }
    const lifeKind = kind as LifeLogEventKind;
    onSaveLife({ id: initialLifeEvent?.id || createClientId("log"), kind: lifeKind, timestamp, title: title.trim() || (lifeKind === "event" ? "Event" : lifeKind[0].toUpperCase() + lifeKind.slice(1)), note: note.trim() || undefined, rating: lifeKind === "feeling" ? rating : undefined, started_at: lifeKind === "sleep" ? timestamp : undefined, ended_at: sleepEndTimestamp });
  };

  const labels: Record<ComposerKind, string> = { thought: "Log a thought", feeling: "How are you feeling?", event: "Log an event", sleep: "Log sleep", bowel: "Bowel movement", bloating: "Bloating" };
  const canSave = kind === "thought" ? note.trim().length > 0 : kind === "event" ? title.trim().length > 0 : true;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 px-3 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="mb-2 max-h-[92vh] w-full max-w-xl animate-sheet-up overflow-y-auto rounded-[1.7rem] bg-[var(--log-surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[var(--log-text)] shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
        <div className="mb-5 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--log-faint)]">{friendlyDate(dateKey)} · {time}</p><h2 className="mt-1 text-xl font-semibold">{isEditing ? `Edit ${kind === "bowel" ? "bowel movement" : kind}` : labels[kind]}</h2></div><button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--log-surface-muted)] text-[var(--log-muted)]" aria-label="Close"><AppIcon name="x" size={17} /></button></div>
        <div className="space-y-4">
          <DarkField label="Time"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} className={inputClass} /></DarkField>
          {(kind === "event" || kind === "sleep") && <DarkField label={kind === "sleep" ? "Label" : "What happened?"}><input autoFocus={kind === "event"} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === "event" ? "Dinner with friends, headache, workout…" : "Night sleep, nap…"} className={inputClass} /></DarkField>}
          {kind === "feeling" && <DarkChoiceRow label="Intensity" values={[1,2,3,4,5]} selected={rating} onSelect={(value) => setRating(value)} />}
          {kind === "bowel" && <><DarkChoiceRow label="Bristol type" values={[1,2,3,4,5,6,7]} selected={bristol} onSelect={(value) => setBristol(value as BristolStoolType)} /><DarkChoiceRow label="Urgency" values={[0,1,2]} labels={["None","Some","Strong"]} selected={urgency} onSelect={(value) => setUrgency(value as 0 | 1 | 2)} /><label className="flex items-center justify-between rounded-xl bg-[var(--log-surface-muted)] px-3.5 py-3 text-xs font-medium text-[var(--log-text)]"><span>Felt complete</span><input type="checkbox" checked={complete} onChange={(event) => setComplete(event.target.checked)} className="h-4 w-4 accent-[var(--log-accent)]" /></label></>}
          {kind === "bloating" && <DarkChoiceRow label="Severity" values={[0,1,2,3]} labels={["None","Mild","Noticeable","Strong"]} selected={bloating} onSelect={(value) => setBloating(value as BloatingSeverity)} />}
          {kind === "sleep" && <DarkField label="Woke up (optional)"><input type="time" value={sleepEnd} onChange={(event) => setSleepEnd(event.target.value)} className={inputClass} /></DarkField>}
          <DarkField label={kind === "thought" ? "What’s on your mind?" : "Note (optional)"}><textarea autoFocus={kind === "thought"} value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder={kind === "thought" ? "Write it down…" : "Add some context…"} className={`${inputClass} resize-none`} /></DarkField>
          <button type="button" onClick={save} disabled={!canSave} className="h-[3.25rem] w-full rounded-xl bg-[var(--log-primary-button)] text-sm font-bold text-[var(--log-primary-button-text)] active:scale-[0.99] disabled:opacity-35">{isEditing ? "Save changes" : "Add to timeline"}</button>
        </div>
      </section>
    </div>
  );
}

function DarkField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-[var(--log-muted)]">{label}</span>{children}</label>; }

function DarkChoiceRow({ label, values, labels, selected, onSelect }: { label: string; values: number[]; labels?: string[]; selected: number; onSelect: (value: number) => void }) {
  return <div><span className="mb-2 block text-[11px] font-semibold text-[var(--log-muted)]">{label}</span><div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>{values.map((value, index) => <button key={value} type="button" onClick={() => onSelect(value)} className={`h-10 rounded-xl text-[11px] font-semibold ${selected === value ? "bg-[var(--log-accent)] text-white" : "bg-[var(--log-surface-muted)] text-[var(--log-text)]"}`}>{labels?.[index] ?? value}</button>)}</div></div>;
}
