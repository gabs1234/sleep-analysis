"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function BottomNav() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Today", icon: "●" },
    { href: "/study", label: "Study", icon: "◫" },
    { href: "/settings", label: "Settings", icon: "⚙" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-t border-zinc-900 pb-safe">
      <div className="max-w-md mx-auto flex items-center justify-around h-16 px-4">
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center justify-center w-20 py-1 space-y-1 transition-colors ${
                isActive ? "text-zinc-100 font-semibold" : "text-zinc-400 hover:text-zinc-300"
              }`}
            >
              <span className="text-sm leading-none">{link.icon}</span>
              <span className="text-xs font-mono tracking-wider">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
