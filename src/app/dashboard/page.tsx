"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Card, EmptyState, PageHeader, ProtectedPage, buttonClassName } from "@/components/app-shell";
import { formatIdr, monthStart, nextMonthStart, todayDate } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Budget, Transaction } from "@/types/database";

type CategoryTotal = {
  id?: string;
  name: string;
  amount: number;
};

function getGreetingName(user: User) {
  const metadata = user.user_metadata || {};
  const name =
    metadata.full_name ||
    metadata.name ||
    metadata.display_name ||
    user.email?.split("@")[0];

  return typeof name === "string" && name.trim() ? name.trim() : "home";
}

function DashboardContent({ householdId, user }: { householdId: string; user: User }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const greetingName = getGreetingName(user);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);

      const [transactionResult, budgetResult] = await Promise.all([
        supabase
          .from("transactions")
          .select("*, categories(id, name, type), channels(id, name)")
          .eq("household_id", householdId)
          .gte("spent_at", monthStart())
          .lt("spent_at", nextMonthStart())
          .order("spent_at", { ascending: false }),
        supabase
          .from("budgets")
          .select("*, categories(id, name, type)")
          .eq("household_id", householdId)
          .eq("month", monthStart()),
      ]);

      setTransactions((transactionResult.data || []) as Transaction[]);
      setBudgets((budgetResult.data || []) as Budget[]);
      setLoading(false);
    }

    loadDashboard();
  }, [householdId, supabase]);

  const expenses = transactions.filter((transaction) => transaction.type === "expense");
  const monthTotal = expenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const todayTotal = expenses
    .filter((transaction) => transaction.spent_at === todayDate())
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const coffeeTotal = expenses
    .filter((transaction) => {
      const name = transaction.categories?.name.toLowerCase() || "";
      return name.includes("coffee") || name.includes("kopi");
    })
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const categoryTotals = expenses.reduce<Record<string, CategoryTotal>>((acc, transaction) => {
    const name = transaction.categories?.name || "Uncategorized";
    acc[name] = acc[name] || { id: transaction.category_id || undefined, name, amount: 0 };
    acc[name].amount += transaction.amount;
    return acc;
  }, {});

  const channelTotals = expenses.reduce<Record<string, CategoryTotal>>((acc, transaction) => {
    const name = transaction.channels?.name || "No channel";
    acc[name] = acc[name] || { name, amount: 0 };
    acc[name].amount += transaction.amount;
    return acc;
  }, {});

  const topCategories = Object.values(categoryTotals)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4);

  const topChannels = Object.values(channelTotals)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4);

  const totalBudget = budgets.reduce((sum, budget) => sum + budget.amount, 0);
  const remainingBudget = totalBudget - monthTotal;
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
        <Card className="bg-[radial-gradient(circle_at_top_right,#F6D6DE,transparent_45%),#FFFFFF]">
          <p className="text-sm font-black text-primary-dark">This month</p>
          <p className="mt-2 text-4xl font-black text-foreground">
            {loading ? "..." : formatIdr(monthTotal)}
          </p>
          <p className="mt-2 text-sm text-muted">Little expenses, big memories.</p>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <p className="text-sm font-black text-muted">Today</p>
            <p className="mt-2 text-2xl font-black text-foreground">
              {loading ? "..." : formatIdr(todayTotal)}
            </p>
          </Card>
          <Card>
            <p className="text-sm font-black text-muted">Coffee treats</p>
            <p className="mt-2 text-2xl font-black text-foreground">
              {loading ? "..." : formatIdr(coffeeTotal)}
            </p>
          </Card>
        </div>

        <Card>
          <h2 className="text-lg font-black text-foreground">Top categories</h2>
          {topCategories.length ? (
            <div className="mt-4 space-y-3">
              {topCategories.map((category) => (
                <div key={category.name} className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-foreground">{category.name}</span>
                  <span className="text-sm font-black text-primary-dark">
                    {formatIdr(category.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No spending yet today. A fresh lily garden 🌸</p>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-black text-foreground">By channel</h2>
          {topChannels.length ? (
            <div className="mt-4 space-y-3">
              {topChannels.map((channel) => (
                <div key={channel.name} className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-foreground">{channel.name}</span>
                  <span className="text-sm font-black text-primary-dark">
                    {formatIdr(channel.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No channel spending yet.</p>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-black text-foreground">Garden progress</h2>
          {totalBudget > 0 ? (
            <>
              <p className="mt-2 text-sm text-muted">Remaining budget this month</p>
              <p className="mt-2 text-3xl font-black text-foreground">
                {formatIdr(remainingBudget)}
              </p>
              <div className="mt-4 space-y-4">
                {budgetProgress.map((budget) => {
                  const percent = Math.min(100, Math.round((budget.spent / budget.amount) * 100));

                  return (
                    <div key={budget.id}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-black text-foreground">{budget.name}</p>
                        <p className="text-sm font-bold text-muted">
                          {formatIdr(budget.remaining)} left
                        </p>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-background">
                        <div
                          className="h-full rounded-full bg-secondary"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs font-bold text-muted">
                        {formatIdr(budget.spent)} of {formatIdr(budget.amount)}
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
