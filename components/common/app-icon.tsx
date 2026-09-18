import React from "react";

export type AppIconName =
  | "home"
  | "log"
  | "chart"
  | "settings"
  | "plus"
  | "moon"
  | "sun"
  | "spark"
  | "brain"
  | "heart"
  | "calendar"
  | "chevron-right"
  | "chevron-left"
  | "clock"
  | "coffee"
  | "bathroom"
  | "activity"
  | "book"
  | "trash"
  | "x";

export function AppIcon({
  name,
  size = 20,
  strokeWidth = 1.8,
  className,
}: {
  name: AppIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const paths: Record<AppIconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/></>,
    log: <><path d="M6 3h12a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    chart: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.09A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.09 14H3v-4h.09A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63h.02A1.7 1.7 0 0 0 10 3.09V3h4v.09a1.7 1.7 0 0 0 1.03 1.54 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9v.02A1.7 1.7 0 0 0 20.91 10H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    moon: <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></>,
    spark: <path d="m12 2 1.6 5.2L19 9l-5.4 1.8L12 16l-1.6-5.2L5 9l5.4-1.8L12 2ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/>,
    brain: <><path d="M9.5 4.5A3 3 0 0 0 4 6.2a3 3 0 0 0 .6 5.6A3.4 3.4 0 0 0 9 16v3a2 2 0 0 0 4 0V5a2.5 2.5 0 0 0-3.5-.5Z"/><path d="M14.5 4.5A3 3 0 0 1 20 6.2a3 3 0 0 1-.6 5.6A3.4 3.4 0 0 1 15 16h-2M7 9h2M17 9h-2"/></>,
    heart: <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    "chevron-right": <path d="m9 18 6-6-6-6"/>,
    "chevron-left": <path d="m15 18-6-6 6-6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    coffee: <><path d="M4 7h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V7Z"/><path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17M8 3v2M12 3v2"/></>,
    bathroom: <><circle cx="12" cy="5" r="2"/><path d="M8 9h8l-1 5h-1v7h-4v-7H9L8 9Z"/></>,
    activity: <path d="M3 12h4l2-6 4 12 2-6h6"/>,
    book: <><path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4Z"/><path d="M7 16h11"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
    x: <path d="M6 6l12 12M18 6 6 18"/>,
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}
