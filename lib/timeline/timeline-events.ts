import { formatDateKey } from "@/lib/engine/protocol-engine";
import { NightRecord } from "@/types/study";

export type TimelineKind =
  | "thought"
  | "feeling"
  | "event"
  | "sleep"
  | "bowel"
  | "bloating"
  | "morning"
  | "evening"
  | "protocol"
  | "caffeine"
  | "routine";

export interface TimelineItem {
  id: string;
  timestamp: string;
  kind: TimelineKind;
  title: string;
  detail?: string;
  recordDate: string;
  removable?: {
    collection: "life_log_events" | "bowel_movements" | "bloating_events";
    id: string;
  };
}

const readinessLabels = ["Wrecked", "Sluggish", "Ready", "Sharp"];
const qualityLabels = ["Bad sleep", "Poor sleep", "Good sleep", "Excellent sleep"];
const stressLabels = ["Relaxed", "Mild stress", "Stressed", "Very stressed"];

function newestTimestamp(...values: Array<string | undefined>): string | undefined {
  return values.filter(Boolean).sort().at(-1);
}

export function buildTimeline(records: NightRecord[]): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const record of records) {
    for (const entry of record.life_log_events || []) {
      const details: string[] = [];
      if (entry.kind === "feeling" && entry.rating) details.push(`Intensity ${entry.rating}/5`);
      if (entry.kind === "sleep" && entry.started_at && entry.ended_at) {
        let duration = new Date(entry.ended_at).getTime() - new Date(entry.started_at).getTime();
        if (duration < 0) duration += 24 * 60 * 60 * 1000;
        const minutes = Math.round(duration / 60_000);
        details.push(`${Math.floor(minutes / 60)}h ${minutes % 60}m`);
      }
      if (entry.note) details.push(entry.note);
      items.push({
        id: `life-${entry.id}`,
        timestamp: entry.timestamp,
        kind: entry.kind,
        title: entry.title,
        detail: details.join(" · ") || undefined,
        recordDate: record.date,
        removable: { collection: "life_log_events", id: entry.id },
      });
    }

    for (const movement of record.bowel_movements || []) {
      items.push({
        id: `bowel-${movement.id}`,
        timestamp: movement.timestamp,
        kind: "bowel",
        title: "Bowel movement",
        detail: `Bristol ${movement.bristol_type} · ${movement.urgency === 0 ? "No urgency" : movement.urgency === 1 ? "Some urgency" : "Strong urgency"}${movement.note ? ` · ${movement.note}` : ""}`,
        recordDate: record.date,
        removable: { collection: "bowel_movements", id: movement.id },
      });
    }

    for (const symptom of record.bloating_events || []) {
      const severity = ["No bloating", "Mild bloating", "Noticeable bloating", "Strong bloating"][symptom.severity];
      items.push({
        id: `bloating-${symptom.id}`,
        timestamp: symptom.timestamp,
        kind: "bloating",
        title: severity,
        detail: symptom.note,
        recordDate: record.date,
        removable: { collection: "bloating_events", id: symptom.id },
      });
    }

    for (const action of record.evening_actions || []) {
      items.push({
        id: `action-${record.date}-${action.action_id}`,
        timestamp: action.timestamp,
        kind: "protocol",
        title: action.action_label,
        detail: "Protocol event",
        recordDate: record.date,
      });
    }

    for (const caffeine of record.caffeine_events || []) {
      items.push({
        id: `caffeine-${caffeine.id}`,
        timestamp: caffeine.timestamp,
        kind: "caffeine",
        title: "Caffeine",
        detail: caffeine.amount_mg ? `${caffeine.amount_mg} mg` : caffeine.source,
        recordDate: record.date,
      });
    }

    for (const nap of record.naps || []) {
      items.push({
        id: `nap-${nap.id}`,
        timestamp: nap.start_time,
        kind: "sleep",
        title: "Nap",
        detail: `${nap.duration_minutes} min`,
        recordDate: record.date,
      });
    }

    for (const routine of record.routine_sessions || []) {
      if (!routine.completed_at) continue;
      items.push({
        id: `routine-${routine.id}`,
        timestamp: routine.completed_at,
        kind: "routine",
        title: routine.activity_id,
        detail: `${routine.target_minutes} min completed`,
        recordDate: record.date,
      });
    }

    if (record.morning_assessment) {
      const assessment = record.morning_assessment;
      items.push({
        id: `morning-${record.date}`,
        timestamp: assessment.completed_at,
        kind: "morning",
        title: "Morning summary",
        detail: `${readinessLabels[assessment.readiness] || "Readiness logged"} · ${qualityLabels[assessment.sleep_quality] || "Sleep rated"}`,
        recordDate: record.date,
      });
    }

    const eveningTimestamp = newestTimestamp(
      record.pre_sleep_state?.completed_at,
      record.daily_context?.completed_at,
      record.evening_plan_completed_at
    );
    if (eveningTimestamp && (record.daily_context || record.pre_sleep_state)) {
      const parts: string[] = [];
      if (record.daily_context?.overall_stress !== undefined) {
        parts.push(stressLabels[record.daily_context.overall_stress]);
      }
      if (record.pre_sleep_state?.sleepiness !== undefined) {
        parts.push(["Not sleepy", "A little sleepy", "Sleepy", "Very sleepy"][record.pre_sleep_state.sleepiness]);
      }
      items.push({
        id: `evening-${record.date}`,
        timestamp: eveningTimestamp,
        kind: "evening",
        title: "Evening summary",
        detail: parts.join(" · ") || "Day and pre-sleep state logged",
        recordDate: record.date,
      });
    }

    const sleep = record.wearable_data;
    if (sleep?.sleep_onset) {
      const duration = sleep.duration_minutes;
      items.push({
        id: `sleep-${record.date}`,
        timestamp: sleep.sleep_onset,
        kind: "sleep",
        title: "Sleep",
        detail: duration ? `${Math.floor(duration / 60)}h ${duration % 60}m · ${sleep.provider.replace("_", " ")}` : `Recorded by ${sleep.provider.replace("_", " ")}`,
        recordDate: record.date,
      });
    }
  }

  return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function timelineItemsForDate(items: TimelineItem[], dateKey: string): TimelineItem[] {
  return items.filter((item) => formatDateKey(new Date(item.timestamp)) === dateKey);
}
