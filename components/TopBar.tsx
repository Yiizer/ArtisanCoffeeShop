"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type AuthUser = {
  id: string;
  username: string;
  name: string;
  role: "STAFF" | "ADMIN";
};

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (isLoginPage) return;
    let cancelled = false;

    fetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled && data.user) {
          setUser(data.user);
        }
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, isLoginPage]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      router.push("/login");
      router.refresh();
    } catch {
      router.push("/login");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <header className="border-b border-roast/10 bg-foam">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-3 sm:px-5 py-3">
        {/* Brand wordmark — matches the logo's lowercase style + tagline */}
        <Link href="/" className="flex flex-col leading-none select-none">
          <span className="text-[1.7rem] font-black tracking-[-0.04em] text-espresso lowercase">
            artisan
          </span>
          <span className="mt-0.5 text-[0.6rem] font-medium tracking-[0.22em] uppercase text-roast">
            coffee&nbsp;•&nbsp;desserts
          </span>
        </Link>

        {/* Right side controls (Hidden on Login Page) */}
        {!isLoginPage && (
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Mode toggle */}
            <nav
              aria-label="Mode toggle"
              className="flex items-center gap-1 rounded-full border border-roast/10 bg-cream p-1"
            >
              <Link
                href="/order"
                aria-current={pathname === "/order" ? "page" : undefined}
                className={
                  "rounded-full px-3.5 sm:px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors " +
                  (pathname.startsWith("/order")
                    ? "bg-espresso text-foam shadow-sm"
                    : "text-roast hover:bg-latte/30")
                }
              >
                Order
              </Link>

              {/* Only show Admin tab if user is ADMIN */}
              {user?.role === "ADMIN" && (
                <Link
                  href="/admin"
                  aria-current={pathname.startsWith("/admin") ? "page" : undefined}
                  className={
                    "rounded-full px-3.5 sm:px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors " +
                    (pathname.startsWith("/admin")
                      ? "bg-espresso text-foam shadow-sm"
                      : "text-roast hover:bg-latte/30")
                  }
                >
                  Admin
                </Link>
              )}
            </nav>

            {/* User Profile Badge & Logout Button */}
            {user && (
              <div className="flex items-center gap-2">
                <div className="hidden md:flex flex-col text-right">
                  <span className="text-xs font-bold text-espresso leading-none">
                    {user.name}
                  </span>
                  <span className="text-[10px] font-semibold text-roast uppercase tracking-wider mt-0.5">
                    {user.role === "ADMIN" ? "Manager" : "Cashier"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  title="Sign out of current account"
                  className="rounded-full border border-roast/20 bg-cream/70 px-3 py-1.5 text-xs font-bold text-roast hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-all active:scale-95 min-h-[36px]"
                >
                  {loggingOut ? "…" : "Sign Out"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
