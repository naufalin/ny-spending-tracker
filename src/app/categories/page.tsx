"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, EmptyState, PageHeader, ProtectedPage, secondaryButtonClassName, inputClassName, buttonClassName, Field } from "@/components/app-shell";
import { CategoryForm } from "@/components/forms";
import { classNames } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Category, Subcategory, TransactionType } from "@/types/database";

type CategoryTypeFilter = "all" | TransactionType;

function SubcategoryManager({
  category,
  subcategories,
  householdId,
  onRefresh,
}: {
  category: Category;
  subcategories: Subcategory[];
  householdId: string;
  onRefresh: () => void;
}) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [message, setMessage] = useState("");

  const categorySubs = subcategories.filter((sub) => sub.category_id === category.id);

  async function handleCreate() {
    if (!newName.trim()) return;
    setMessage("");

    const { error } = await supabase.from("subcategories").insert({
      household_id: householdId,
      category_id: category.id,
      name: newName.trim(),
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setNewName("");
    onRefresh();
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;
    setMessage("");

    const { error } = await supabase
      .from("subcategories")
      .update({ name: editName.trim() })
      .eq("id", id)
      .eq("household_id", householdId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setEditingId(null);
    setEditName("");
    onRefresh();
  }

  async function handleDelete(id: string) {
    const shouldDelete = window.confirm(
      "Delete this sub-category? Transactions will keep their amount but lose the sub-category label."
    );
    if (!shouldDelete) return;

    setMessage("");

    // Detach subcategory from transactions first
    const { error: txnError } = await supabase
      .from("transactions")
      .update({ subcategory_id: null })
      .eq("subcategory_id", id)
      .eq("household_id", householdId);

    if (txnError) {
      setMessage(txnError.message);
      return;
    }

    const { error } = await supabase
      .from("subcategories")
      .delete()
      .eq("id", id)
      .eq("household_id", householdId);

    if (error) {
      setMessage(error.message);
      return;
    }

    onRefresh();
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 text-xs font-black uppercase tracking-wide text-muted">
        Sub-categories ({categorySubs.length})
      </p>

      {categorySubs.length > 0 ? (
        <div className="mb-3 space-y-1">
          {categorySubs.map((sub) => (
            <div key={sub.id} className="flex items-center gap-2 rounded-xl bg-background px-3 py-2">
              {editingId === sub.id ? (
                <>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdate(sub.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className={`${inputClassName} flex-1 py-1 text-sm`}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdate(sub.id)}
                    className="rounded-lg bg-accent px-2 py-1 text-xs font-black text-primary-dark"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-lg px-2 py-1 text-xs font-bold text-muted"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-bold text-foreground">{sub.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(sub.id);
                      setEditName(sub.name);
                    }}
                    className="rounded-lg px-2 py-1 text-xs font-bold text-muted hover:bg-accent hover:text-primary-dark"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(sub.id)}
                    className="rounded-lg px-2 py-1 text-xs font-bold text-muted hover:text-primary-dark"
                  >
                    Del
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          placeholder="Add sub-category..."
          className={`${inputClassName} flex-1 py-2 text-sm`}
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={!newName.trim()}
          className="shrink-0 rounded-xl bg-accent px-3 py-2 text-sm font-black text-primary-dark disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {message ? (
        <p className="mt-2 text-xs font-bold text-primary-dark">{message}</p>
      ) : null}
    </div>
  );
}

function CategoriesContent({ householdId }: { householdId: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [typeFilter, setTypeFilter] = useState<CategoryTypeFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      const [categoryResult, subcategoryResult] = await Promise.all([
        supabase
          .from("categories")
          .select("*")
          .eq("household_id", householdId)
          .order("type")
          .order("name"),
        supabase
          .from("subcategories")
          .select("*")
          .eq("household_id", householdId)
          .order("name"),
      ]);

      if (isMounted) {
        setCategories((categoryResult.data || []) as Category[]);
        setSubcategories((subcategoryResult.data || []) as Subcategory[]);
      }
    }

    loadData();

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

  function refreshSubcategories() {
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
            {filteredCategories.map((category) => {
              const subCount = subcategories.filter((s) => s.category_id === category.id).length;
              const isExpanded = expandedId === category.id;

              return (
                <Card key={category.id}>
                  {editingId === category.id ? (
                    <CategoryForm
                      buttonLabel="Save jar"
                      defaultName={category.name}
                      defaultType={category.type}
                      onSubmit={(values) => updateCategory(category.id, values)}
                    />
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-black text-foreground">{category.name}</p>
                          <p className="mt-1 text-sm capitalize text-muted">
                            {category.type}
                            {subCount > 0 ? ` · ${subCount} sub-category${subCount > 1 ? "ies" : "y"}` : ""}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : category.id)}
                            className="rounded-2xl bg-background px-3 py-2 text-sm font-black text-muted transition hover:bg-accent hover:text-primary-dark"
                          >
                            {isExpanded ? "Hide" : "Subs"}
                          </button>
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
                      {isExpanded ? (
                        <SubcategoryManager
                          category={category}
                          subcategories={subcategories}
                          householdId={householdId}
                          onRefresh={refreshSubcategories}
                        />
                      ) : null}
                    </>
                  )}
                </Card>
              );
            })}
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
