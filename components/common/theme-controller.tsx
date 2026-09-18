"use client";

import { useEffect } from "react";
import { useStudySession } from "@/context/study-context";

export function ThemeController() {
  const { preferences } = useStudySession();

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved = preferences.theme === "system"
        ? media.matches ? "dark" : "light"
        : preferences.theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute(
        "content",
        resolved === "dark" ? "#11110f" : "#f5f3ee"
      );
    };

    applyTheme();
    if (preferences.theme !== "system") return;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [preferences.theme]);

  return null;
}
