"use client";

import React, { ReactNode } from "react";
import { StudyProvider } from "@/context/study-context";
import { BottomNav } from "@/components/common/bottom-nav";
import { ServiceWorkerRegistration } from "@/components/common/service-worker-registration";
import { ThemeController } from "@/components/common/theme-controller";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <StudyProvider>
      <ThemeController />
      <ServiceWorkerRegistration />
      <div className="flex min-h-screen flex-1 flex-col pb-20">
        {children}
      </div>
      <BottomNav />
    </StudyProvider>
  );
}
