"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Start" },
  { href: "/history", label: "Verlauf" },
  { href: "/settings", label: "Speicher" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
      <ul className="mx-auto flex max-w-lg justify-around">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-2 text-xs font-medium ${
                  active
                    ? "text-brand dark:text-brand-dark"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
