"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/order";

  const [mode, setMode] = useState<"pin" | "password">("pin");
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload =
        mode === "pin"
          ? { pin }
          : { username: username.trim(), password };

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      // Successful login
      router.push(from);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in.");
    } finally {
      setLoading(false);
    }
  }

  function handlePinKey(digit: string) {
    if (pin.length < 6) {
      const nextPin = pin + digit;
      setPin(nextPin);
      if (nextPin.length === 4) {
        // Auto-submit 4-digit PIN for super fast cashier checkout login
        setTimeout(() => {
          submitPin(nextPin);
        }, 100);
      }
    }
  }

  function handlePinBackspace() {
    setPin((prev) => prev.slice(0, -1));
  }

  function handlePinClear() {
    setPin("");
  }

  async function submitPin(pinToSubmit: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinToSubmit }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Invalid PIN.");
      }

      router.push(from);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid PIN.");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-6 rounded-3xl border border-roast/15 bg-foam p-6 sm:p-8 shadow-xl">
      {/* Brand Header */}
      <div className="text-center space-y-1">
        <span className="text-[0.7rem] font-bold tracking-[0.25em] uppercase text-roast block">
          Point of Sale & Management
        </span>
        <h1 className="text-3xl font-black tracking-tight text-espresso lowercase">
          artisan
        </h1>
        <p className="text-xs text-roast font-medium">
          Please sign in to access the coffee shop system
        </p>
      </div>

      {/* Mode Switch Tabs */}
      <div
        role="tablist"
        className="flex rounded-full border border-roast/15 bg-cream p-1 shadow-2xs"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "pin"}
          onClick={() => {
            setMode("pin");
            setError(null);
          }}
          className={
            "flex-1 rounded-full py-2 text-xs font-bold transition-all min-h-[38px] " +
            (mode === "pin"
              ? "bg-espresso text-foam shadow-xs"
              : "text-roast hover:text-espresso hover:bg-latte/20")
          }
        >
          🔢 Quick Staff PIN
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "password"}
          onClick={() => {
            setMode("password");
            setError(null);
          }}
          className={
            "flex-1 rounded-full py-2 text-xs font-bold transition-all min-h-[38px] " +
            (mode === "password"
              ? "bg-espresso text-foam shadow-xs"
              : "text-roast hover:text-espresso hover:bg-latte/20")
          }
        >
          🔑 User & Password
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="rounded-2xl bg-red-50 p-3.5 text-xs font-bold text-red-700 border border-red-200 text-center animate-in fade-in">
          {error}
        </div>
      )}

      {/* ── PIN Entry Mode ──────────────────────────────────────────────── */}
      {mode === "pin" && (
        <div className="space-y-5">
          {/* PIN Dots Indicator */}
          <div className="flex justify-center items-center gap-3 py-2">
            {[0, 1, 2, 3].map((idx) => {
              const filled = pin.length > idx;
              return (
                <div
                  key={idx}
                  className={
                    "h-4 w-4 rounded-full border-2 transition-all " +
                    (filled
                      ? "border-espresso bg-espresso scale-110"
                      : "border-roast/30 bg-cream")
                  }
                />
              );
            })}
          </div>

          {/* Numeric Keypad for Touch & Click */}
          <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
              <button
                key={num}
                type="button"
                disabled={loading}
                onClick={() => handlePinKey(num)}
                className="flex h-14 items-center justify-center rounded-2xl border border-roast/15 bg-cream text-lg font-bold text-espresso shadow-2xs hover:bg-latte/30 active:scale-95 transition-all disabled:opacity-40"
              >
                {num}
              </button>
            ))}

            <button
              type="button"
              disabled={loading || !pin}
              onClick={handlePinClear}
              className="flex h-14 items-center justify-center rounded-2xl border border-roast/15 bg-cream/50 text-xs font-bold text-roast hover:bg-cream active:scale-95 transition-all disabled:opacity-30"
            >
              Clear
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => handlePinKey("0")}
              className="flex h-14 items-center justify-center rounded-2xl border border-roast/15 bg-cream text-lg font-bold text-espresso shadow-2xs hover:bg-latte/30 active:scale-95 transition-all disabled:opacity-40"
            >
              0
            </button>

            <button
              type="button"
              disabled={loading || !pin}
              onClick={handlePinBackspace}
              className="flex h-14 items-center justify-center rounded-2xl border border-roast/15 bg-cream/50 text-base font-bold text-roast hover:bg-cream active:scale-95 transition-all disabled:opacity-30"
            >
              ⌫
            </button>
          </div>
        </div>
      )}

      {/* ── Username & Password Mode ────────────────────────────────────── */}
      {mode === "password" && (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-roast mb-1.5">
              Username
            </label>
            <input
              type="text"
              required
              autoComplete="username"
              placeholder="e.g. admin or cashier"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-roast/20 bg-cream px-4 py-3 text-sm font-semibold text-espresso placeholder-roast/40 focus:border-espresso focus:outline-none min-h-[44px]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-roast mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-roast/20 bg-cream px-4 py-3 text-sm font-semibold text-espresso placeholder-roast/40 focus:border-espresso focus:outline-none min-h-[44px]"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !username.trim() || !password}
            className="flex min-h-[48px] w-full items-center justify-center rounded-full bg-espresso text-sm font-bold text-foam shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-8">
      <Suspense fallback={<p className="text-xs text-roast font-bold">Loading login…</p>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

