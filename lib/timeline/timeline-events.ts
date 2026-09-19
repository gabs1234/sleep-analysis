import { formatDateKey } from "../engine/protocol-engine";
import { NightRecord } from "../../types/study";

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
  | "routine"
  | "timed";

export interface TimelineItem {
  id: string;
  timestamp: string;
  kind: TimelineKind;
  title: string;
  detail?: string;
  recordDate: string;
  removable?: {
    collection: "life_log_events" | "bowel_movements" | "bloating_events" | "evening_actions" | "timed_events";
    id: string;
  };
}

const readinessLabels = ["Wrecked", "Sluggish", "Ready", "Sharp"];
const qualityLabels = ["Bad sleep", "Poor sleep", "Good sleep", "Excellent sleep"];
const stressLabels = ["Relaxed", "Mild stress", "Stressed", "Very stressed"];
const wakeReasonLabels: Record<string, string> = {
  natural: "natural awakening",
  spontaneous: "spontaneous awakening",
  alarm: "alarm",
  light: "light",
  noise: "noise",
  other: "other",
  unsure: "unsure",
};
const adherenceLabels = { yes: "yes", mostly: "mostly", no: "no" } as const;
const workStressLabels = ["Calm at work", "Mild work stress", "Work was stressful", "Work was overwhelming"];
const workSatisfactionLabels = ["Work felt bad", "Work felt frustrating", "Work felt fine", "Work felt satisfying"];
const socialLabels = ["No meaningful contact", "Brief meaningful contact", "Some meaningful contact", "Substantial meaningful contact"];
const routineLabels = ["Routine fell apart", "Routine partly followed", "Routine mostly followed", "Routine completed"];
const eatingLabels = ["Eating felt normal", "Eating somewhat off", "Eating felt out of control"];
const mentalArousalLabels = ["Mind quiet", "Mind active", "Mind racing", "Could not switch off"];
const sleepinessLabels = ["Not sleepy", "Slightly sleepy", "Sleepy", "Struggling to stay awake"];

function readableValue(value: string): string {
  return value.replaceAll("_", " ");
}

function morningSummaryDetail(record: NightRecord): string {
  const assessment = record.morning_assessment;
  if (!assessment) return "Morning check-in logged";

  const parts = [
    readinessLabels[assessment.readiness] || "Readiness logged",
    qualityLabels[assessment.sleep_quality] || "Sleep rated",
    `Woke by ${wakeReasonLabels[assessment.wake_reason] || readableValue(assessment.wake_reason)}`,
  ];
  if (assessment.protocol_adherence) {
    parts.push(`Protocol ${adherenceLabels[assessment.protocol_adherence]}`);
  }
  if (assessment.evening_plan_adherence) {
    parts.push(`Plan ${adherenceLabels[assessment.evening_plan_adherence]}`);
  }
  parts.push(
    assessment.unusual_night
      ? `Unusual: ${(assessment.unusual_reasons || []).map(readableValue).join(", ") || "yes"}`
      : "No unusual factors"
  );
  if (assessment.adherence_note) parts.push(assessment.adherence_note);
  if (assessment.evening_plan_adherence_note) parts.push(assessment.evening_plan_adherence_note);
  if (assessment.unusual_note) parts.push(assessment.unusual_note);
  return parts.join(" · ");
}

function eveningSummaryDetail(record: NightRecord): string {
  const context = record.daily_context;
  const preSleep = record.pre_sleep_state;
  const parts: string[] = [];

  if (context?.day_type) parts.push(readableValue(context.day_type));
  if (context?.did_work !== undefined) parts.push(context.did_work ? "Worked" : "Did not work");
  if (context?.overall_stress !== undefined) parts.push(stressLabels[context.overall_stress]);
  if (context?.work_stress !== undefined) parts.push(workStressLabels[context.work_stress]);
  if (context?.work_satisfaction !== undefined && context.work_satisfaction >= 0) {
    parts.push(workSatisfactionLabels[context.work_satisfaction]);
  }
  if (context?.meaningful_social_contact !== undefined) parts.push(socialLabels[context.meaningful_social_contact]);
  if (context?.routine_adherence !== undefined) parts.push(routineLabels[context.routine_adherence]);
  if (context?.eating_out_of_control !== undefined) parts.push(eatingLabels[context.eating_out_of_control]);
  if (preSleep?.mental_arousal !== undefined) parts.push(mentalArousalLabels[preSleep.mental_arousal]);
  if (preSleep?.sleepiness !== undefined) parts.push(sleepinessLabels[preSleep.sleepiness]);
  if (record.food_log_completeness) parts.push(`Food log ${record.food_log_completeness}`);
  if (record.evening_plan?.length) parts.push(`${record.evening_plan.length} planned times`);
  if (context?.notes) parts.push(context.notes);

  return parts.filter(Boolean).join(" · ") || "Evening check-in logged";
}

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

    for (const event of record.timed_events || []) {
      items.push({
        id: `timed-${event.id}`,
        timestamp: event.timestamp,
        kind: "timed",
        title: event.label,
        detail: `${event.duration_minutes} min${event.note ? ` · ${event.note}` : ""}`,
        recordDate: record.date,
        removable: { collection: "timed_events", id: event.id },
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
        removable: { collection: "evening_actions", id: action.action_id },
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
        detail: morningSummaryDetail(record),
        recordDate: record.date,
      });
    }

    const eveningTimestamp = newestTimestamp(
      record.pre_sleep_state?.completed_at,
      record.daily_context?.completed_at,
      record.evening_plan_completed_at,
      record.nutrition_fallback?.completed_at
    );
    if (eveningTimestamp && (record.daily_context || record.pre_sleep_state || record.food_log_completeness || record.evening_plan_completed_at)) {
      items.push({
        id: `evening-${record.date}`,
        timestamp: eveningTimestamp,
        kind: "evening",
        title: "Evening summary",
        detail: eveningSummaryDetail(record),
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
