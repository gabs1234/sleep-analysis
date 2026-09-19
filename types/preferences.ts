export interface DailyRoutineConfig {
  id: string;
  label: string;
  enabled: boolean;
  session_count: number;
  minutes_per_session: number;
}

export interface CustomTimedEventTag {
  id: string;
  label: string;
  default_minutes: number;
}

export type ThemePreference = "light" | "dark" | "system";

export interface UserPreferences {
  theme: ThemePreference;
  work_days: number[]; // JavaScript weekdays: 0 Sunday through 6 Saturday
  evening_plan_enabled: boolean;
  routine: DailyRoutineConfig;
  timed_event_tags: CustomTimedEventTag[];
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: "system",
  work_days: [1, 2, 3, 4, 5],
  evening_plan_enabled: true,
  timed_event_tags: [],
  routine: {
    id: "daily_sessions",
    label: "Daily sessions",
    enabled: true,
    session_count: 4,
    minutes_per_session: 15,
  },
};
