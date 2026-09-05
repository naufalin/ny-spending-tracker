"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  EmptyState,
  Field,
  PageHeader,
  ProtectedPage,
  buttonClassName,
  inputClassName,
} from "@/components/app-shell";
import { MoneyInput } from "@/components/money-input";
import { Money } from "@/components/money";
import { useToast } from "@/components/toast";
import { parseFormattedNumber, monthStart } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Budget, Category } from "@/types/database";

function BudgetsContent({ householdId }: { householdId: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const { addToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [month, setMonth] = useState(monthStart());
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [amountError, setAmountError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      const [categoryResult, budgetResult] = await Promise.all([
        supabase
          .from("categories")
          .select("*")
          .eq("household_id", householdId)
          .eq("type", "expense")
          .order("name"),
        supabase
          .from("budgets")
          .select("*, categories(id, name, type)")
          .eq("household_id", householdId)
          .eq("month", month)
          .order("created_at", { ascending: false }),
      ]);

      if (!isMounted) {
        return;
      }

      const nextCategories = (categoryResult.data || []) as Category[];
      setCategories(nextCategories);
      setBudgets((budgetResult.data || []) as Budget[]);
      setCategoryId((current) => current || nextCategories[0]?.id || "");
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [householdId, month, refreshKey, supabase]);

  async function saveBudget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setAmountError("");

    const amountValue = parseFormattedNumber(amount);

    if (amountValue < 1) {
      setAmountError("Budget amount should be at least 1 IDR.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("budgets").upsert(
      {
        household_id: householdId,
        category_id: categoryId,
        month,
        amount: amountValue,
      },
      {
        onConflict: "household_id,category_id,month",
      }
    );

    setSaving(false);

    if (error) {
      addToast({ title: "Couldn't save budget", body: error.message, tone: "danger" });
      return;
    }

    setAmount("");
    addToast({ title: "Garden plan saved", tone: "success" });
    setRefreshKey((current) => current + 1);
  }

  return (
    <>
      <PageHeader eyebrow="Garden plan" title="Budget garden" />

      <div className="space-y-4">
        {categories.length === 0 ? (
          <EmptyState
            title="Add expense categories first"
            body="Budgets need category jars before they can bloom."
          />
        ) : (
          <Card>
            <form onSubmit={saveBudget} className="space-y-4">
              <Field label="Month">
                <input
                  type="month"
                  value={month.slice(0, 7)}
                  onChange={(event) => setMonth(`${event.target.value}-01`)}
                  className={inputClassName}
                />
              </Field>

              <Field label="Category">
                <select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  className={inputClassName}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Amount">
                <MoneyInput
                  value={amount}
                  onChange={(formatted) => {
                    setAmount(formatted);
                    if (amountError) {
                      setAmountError("");
                    }
                  }}
                  placeholder="1.500.000"
                  required
                  ariaInvalid={Boolean(amountError)}
                />
              </Field>

              {amountError ? <p className="text-sm font-bold text-danger">{amountError}</p> : null}

              <button disabled={saving || !categoryId} className={`${buttonClassName} w-full`}>
                {saving ? "Saving..." : "Save garden plan"}
              </button>
            </form>
          </Card>
        )}

        {budgets.length === 0 ? (
          <EmptyState
            title="No garden plan yet"
            body="Set a monthly amount for groceries, coffee, or any spending jar."
          />
        ) : (
          <div className="space-y-3">
            {budgets.map((budget) => (
              <Card key={budget.id}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-foreground">
                      {budget.categories?.name || "Category"}
                    </p>
                    <p className="mt-1 text-sm text-muted">{month.slice(0, 7)}</p>
                  </div>
                  <Money amount={budget.amount} className="text-right font-black" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function BudgetsPage() {
  return (
    <ProtectedPage>
      {({ context }) => <BudgetsContent householdId={context.householdId} />}
    </ProtectedPage>
  );
}
