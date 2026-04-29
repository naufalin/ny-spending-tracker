"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, buttonClassName, inputClassName } from "@/components/app-shell";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMagicLink() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window === "undefined" ? undefined : `${window.location.origin}/dashboard`,
      },
    });

    setLoading(false);
    setMessage(error ? error.message : "Check your email for a cozy little login link.");
  }

  async function signInWithPassword() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    router.replace("/dashboard");
  }

  async function signUpWithPassword() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signUp({ email, password });

    setLoading(false);
    setMessage(error ? error.message : "Account created. Check your email if Supabase asks you to confirm.");
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-3xl shadow-sm">
            🌸
          </div>
          <p className="text-sm font-black text-primary-dark">Little expenses, big memories</p>
          <h1 className="mt-2 text-4xl font-black text-foreground">Our Little Ledger</h1>
        </div>

        <Card>
          <div className="space-y-4">
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClassName}
                placeholder="you@example.com"
                required
              />
            </Field>

            <Field label="Password">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`${inputClassName} pr-24`}
                  placeholder="For email/password login"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-2 top-1/2 min-h-9 -translate-y-1/2 rounded-xl bg-accent px-3 text-xs font-black text-primary-dark"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </Field>

            <button
              type="button"
              onClick={sendMagicLink}
              disabled={loading || !email}
              className={`${buttonClassName} w-full`}
            >
              Send magic link
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={signInWithPassword}
                disabled={loading || !email || !password}
                className="min-h-12 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-black text-foreground transition hover:bg-accent disabled:opacity-60"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={signUpWithPassword}
                disabled={loading || !email || !password}
                className="min-h-12 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-black text-foreground transition hover:bg-accent disabled:opacity-60"
              >
                Sign up
              </button>
            </div>

            {message ? (
              <p className="rounded-2xl bg-background px-4 py-3 text-sm leading-6 text-muted">
                {message}
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    </main>
  );
}
