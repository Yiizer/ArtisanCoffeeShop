"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MODES = [
  { href: "/order", label: "Order" },
  { href: "/admin", label: "Admin" },
] as const;

export default function TopBar() {
  const pathname = usePathname();

  return (
    <header className="border-b border-roast/10 bg-foam">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-3 sm:px-5 py-3">

        {/* Brand wordmark — matches the logo's lowercase style + tagline */}
        <div className="flex flex-col leading-none select-none">
          <span className="text-[1.7rem] font-black tracking-[-0.04em] text-espresso lowercase">
            artisan
          </span>
          <span className="mt-0.5 text-[0.6rem] font-medium tracking-[0.22em] uppercase text-roast">
            coffee&nbsp;•&nbsp;desserts
          </span>
        </div>

        {/* Mode toggle */}
        <nav
          aria-label="Mode toggle"
          className="flex items-center gap-1 rounded-full border border-roast/10 bg-cream p-1"
        >
          {MODES.map((mode) => {
            const isActive =
              pathname === mode.href || pathname.startsWith(`${mode.href}/`);
            return (
              <Link
                key={mode.href}
                href={mode.href}
                aria-current={isActive ? "page" : undefined}
                className={
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors " +
                  (isActive
                    ? "bg-espresso text-foam shadow-sm"
                    : "text-roast hover:bg-latte/30")
                }
              >
                {mode.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
