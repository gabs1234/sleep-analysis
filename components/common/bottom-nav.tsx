"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppIcon, AppIconName } from "@/components/common/app-icon";

export function BottomNav() {
  const pathname = usePathname();

  const links: Array<{ href: string; label: string; icon: AppIconName; matches?: string[] }> = [
    { href: "/", label: "Dashboard", icon: "home" },
    { href: "/log", label: "Log", icon: "log" },
    { href: "/strategy", label: "Strategy", icon: "spark", matches: ["/strategy", "/study"] },
    { href: "/settings", label: "More", icon: "settings" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--nav-border)] bg-[var(--nav-bg)] pb-safe backdrop-blur-xl">
      <div className="mx-auto flex h-[4.35rem] max-w-xl items-center justify-around px-2">
        {links.map((link, index) => {
          const isActive = link.matches ? link.matches.includes(pathname) : pathname === link.href;
          return (
            <React.Fragment key={link.href}>
            {index === 2 && (
              <Link
                href="/log#add"
                onClick={(event) => {
                  if (pathname !== "/log") return;
                  event.preventDefault();
                  window.dispatchEvent(new Event("open-log-composer"));
                }}
                className="-mt-5 flex flex-1 items-center justify-center"
                aria-label="Add log entry"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full border-[5px] border-[var(--nav-bg-solid)] bg-[var(--app-accent)] text-white shadow-[0_6px_18px_rgba(0,0,0,0.22)]">
                  <AppIcon name="plus" size={25} strokeWidth={2.4} />
                </span>
              </Link>
            )}
            <Link
              href={link.href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-colors ${isActive ? "text-[var(--app-accent)]" : "text-[var(--app-muted)] hover:text-[var(--app-text-secondary)]"}`}
            >
              <span className={`flex h-7 w-10 items-center justify-center rounded-xl transition-colors ${isActive ? "bg-[var(--nav-active-bg)]" : ""}`}><AppIcon name={link.icon} size={18} strokeWidth={isActive ? 2.2 : 1.8} /></span>
              <span className={`text-[10px] ${isActive ? "font-semibold" : "font-medium"}`}>{link.label}</span>
            </Link>
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
}
