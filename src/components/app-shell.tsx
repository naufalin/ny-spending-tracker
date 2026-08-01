"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { classNames } from "@/lib/utils";

type AppShellProps = {
  children: React.ReactNode;
  user?: User | null;
};

type HouseholdContext = {
  householdId: string;
  householdName: string;
  user: User;
};

type ProtectedPageProps = {
  context: HouseholdContext;
};

type NavIconName = "garden" | "spend" | "move" | "jars" | "wallets" | "more";

type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
};

type ActionItem = NavItem & {
  description: string;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Garden", icon: "garden" },
  { href: "/transactions", label: "Spend", icon: "spend" },
  { href: "/transfers", label: "Move", icon: "move" },
  { href: "/categories", label: "Jars", icon: "jars" },
  { href: "/channels", label: "Wallets", icon: "wallets" },
];

const actionItems: ActionItem[] = [
  {
    href: "/transactions/new",
    label: "Add spending",
    description: "Record an expense or income",
    icon: "spend",
  },
  {
    href: "/transfers/new",
    label: "Move money",
    description: "Move funds between wallets",
    icon: "move",
  },
];

const moreItems: ActionItem[] = [
  {
    href: "/categories",
    label: "Jars",
    description: "Organize your spending categories",
    icon: "jars",
  },
  {
    href: "/channels",
    label: "Wallets",
    description: "Manage the places holding your money",
    icon: "wallets",
  },
];

function NavIcon({ name, className = "h-5 w-5" }: { name: NavIconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "garden" ? (
        <>
          <path d="M12 13.4c-1.5-3.1-5.4-3.8-7.3-1.2 1 2.5 3.3 3.4 6.5 2.3" />
          <path d="M12 13.4c1.5-3.1 5.4-3.8 7.3-1.2-1 2.5-3.3 3.4-6.5 2.3" />
          <path d="M12 13.4c-3-1.8-2.8-5.7 0-7 2.8 1.3 3 5.2 0 7Z" />
          <path d="M12 13.4v4.2" />
        </>
      ) : null}
      {name === "spend" ? (
        <>
          <path d="M5 10h14l-1.2 9H6.2L5 10Z" />
          <path d="M8 10a4 4 0 0 1 8 0" />
          <path d="M9 14h.01M12 14h.01M15 14h.01" />
        </>
      ) : null}
      {name === "move" ? (
        <>
          <path d="M4 8h15" />
          <path d="m15 5 4 3-4 3" />
          <path d="M20 16H5" />
          <path d="m9 13-4 3 4 3" />
        </>
      ) : null}
      {name === "jars" ? (
        <>
          <path d="M7 5h10" />
          <path d="M8 5v2.2c0 .5-.2 1-.6 1.4L7 9v9.5h10V9l-.4-.4c-.4-.4-.6-.9-.6-1.4V5" />
          <path d="M7 12h10" />
        </>
      ) : null}
      {name === "wallets" ? (
        <>
          <path d="M4.5 7.5h14a1.5 1.5 0 0 1 1.5 1.5v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11" />
          <path d="M3 8h15.5a1.5 1.5 0 0 1 1.5 1.5V13h-5a2 2 0 0 1 0-4h5" />
          <path d="M15.5 11h.01" />
        </>
      ) : null}
      {name === "more" ? <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="2.8" /> : null}
    </svg>
  );
}

function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span
      className={classNames("flex shrink-0 items-center justify-center rounded-full bg-accent text-primary-dark", className)}
      aria-hidden="true"
    >
      <NavIcon name="garden" className="h-5 w-5" />
    </span>
  );
}

function isActiveNavItem(pathname: string, item: NavItem) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function AppNavLink({
  item,
  pathname,
  desktop = false,
}: {
  item: NavItem;
  pathname: string;
  desktop?: boolean;
}) {
  const isActive = isActiveNavItem(pathname, item);

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={classNames(
        "group transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent active:scale-95",
        desktop
          ? "flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-black"
          : "flex min-h-12 flex-col items-center justify-center rounded-2xl text-[10px] font-bold sm:min-h-14 sm:text-[11px]",
        isActive
          ? "bg-accent text-primary-dark shadow-inner"
          : "text-muted hover:bg-accent/55 hover:text-foreground"
      )}
    >
      <span className={classNames(desktop ? "flex h-6 w-6 items-center justify-center" : "flex h-6 items-center justify-center")}>
        <NavIcon name={item.icon} className={desktop ? "h-5 w-5" : "h-[1.3rem] w-[1.3rem]"} />
      </span>
      <span>{item.label}</span>
    </Link>
  );
}

function ActionLink({
  action,
  onClick,
  compact = false,
}: {
  action: ActionItem;
  onClick?: () => void;
  compact?: boolean;
}) {
  return (
    <Link
      href={action.href}
      onClick={onClick}
      className={classNames(
        "group flex items-center gap-3 rounded-2xl text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent",
        compact
          ? "border border-border bg-card px-3 py-3 hover:border-primary hover:bg-accent/55"
          : "px-3 py-3 hover:bg-background"
      )}
      role={compact ? undefined : "menuitem"}
    >
      <span
        className={classNames(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
          action.icon === "move" ? "bg-secondary/30 text-foreground" : "bg-accent text-primary-dark"
        )}
      >
        <NavIcon name={action.icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-black text-foreground">{action.label}</span>
        <span className="block text-xs leading-5 text-muted">{action.description}</span>
      </span>
    </Link>
  );
}

function ProfileLink({ user }: { user: User }) {
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "U";

  return (
    <Link
      href="/profile"
      className="flex min-h-10 shrink-0 items-center gap-2 rounded-2xl border border-border bg-card/95 px-3 text-xs font-black text-muted shadow-sm transition hover:bg-accent hover:text-primary-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent"
      aria-label="Open profile"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-black text-foreground">
        {displayName.charAt(0).toUpperCase()}
      </span>
      <span>Profile</span>
    </Link>
  );
}

export function AppShell({ children, user }: AppShellProps) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<"actions" | "more" | null>(null);
  const quickActionsOpen = openMenu === "actions";
  const moreMenuOpen = openMenu === "more";
  const moreMenuActive = moreItems.some((item) => isActiveNavItem(pathname, item));

  useEffect(() => {
    if (!openMenu) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openMenu]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute -left-14 top-20 h-40 w-40 rounded-full bg-accent/45 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-80 h-44 w-44 rounded-full bg-secondary/25 blur-3xl" />
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col md:max-w-6xl md:flex-row">
        {user ? (
          <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:max-h-screen md:w-64 md:shrink-0 md:flex-col md:overflow-y-auto md:border-r md:border-border/70 md:bg-card/45 md:px-5 md:py-6">
            <Link href="/dashboard" className="flex items-center gap-3" aria-label="Go to dashboard">
              <BrandMark className="h-11 w-11 shadow-sm" />
              <span className="text-lg font-black text-foreground">Little Ledger</span>
            </Link>
            <p className="mt-2 px-1 text-xs leading-5 text-muted">A gentle home for everyday money.</p>
            <nav className="mt-10 space-y-2" aria-label="Primary navigation">
              {navItems.map((item) => (
                <AppNavLink key={item.href} item={item} pathname={pathname} desktop />
              ))}
            </nav>
            <div className="mt-auto space-y-2 pt-8">
              <p className="px-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted">Quick add</p>
              {actionItems.map((action) => (
                <ActionLink key={action.href} action={action} compact />
              ))}
            </div>
          </aside>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="safe-top sticky top-0 z-30 flex items-center justify-between gap-3 bg-background/80 px-4 pb-2 pt-3 backdrop-blur-md md:static md:border-b md:border-border/60 md:bg-background/90 md:px-8 md:py-5">
            <Link href="/dashboard" className="flex min-w-0 items-center gap-2 md:hidden" aria-label="Go to dashboard">
              <BrandMark />
              <span className="truncate text-sm font-black text-foreground">Little Ledger</span>
            </Link>
            <div className="hidden min-w-0 md:block">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-primary-dark">Little Ledger</p>
              <p className="mt-1 text-sm text-muted">A softer way to keep track.</p>
            </div>
            {user ? <ProfileLink user={user} /> : null}
          </header>
          <main className="relative z-10 flex-1 px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-3 md:mx-auto md:w-full md:max-w-5xl md:px-8 md:pb-12 md:pt-8">
            {children}
          </main>
        </div>
        {user ? (
          <>
            {openMenu ? (
              <button
                type="button"
                className="fixed inset-0 z-30 bg-foreground/5 backdrop-blur-[1px] md:hidden"
                aria-label="Close navigation menu"
                onClick={() => setOpenMenu(null)}
              />
            ) : null}
            <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 px-2 pt-1 md:hidden" aria-label="Primary navigation">
              <div className="relative mx-auto max-w-md rounded-[1.75rem] border border-border/90 bg-card/95 px-2 py-2 shadow-[0_-12px_34px_rgba(217,111,145,0.16)] backdrop-blur">
                {quickActionsOpen ? (
                  <div
                    className="absolute bottom-[calc(100%+0.75rem)] left-1/2 z-50 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-3xl border border-border bg-card p-3 shadow-[0_16px_40px_rgba(63,52,50,0.18)]"
                    role="menu"
                    aria-label="Quick actions"
                  >
                    <p className="px-3 pb-2 text-xs font-black uppercase tracking-[0.12em] text-muted">Quick actions</p>
                    {actionItems.map((action) => (
                      <ActionLink key={action.href} action={action} onClick={() => setOpenMenu(null)} />
                    ))}
                  </div>
                ) : null}
                {moreMenuOpen ? (
                  <div
                    className="absolute bottom-[calc(100%+0.75rem)] left-1/2 z-50 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-3xl border border-border bg-card p-3 shadow-[0_16px_40px_rgba(63,52,50,0.18)]"
                    role="menu"
                    aria-label="More destinations"
                  >
                    <p className="px-3 pb-2 text-xs font-black uppercase tracking-[0.12em] text-muted">More places</p>
                    {moreItems.map((item) => (
                      <ActionLink key={item.href} action={item} onClick={() => setOpenMenu(null)} />
                    ))}
                  </div>
                ) : null}
                <div className="app-nav-grid">
                  <AppNavLink item={navItems[0]} pathname={pathname} />
                  <AppNavLink item={navItems[1]} pathname={pathname} />
                  <button
                    type="button"
                    onClick={() => setOpenMenu((current) => (current === "actions" ? null : "actions"))}
                    className={classNames(
                      "-mt-7 flex h-14 w-14 flex-col items-center justify-center justify-self-center rounded-full border-4 border-card text-sm font-black text-foreground shadow-[0_12px_26px_rgba(217,111,145,0.32)] transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent active:scale-95 sm:-mt-8 sm:h-16 sm:w-16",
                      quickActionsOpen ? "bg-primary-dark text-white" : "bg-primary"
                    )}
                    aria-label="Open quick actions"
                    aria-expanded={quickActionsOpen}
                    aria-haspopup="menu"
                  >
                    <span
                      className={classNames("text-2xl leading-none transition-transform", quickActionsOpen ? "rotate-45" : "")}
                      aria-hidden="true"
                    >
                      +
                    </span>
                    <span className="text-[9px] leading-none">Add</span>
                  </button>
                  <AppNavLink item={navItems[2]} pathname={pathname} />
                  <button
                    type="button"
                    onClick={() => setOpenMenu((current) => (current === "more" ? null : "more"))}
                    className={classNames(
                      "group flex min-h-12 flex-col items-center justify-center rounded-2xl text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent active:scale-95 sm:min-h-14 sm:text-[11px]",
                      moreMenuOpen || moreMenuActive
                        ? "bg-accent text-primary-dark shadow-inner"
                        : "text-muted hover:bg-accent/55 hover:text-foreground"
                    )}
                    aria-label="Open more destinations"
                    aria-expanded={moreMenuOpen}
                    aria-haspopup="menu"
                  >
                    <span className="flex h-6 items-center justify-center">
                      <NavIcon name="more" className="h-[1.3rem] w-[1.3rem]" />
                    </span>
                    <span>More</span>
                  </button>
                </div>
              </div>
            </nav>
          </>
        ) : null}
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

  return <AppShell user={context.user}>{children({ context })}</AppShell>;
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
    <header className="mb-5 flex flex-col gap-3 petal-rise">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-sm font-bold text-primary-dark">
            <span aria-hidden="true">✿</span>
            {eyebrow}
          </p>
        ) : null}
        <h1 className="break-words text-[2rem] font-black leading-tight tracking-normal text-foreground sm:text-3xl">
          {title}
        </h1>
      </div>
      {action ? <div className="w-full min-w-0 sm:w-auto sm:shrink-0">{action}</div> : null}
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

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousActiveElement = document.activeElement as HTMLElement | null;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col rounded-t-3xl bg-card shadow-[0_-12px_40px_rgba(217,111,145,0.24)] sm:mb-4 sm:rounded-3xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="modal-title" className="text-lg font-black text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            ref={closeButtonRef}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-accent hover:text-primary-dark"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}
