"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { classNames } from "@/lib/utils";

type AppShellProps = {
  children: React.ReactNode;
};

type HouseholdContext = {
  householdId: string;
  householdName: string;
  user: User;
};

type ProtectedPageProps = {
  context: HouseholdContext;
};

const navItems = [
  { href: "/dashboard", label: "Garden", icon: "🌸" },
  { href: "/transactions", label: "Spend", icon: "🧺" },
  { href: "/channels", label: "Wallets", icon: "👛" },
  { href: "/profile", label: "Me", icon: "☺️" },
];

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute -left-14 top-20 h-40 w-40 rounded-full bg-accent/45 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-80 h-44 w-44 rounded-full bg-secondary/25 blur-3xl" />
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
        <main className="relative z-10 flex-1 px-4 pb-32 pt-5">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-20 px-3 pb-3">
          <div className="mx-auto max-w-md rounded-[1.75rem] border border-border bg-card/95 px-3 py-3 shadow-[0_-12px_34px_rgba(217,111,145,0.16)] backdrop-blur">
            <div className="grid grid-cols-5 items-end gap-1">
            {navItems.slice(0, 2).map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={classNames(
                    "flex min-h-14 flex-col items-center justify-center rounded-2xl text-[11px] font-bold transition active:scale-95",
                    isActive
                      ? "bg-accent text-primary-dark shadow-inner"
                      : "text-muted hover:bg-background"
                  )}
                >
                  <span className="text-lg" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <Link
              href="/transactions/new"
              className="-mt-8 flex h-16 w-16 flex-col items-center justify-center justify-self-center rounded-full border-4 border-card bg-primary text-sm font-black text-foreground shadow-[0_12px_26px_rgba(217,111,145,0.32)] transition active:scale-95"
              aria-label="Add spending"
            >
              <span className="text-2xl leading-none" aria-hidden="true">
                +
              </span>
              <span className="text-[10px] leading-none">Add</span>
            </Link>
            {navItems.slice(2).map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={classNames(
                    "flex min-h-14 flex-col items-center justify-center rounded-2xl text-[11px] font-bold transition active:scale-95",
                    isActive
                      ? "bg-accent text-primary-dark shadow-inner"
                      : "text-muted hover:bg-background"
                  )}
                >
                  <span className="text-lg" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}

export function ProtectedPage({
  children,
}: {
  children: (props: ProtectedPageProps) => React.ReactNode;
}) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [context, setContext] = useState<HouseholdContext | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "no-household">("loading");

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (!data.session) {
        router.replace("/login");
        return;
      }

      setSession(data.session);
      await loadHousehold(data.session.user);
    }

    async function loadHousehold(user: User) {
      const { data, error } = await supabase
        .from("household_members")
        .select("household_id, households(id, name)")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (error || !data) {
        setStatus("no-household");
        return;
      }

      const household = Array.isArray(data.households)
        ? data.households[0]
        : data.households;

      if (!household) {
        setStatus("no-household");
        return;
      }

      setContext({
        householdId: data.household_id,
        householdName: household.name,
        user,
      });
      setStatus("ready");
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession) {
        router.replace("/login");
      } else {
        setSession(nextSession);
        loadHousehold(nextSession.user);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  if (status === "loading" || (!session && status !== "no-household")) {
    return (
      <AppShell>
        <EmptyState title="Opening the ledger..." body="Gathering your little garden." />
      </AppShell>
    );
  }

  if (status === "no-household") {
    return (
      <AppShell>
        <PageHeader eyebrow="Setup needed" title="Almost ready" />
        <Card>
          <p className="text-sm leading-6 text-muted">
            Your account is signed in, but it is not linked to a household yet.
            Add this user to `household_members` in Supabase, then refresh.
          </p>
        </Card>
      </AppShell>
    );
  }

  if (!context) {
    return null;
  }

  return <AppShell>{children({ context })}</AppShell>;
}

export function PageHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-4 petal-rise">
      <div>
        {eyebrow ? (
          <p className="mb-1 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-sm font-bold text-primary-dark">
            <span aria-hidden="true">✿</span>
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-3xl font-black tracking-normal text-foreground">{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={classNames(
        "rounded-2xl border border-border bg-card p-4 shadow-[0_10px_30px_rgba(217,111,145,0.10)] transition duration-200 active:scale-[0.99]",
        className
      )}
    >
      {children}
    </section>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="text-center">
      <div className="soft-bloom mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-2xl">
        🌸
      </div>
      <h2 className="text-lg font-black text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
    </Card>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-extrabold text-foreground">{label}</span>
      {children}
    </label>
  );
}

export const inputClassName =
  "w-full rounded-2xl border border-border bg-white px-4 py-3 text-base text-foreground outline-none transition placeholder:text-muted/70 focus:border-primary-dark focus:ring-4 focus:ring-accent";

export const buttonClassName =
  "inline-flex min-h-12 items-center justify-center rounded-2xl bg-primary px-5 py-3 text-center text-sm font-black text-foreground shadow-[0_8px_20px_rgba(217,111,145,0.18)] transition hover:bg-primary-dark hover:text-white disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButtonClassName =
  "inline-flex min-h-12 items-center justify-center rounded-2xl border border-border bg-card px-5 py-3 text-center text-sm font-black text-foreground transition hover:bg-accent";
