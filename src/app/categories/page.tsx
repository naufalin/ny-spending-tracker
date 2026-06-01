"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, EmptyState, PageHeader, ProtectedPage, secondaryButtonClassName } from "@/components/app-shell";
import { CategoryForm } from "@/components/forms";
import { classNames } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Category, TransactionType } from "@/types/database";

type CategoryTypeFilter = "all" | TransactionType;

function CategoriesContent({ householdId }: { householdId: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [typeFilter, setTypeFilter] = useState<CategoryTypeFilter>("all");

  useEffect(() => {
    let isMounted = true;

    async function loadCategories() {
      const { data } = await supabase
        .from("categories")
        .select("*")
        .eq("household_id", householdId)
        .order("type")
        .order("name");

      if (isMounted) {
        setCategories((data || []) as Category[]);
      }
    }

    loadCategories();

    return () => {
      isMounted = false;
    };
  }, [householdId, refreshKey, supabase]);

  const filteredCategories = categories.filter(
    (category) => typeFilter === "all" || category.type === typeFilter
  );

  async function createCategory(values: Pick<Category, "name" | "type">) {
    setMessage("");

    const { error } = await supabase.from("categories").insert({
      household_id: householdId,
      name: values.name.trim(),
      type: values.type,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setRefreshKey((current) => current + 1);
  }

  async function updateCategory(id: string, values: Pick<Category, "name" | "type">) {
    setMessage("");

    const { error } = await supabase
      .from("categories")
      .update({
        name: values.name.trim(),
        type: values.type,
      })
      .eq("id", id)
      .eq("household_id", householdId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setEditingId(null);
    setRefreshKey((current) => current + 1);
  }

  async function deleteCategory(id: string) {
    const shouldDelete = window.confirm(
      "Delete this jar? Past transactions will stay in your ledger without a jar."
    );

    if (!shouldDelete) {
      return;
    }

    setMessage("");

    const [transactionResult, transferResult] = await Promise.all([
      supabase
        .from("transactions")
        .update({ category_id: null })
        .eq("category_id", id)
        .eq("household_id", householdId),
      supabase
        .from("transfers")
        .update({ fee_category_id: null })
        .eq("fee_category_id", id)
        .eq("household_id", householdId),
    ]);

    if (transactionResult.error || transferResult.error) {
      setMessage(
        transactionResult.error?.message ||
          transferResult.error?.message ||
          "Unable to detach this jar from existing records."
      );
      return;
    }

    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", id)
      .eq("household_id", householdId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setRefreshKey((current) => current + 1);
  }

  return (
    <>
      <PageHeader
        eyebrow="Little jars"
        title="Spending jars"
        action={
          <Link href="/budgets" className={secondaryButtonClassName}>
            Budgets
          </Link>
        }
      />

      <div className="space-y-4">
        <Card>
          <CategoryForm buttonLabel="Create jar" onSubmit={createCategory} />
          {message ? <p className="mt-4 text-sm font-bold text-primary-dark">{message}</p> : null}
        </Card>

        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-card p-1">
          {[
            ["all", "All"],
            ["expense", "Expense"],
            ["income", "Income"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTypeFilter(value as CategoryTypeFilter)}
              className={classNames(
                "rounded-xl px-4 py-3 text-sm font-black transition",
                typeFilter === value
                  ? "bg-accent text-primary-dark shadow-sm"
                  : "text-muted hover:bg-background"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {categories.length === 0 ? (
          <EmptyState
            title="No jars yet"
            body="Try Coffee, Groceries, Transport, Bills, or Date Night."
          />
        ) : filteredCategories.length === 0 ? (
          <EmptyState title="No matching jars" body="Try another type filter." />
        ) : (
          <div className="space-y-3">
            {filteredCategories.map((category) => (
              <Card key={category.id}>
                {editingId === category.id ? (
                  <CategoryForm
                    buttonLabel="Save jar"
                    defaultName={category.name}
                    defaultType={category.type}
                    onSubmit={(values) => updateCategory(category.id, values)}
                  />
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-black text-foreground">{category.name}</p>
                      <p className="mt-1 text-sm capitalize text-muted">{category.type}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(category.id)}
                        className="rounded-2xl bg-accent px-4 py-2 text-sm font-black text-primary-dark"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCategory(category.id)}
                        className="rounded-2xl border border-border px-4 py-2 text-sm font-black text-muted"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function CategoriesPage() {
  return (
    <ProtectedPage>
      {({ context }) => <CategoriesContent householdId={context.householdId} />}
    </ProtectedPage>
  );
}
