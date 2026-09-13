"use client";

import React, { ReactNode } from "react";
import { StudyProvider } from "@/context/study-context";
import { BottomNav } from "@/components/common/bottom-nav";
import { ServiceWorkerRegistration } from "@/components/common/service-worker-registration";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <StudyProvider>
      <ServiceWorkerRegistration />
      <div className="flex-1 flex flex-col min-h-screen pb-20">
        {children}
      </div>
      <BottomNav />
    </StudyProvider>
  );
}
