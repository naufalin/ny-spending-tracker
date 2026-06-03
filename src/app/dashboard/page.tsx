"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Card,
  EmptyState,
  PageHeader,
  ProtectedPage,
  buttonClassName,
} from "@/components/app-shell";
import { classNames, formatDate, formatIdr, monthStart, nextMonthStart, todayDate } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Budget, Category, Channel, Transaction, Transfer } from "@/types/database";
import type { Subcategory } from "@/types/database";

type CategoryTotal = {
  id?: string;
  name: string;
  amount: number;
};

type SubcategoryTotal = {
  id: string;
  name: string;
  amount: number;
};

type CategoryChartSlice = CategoryTotal & {
  color: string;
  percent: number;
};

type BalanceTransaction = Pick<Transaction, "channel_id" | "type" | "amount">;

type BalanceTransfer = Pick<Transfer, "from_channel_id" | "to_channel_id" | "amount">;

const categoryChartColors = ["#D96F91", "#A8C7A1", "#F0B45F", "#A8B6E8", "#C99AD8", "#8DC7BC"];

function formatCategoryPercent(percent: number) {
  if (percent > 0 && percent < 1) {
    return "<1%";
  }

  return `${Math.round(percent)}%`;
}

function getGreetingName(user: User) {
  const metadata = user.user_metadata || {};
  const name =
    metadata.full_name ||
    metadata.name ||
    metadata.display_name ||
    user.email?.split("@")[0];

  return typeof name === "string" && name.trim() ? name.trim() : "home";
}

function CategoryDonutChart({
  slices,
  total,
  totalLabel,
}: {
  slices: CategoryChartSlice[];
  total: number;
  totalLabel: string;
}) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[16rem]">
      <svg
        viewBox="0 0 120 120"
        role="img"
        aria-label={`Monthly spending by jar. Total ${totalLabel}.`}
        className="h-full w-full drop-shadow-[0_14px_24px_rgba(217,111,145,0.16)]"
      >
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#FFF9F2"
          strokeWidth="18"
        />
        {slices.map((slice, index) => {
          const sliceLength = total > 0 ? (slice.amount / total) * circumference : 0;
          const sliceOffset = slices
            .slice(0, index)
            .reduce((sum, previousSlice) => sum + (previousSlice.amount / total) * circumference, 0);
          const sliceGap = sliceLength > 2.5 && slices.length > 1 ? 1.5 : 0;
          const dashArray =
            slices.length === 1
              ? `${circumference} 0`
              : `${Math.max(0, sliceLength - sliceGap)} ${circumference}`;

          return (
            <circle
              key={slice.name}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth="18"
              strokeDasharray={dashArray}
              strokeDashoffset={-sliceOffset}
              strokeLinecap={slices.length === 1 ? "round" : "butt"}
              transform="rotate(-90 60 60)"
            />
          );
        })}
        <circle cx="60" cy="60" r="25" fill="#FFFFFF" opacity="0.92" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-10 text-center">
        <p className="text-[11px] font-black uppercase tracking-normal text-muted">Total</p>
        <p className="mt-1 max-w-full text-xl font-black leading-tight text-foreground">
          {totalLabel}
        </p>
      </div>
    </div>
  );
}

function DashboardContent({ householdId, user }: { householdId: string; user: User }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balanceTransactions, setBalanceTransactions] = useState<BalanceTransaction[]>([]);
  const [balanceTransfers, setBalanceTransfers] = useState<BalanceTransfer[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState("");
  const [numbersHidden, setNumbersHidden] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return window.localStorage.getItem("our-little-ledger-dashboard-numbers-hidden") !== "false";
  });
  const [selectedMonth, setSelectedMonth] = useState(() => monthStart().slice(0, 7));
  const [jarTransactions, setJarTransactions] = useState<Transaction[]>([]);
  const [jarLoading, setJarLoading] = useState(false);
  const [jarExpanded, setJarExpanded] = useState(false);
  const [selectedJarId, setSelectedJarId] = useState<string | null>(null);
  const [setupDismissed, setSetupDismissed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem("our-little-ledger-setup-dismissed") === "true";
  });
  const greetingName = getGreetingName(user);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      const [
        transactionResult,
        balanceTransactionResult,
        transferResult,
        budgetResult,
        categoryResult,
        channelResult,
        subcategoryResult,
      ] = await Promise.all([
        supabase
          .from("transactions")
          .select("*, categories(id, name, type), subcategories(id, name), channels(id, name)")
          .eq("household_id", householdId)
          .gte("spent_at", monthStart())
          .lt("spent_at", nextMonthStart())
          .order("spent_at", { ascending: false }),
        supabase
          .from("transactions")
          .select("channel_id, type, amount")
          .eq("household_id", householdId),
        supabase
          .from("transfers")
          .select("from_channel_id, to_channel_id, amount")
          .eq("household_id", householdId),
        supabase
          .from("budgets")
          .select("*, categories(id, name, type)")
          .eq("household_id", householdId)
          .eq("month", monthStart()),
        supabase.from("categories").select("*").eq("household_id", householdId),
        supabase.from("channels").select("*").eq("household_id", householdId).order("name"),
        supabase.from("subcategories").select("*").eq("household_id", householdId),
      ]);

      if (isMounted) {
        setTransactions((transactionResult.data || []) as Transaction[]);
        setBalanceTransactions((balanceTransactionResult.data || []) as BalanceTransaction[]);
        setBalanceTransfers((transferResult.data || []) as BalanceTransfer[]);
        setBudgets((budgetResult.data || []) as Budget[]);
        setCategories((categoryResult.data || []) as Category[]);
        setChannels((channelResult.data || []) as Channel[]);
        setSubcategories((subcategoryResult.data || []) as Subcategory[]);
        setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [householdId, supabase]);

  async function refreshDashboard() {
    const [categoryResult, channelResult] = await Promise.all([
      supabase.from("categories").select("*").eq("household_id", householdId),
      supabase.from("channels").select("*").eq("household_id", householdId).order("name"),
    ]);

    setCategories((categoryResult.data || []) as Category[]);
    setChannels((channelResult.data || []) as Channel[]);
  }

  useEffect(() => {
    let isMounted = true;
    setJarLoading(true);
    setJarExpanded(false);
    setSelectedJarId(null);

    const monthDate = new Date(`${selectedMonth}-01T00:00:00`);
    const start = `${selectedMonth}-01`;
    const end = nextMonthStart(monthDate);

    supabase
      .from("transactions")
      .select("*, categories(id, name, type), subcategories(id, name)")
      .eq("household_id", householdId)
      .eq("type", "expense")
      .gte("spent_at", start)
      .lt("spent_at", end)
      .order("spent_at", { ascending: false })
      .then(({ data }) => {
        if (isMounted) {
          setJarTransactions((data || []) as Transaction[]);
          setJarLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [householdId, selectedMonth, supabase]);

  function formatDashboardMoney(amount: number) {
    return numbersHidden ? "Rp ***" : formatIdr(amount);
  }

  function toggleNumbersHidden() {
    setNumbersHidden((current) => {
      const nextValue = !current;
      window.localStorage.setItem(
        "our-little-ledger-dashboard-numbers-hidden",
        String(nextValue)
      );
      return nextValue;
    });
  }

  const expenses = transactions.filter((transaction) => transaction.type === "expense");
  const monthTotal = expenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const todayTotal = expenses
    .filter((transaction) => transaction.spent_at === todayDate())
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const categoryTotals = jarTransactions.reduce<Record<string, CategoryTotal>>((acc, transaction) => {
    const name = transaction.categories?.name || "Uncategorized";
    acc[name] = acc[name] || { id: transaction.category_id || undefined, name, amount: 0 };
    acc[name].amount += transaction.amount;
    return acc;
  }, {});

  const jarTotal = jarTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);

  const channelTotals = expenses.reduce<Record<string, CategoryTotal>>((acc, transaction) => {
    const name = transaction.channels?.name || "No channel";
    acc[name] = acc[name] || { name, amount: 0 };
    acc[name].amount += transaction.amount;
    return acc;
  }, {});

  const sortedCategories = Object.values(categoryTotals).sort((a, b) => b.amount - a.amount);

  const categoryChartSlices: CategoryChartSlice[] = sortedCategories.map((category, index) => ({
    ...category,
    color: categoryChartColors[index % categoryChartColors.length],
    percent: jarTotal > 0 ? (category.amount / jarTotal) * 100 : 0,
  }));

  const topChannels = Object.values(channelTotals)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4);

  const walletBalances = channels.map((channel) => {
    const transactionTotal = balanceTransactions
      .filter((transaction) => transaction.channel_id === channel.id)
      .reduce((sum, transaction) => {
        return sum + (transaction.type === "income" ? transaction.amount : -transaction.amount);
      }, 0);
    const transferTotal = balanceTransfers.reduce((sum, transfer) => {
      if (transfer.from_channel_id === channel.id) {
        return sum - transfer.amount;
      }

      if (transfer.to_channel_id === channel.id) {
        return sum + transfer.amount;
      }

      return sum;
    }, 0);

    return {
      id: channel.id,
      name: channel.name,
      amount: transactionTotal + transferTotal,
    };
  });
  const totalBalance = walletBalances.reduce((sum, wallet) => sum + wallet.amount, 0);

  const totalBudget = budgets.reduce((sum, budget) => sum + budget.amount, 0);
  const remainingBudget = totalBudget - monthTotal;
  const setupItems = [
    {
      label: "Create spending jars",
      done: categories.length > 0,
      href: "/categories",
    },
    {
      label: "Create wallets",
      done: channels.length > 0,
      href: "/channels",
    },
    {
      label: "Add first spending",
      done: transactions.length > 0,
      href: "/transactions/new",
    },
    {
      label: "Set garden plan",
      done: budgets.length > 0,
      href: "/budgets",
    },
  ];
  const setupComplete = setupItems.every((item) => item.done);
  const showSetupChecklist = !loading && !setupComplete && !setupDismissed;
  const budgetProgress = budgets.map((budget) => {
    const spent = expenses
      .filter((transaction) => transaction.category_id === budget.category_id)
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    return {
      id: budget.id,
      name: budget.categories?.name || "Category",
      spent,
      amount: budget.amount,
      remaining: budget.amount - spent,
    };
  });

  async function seedStarterData() {
    setSeeding(true);
    setSeedMessage("");

    const starterCategories = [
      { name: "Coffee", type: "expense" },
      { name: "Groceries", type: "expense" },
      { name: "Transport", type: "expense" },
      { name: "Bills", type: "expense" },
      { name: "Date Night", type: "expense" },
      { name: "Income", type: "income" },
    ] as const;
    const starterChannels = ["Tunai", "Rekening BCA", "Rekening Jago"];
    const existingCategoryNames = new Set(categories.map((category) => category.name.toLowerCase()));
    const existingChannelNames = new Set(channels.map((channel) => channel.name.toLowerCase()));
    const categoriesToInsert = starterCategories
      .filter((category) => !existingCategoryNames.has(category.name.toLowerCase()))
      .map((category) => ({
        household_id: householdId,
        name: category.name,
        type: category.type,
      }));
    const channelsToInsert = starterChannels
      .filter((name) => !existingChannelNames.has(name.toLowerCase()))
      .map((name) => ({
        household_id: householdId,
        name,
      }));

    const [categoryResult, channelResult] = await Promise.all([
      categoriesToInsert.length
        ? supabase.from("categories").insert(categoriesToInsert)
        : Promise.resolve({ error: null }),
      channelsToInsert.length
        ? supabase.from("channels").insert(channelsToInsert)
        : Promise.resolve({ error: null }),
    ]);

    setSeeding(false);

    if (categoryResult.error || channelResult.error) {
      setSeedMessage(categoryResult.error?.message || channelResult.error?.message || "Could not plant starters.");
      return;
    }

    setSeedMessage("Starter jars and wallets are planted.");
    await refreshDashboard();
  }

  function dismissSetupChecklist() {
    window.localStorage.setItem("our-little-ledger-setup-dismissed", "true");
    setSetupDismissed(true);
  }

  return (
    <>
      <PageHeader
        eyebrow="Monthly garden"
        title={`Hello, ${greetingName}`}
        action={
          <Link href="/transactions/new" className={buttonClassName}>
            Add
          </Link>
        }
      />

      <div className="space-y-4">
        {showSetupChecklist ? (
          <Card className="bg-[linear-gradient(145deg,#FFFFFF,#FFF9F2)]">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent">
                🌱
              </span>
              <div>
                <h2 className="text-lg font-black text-foreground">Plant your first garden</h2>
                <p className="text-sm text-muted">A tiny checklist to get the ledger cozy.</p>
              </div>
            </div>
            <div className="space-y-2">
              {setupItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center justify-between rounded-2xl bg-background px-4 py-3 text-sm font-black text-foreground"
                >
                  <span>{item.label}</span>
                  <span className={item.done ? "text-secondary" : "text-muted"}>
                    {item.done ? "Done" : "Start"}
                  </span>
                </Link>
              ))}
            </div>
            <button
              type="button"
              onClick={seedStarterData}
              disabled={seeding}
              className={`${buttonClassName} mt-4 w-full`}
            >
              {seeding ? "Planting..." : "Plant starter jars & wallets"}
            </button>
            {seedMessage ? (
              <p className="mt-3 rounded-2xl bg-accent px-4 py-3 text-sm font-black text-primary-dark">
                {seedMessage}
              </p>
            ) : null}
            <button
              type="button"
              onClick={dismissSetupChecklist}
              className="mt-3 w-full rounded-2xl border border-border px-4 py-3 text-sm font-black text-muted"
            >
              Hide this checklist
            </button>
          </Card>
        ) : null}

        <Card className="relative overflow-hidden bg-[radial-gradient(circle_at_85%_15%,#F6D6DE,transparent_34%),linear-gradient(145deg,#FFFFFF,#FFF9F2)] p-5">
          <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent/80" />
          <div className="pointer-events-none absolute right-6 top-8 rotate-12 text-5xl opacity-80 soft-bloom">
            🌸
          </div>
          <div className="relative">
            <p className="text-sm font-black text-primary-dark">This month's garden</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={toggleNumbersHidden}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-accent hover:text-primary-dark"
                aria-label={numbersHidden ? "Show numbers" : "Hide numbers"}
              >
                {numbersHidden ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                    <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.03 10.03 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.03 10.03 0 0 0 9.63 3.465a1.65 1.65 0 0 0-1.185 0c-1.13.26-2.21.7-3.2 1.28L3.28 2.22ZM6.97 6.97a5 5 0 0 1 6.06 6.06l-6.06-6.06Zm2.12 3.54a5 5 0 0 0-2.12-2.12l-1.8 1.8a7.502 7.502 0 0 1 3.92-3.92l-1.8 1.8a5 5 0 0 0 2.12 2.12l1.8-1.8a7.502 7.502 0 0 1-3.92 3.92l1.8-1.8Z" clipRule="evenodd" />
                    <path d="M10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                    <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                    <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              <p className="text-4xl font-black leading-tight text-foreground">
                {loading ? "..." : formatDashboardMoney(monthTotal)}
              </p>
            </div>
            <p className="mt-3 max-w-[15rem] text-sm leading-6 text-muted">
              Little expenses, big memories.
            </p>
          </div>
        </Card>

        <Card className="bg-[linear-gradient(160deg,#FFFFFF,#F6D6DE)]">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-card text-xl">
            ☀️
          </div>
          <p className="text-sm font-black text-muted">Today's petals</p>
          <p className="mt-2 text-2xl font-black text-foreground">
            {loading ? "..." : formatDashboardMoney(todayTotal)}
          </p>
        </Card>

        <Card className="bg-[linear-gradient(160deg,#FFFFFF,#EEF6EA)]">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent">
              👛
            </span>
            <div>
              <h2 className="text-lg font-black text-foreground">Total balance</h2>
              <p className="text-sm text-muted">Across all wallets</p>
            </div>
          </div>
          <p className="text-3xl font-black text-foreground">
            {loading ? "..." : formatDashboardMoney(totalBalance)}
          </p>
          {walletBalances.length ? (
            <div className="mt-4 space-y-3">
              {walletBalances.map((wallet) => (
                <div key={wallet.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-foreground">{wallet.name}</span>
                  <span
                    className={
                      wallet.amount < 0
                        ? "text-sm font-black text-primary-dark"
                        : "text-sm font-black text-secondary"
                    }
                  >
                    {formatDashboardMoney(wallet.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">Create a wallet to see balances here.</p>
          )}
        </Card>

        <Card className="overflow-hidden bg-[linear-gradient(180deg,#FFFFFF,#FFF9F2)]">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent">
                🫙
              </span>
              <div>
                <h2 className="text-lg font-black text-foreground">Spending by jar</h2>
              </div>
            </div>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="rounded-xl border border-border bg-white/60 px-2 py-1 text-xs font-bold text-muted outline-none focus:border-primary-dark focus:ring-2 focus:ring-accent"
            />
          </div>
          {categoryChartSlices.length && jarTotal > 0 ? (
            <div className="mt-5">
              <CategoryDonutChart
                slices={categoryChartSlices}
                total={jarTotal}
                totalLabel={formatDashboardMoney(jarTotal)}
              />
              <div className="mt-5 space-y-1">
                {(jarExpanded ? categoryChartSlices : categoryChartSlices.slice(0, 5)).map((category) => {
                  const isSelected = selectedJarId === category.id;
                  const jarTxns = isSelected
                    ? jarTransactions.filter((t) => t.category_id === category.id)
                    : [];

                  return (
                    <div key={category.name}>
                      <button
                        type="button"
                        onClick={() => setSelectedJarId(isSelected ? null : (category.id || null))}
                        className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-background"
                      >
                        <span
                          className="h-3 w-3 shrink-0 rounded-full shadow-[0_0_0_4px_rgba(255,249,242,0.9)]"
                          style={{ backgroundColor: category.color }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm font-black text-foreground">
                              {category.name}
                            </span>
                            <span className="shrink-0 text-sm font-black text-primary-dark">
                              {formatDashboardMoney(category.amount)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${category.percent}%`,
                                  minWidth: category.percent > 0 ? "2px" : undefined,
                                  backgroundColor: category.color,
                                }}
                              />
                            </div>
                            <span className="w-10 text-right text-xs font-black text-muted">
                              {formatCategoryPercent(category.percent)}
                            </span>
                          </div>
                        </div>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className={classNames(
                            "h-4 w-4 shrink-0 text-muted transition-transform",
                            isSelected ? "rotate-180" : ""
                          )}
                        >
                          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {isSelected ? (
                        <div className="ml-5 space-y-2 border-l-2 border-border pl-3 pb-2">
                          {(() => {
                            const jarSubs = subcategories.filter((s) => s.category_id === category.id);
                            const txnsNoSub = jarTxns.filter((t) => !t.subcategory_id);
                            const subTotals = jarSubs
                              .map((sub) => {
                                const total = jarTxns
                                  .filter((t) => t.subcategory_id === sub.id)
                                  .reduce((sum, t) => sum + t.amount, 0);
                                return { ...sub, amount: total };
                              })
                              .filter((s) => s.amount > 0)
                              .sort((a, b) => b.amount - a.amount);

                            if (jarTxns.length === 0) {
                              return <p className="py-2 text-xs text-muted">No transactions.</p>;
                            }

                            return (
                              <>
                                {subTotals.map((sub) => {
                                  const subTxns = jarTxns.filter((t) => t.subcategory_id === sub.id);
                                  const percent = jarTotal > 0 ? (sub.amount / category.amount) * 100 : 0;
                                  return (
                                    <div key={sub.id}>
                                      <div className="flex items-center justify-between gap-2 py-1">
                                        <span className="text-xs font-black text-foreground">{sub.name}</span>
                                        <span className="text-xs font-black text-primary-dark">
                                          {formatDashboardMoney(sub.amount)}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background">
                                          <div
                                            className="h-full rounded-full"
                                            style={{
                                              width: `${Math.min(100, percent)}%`,
                                              minWidth: percent > 0 ? "2px" : undefined,
                                              backgroundColor: category.color,
                                              opacity: 0.7,
                                            }}
                                          />
                                        </div>
                                        <span className="w-8 text-right text-[10px] font-bold text-muted">
                                          {formatCategoryPercent(percent)}
                                        </span>
                                      </div>
                                      {subTxns.map((txn) => (
                                        <div key={txn.id} className="flex items-center justify-between gap-2 py-1 pl-2">
                                          <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs text-foreground">
                                              {txn.note || txn.channels?.name || "—"}
                                            </p>
                                            <p className="text-[10px] text-muted">{formatDate(txn.spent_at)}</p>
                                          </div>
                                          <span className="shrink-0 text-xs font-black text-primary-dark">
                                            -{formatIdr(txn.amount)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })}
                                {txnsNoSub.length > 0 ? (
                                  <div>
                                    {subTotals.length > 0 ? (
                                      <p className="mb-1 text-[10px] font-bold text-muted">Other</p>
                                    ) : null}
                                    {txnsNoSub.map((txn) => (
                                      <div key={txn.id} className="flex items-center justify-between gap-2 py-1.5">
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate text-sm text-foreground">
                                            {txn.note || txn.channels?.name || "—"}
                                          </p>
                                          <p className="text-xs text-muted">{formatDate(txn.spent_at)}</p>
                                        </div>
                                        <span className="shrink-0 text-sm font-black text-primary-dark">
                                          -{formatIdr(txn.amount)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </>
                            );
                          })()}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {categoryChartSlices.length > 5 ? (
                  <button
                    type="button"
                    onClick={() => setJarExpanded((current) => !current)}
                    className="mt-2 w-full rounded-2xl border border-border px-4 py-2 text-sm font-black text-muted transition hover:bg-accent hover:text-primary-dark"
                  >
                    {jarExpanded ? "Show less" : `Show all ${categoryChartSlices.length} jars`}
                  </button>
                ) : null}
              </div>
            </div>
          ) : jarLoading ? (
            <p className="mt-3 text-sm text-muted">Loading jar data...</p>
          ) : (
            <p className="mt-3 text-sm text-muted">No spending for this month yet. 🌸</p>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent">
              👛
            </span>
            <h2 className="text-lg font-black text-foreground">Money paths</h2>
          </div>
          {topChannels.length ? (
            <div className="mt-4 space-y-3">
              {topChannels.map((channel) => (
                <div key={channel.name} className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-foreground">{channel.name}</span>
                  <span className="text-sm font-black text-primary-dark">
                    {formatDashboardMoney(channel.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No channel spending yet.</p>
          )}
        </Card>

        <Card className="bg-[linear-gradient(180deg,#FFFFFF,#FFF9F2)]">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent">
              🌿
            </span>
            <h2 className="text-lg font-black text-foreground">Garden progress</h2>
          </div>
          {totalBudget > 0 ? (
            <>
              <p className="mt-2 text-sm text-muted">Remaining budget this month</p>
              <p className="mt-2 text-3xl font-black text-foreground">
                {formatDashboardMoney(remainingBudget)}
              </p>
              <div className="mt-4 space-y-4">
                {budgetProgress.map((budget) => {
                  const percent = Math.min(100, Math.round((budget.spent / budget.amount) * 100));

                  return (
                    <div key={budget.id}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-black text-foreground">{budget.name}</p>
                        <p className="text-sm font-bold text-muted">
                          {formatDashboardMoney(budget.remaining)} left
                        </p>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-background">
                        <div
                          className="h-full rounded-full bg-secondary"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs font-bold text-muted">
                        {formatDashboardMoney(budget.spent)} of {formatDashboardMoney(budget.amount)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm leading-6 text-muted">
              Add a monthly budget to see how much room is left in the garden.
            </p>
          )}
        </Card>

        {!loading && transactions.length === 0 ? (
          <EmptyState title="A fresh lily garden" body="Add today’s spending when something happens." />
        ) : null}
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedPage>
      {({ context }) => <DashboardContent householdId={context.householdId} user={context.user} />}
    </ProtectedPage>
  );
}
