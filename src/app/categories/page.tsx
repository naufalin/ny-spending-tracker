"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Card,
  EmptyState,
  PageHeader,
  ProtectedPage,
  inputClassName,
  secondaryButtonClassName,
} from "@/components/app-shell";
import { CategoryForm } from "@/components/forms";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
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
  const { addToast } = useToast();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingSub, setDeletingSub] = useState<Subcategory | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const categorySubs = subcategories.filter((sub) => sub.category_id === category.id);

  async function handleCreate() {
    if (!newName.trim()) return;

    const { error } = await supabase.from("subcategories").insert({
      household_id: householdId,
      category_id: category.id,
      name: newName.trim(),
    });

    if (error) {
      addToast({ title: "Couldn't add sub-category", body: error.message, tone: "danger" });
      return;
    }

    setNewName("");
    addToast({ title: "Sub-category added", tone: "success" });
    onRefresh();
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;

    const { error } = await supabase
      .from("subcategories")
      .update({ name: editName.trim() })
      .eq("id", id)
      .eq("household_id", householdId);

    if (error) {
      addToast({ title: "Couldn't update sub-category", body: error.message, tone: "danger" });
      return;
    }

    setEditingId(null);
    setEditName("");
    addToast({ title: "Sub-category updated", tone: "success" });
    onRefresh();
  }

  async function handleDeleteConfirm() {
    if (!deletingSub) return;

    setDeleteBusy(true);

    // Detach subcategory from transactions first
    const { error: txnError } = await supabase
      .from("transactions")
      .update({ subcategory_id: null })
      .eq("subcategory_id", deletingSub.id)
      .eq("household_id", householdId);

    if (txnError) {
      addToast({ title: "Couldn't delete sub-category", body: txnError.message, tone: "danger" });
      setDeleteBusy(false);
      return;
    }

    const { error } = await supabase
      .from("subcategories")
      .delete()
      .eq("id", deletingSub.id)
      .eq("household_id", householdId);

    setDeleteBusy(false);

    if (error) {
      addToast({ title: "Couldn't delete sub-category", body: error.message, tone: "danger" });
      return;
    }

    setDeletingSub(null);
    addToast({ title: "Sub-category deleted", tone: "success" });
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
            <div key={sub.id} className="flex flex-col gap-2 rounded-xl bg-background px-3 py-2 sm:flex-row sm:items-center">
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
                    className={`${inputClassName} min-w-0 w-full py-1 text-sm sm:flex-1`}
                    autoFocus
                  />
                  <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                    <button
                      type="button"
                      onClick={() => handleUpdate(sub.id)}
                      className="min-h-9 flex-1 rounded-lg bg-accent px-2 py-1 text-xs font-black text-primary-dark sm:flex-none"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="min-h-9 flex-1 rounded-lg px-2 py-1 text-xs font-bold text-muted sm:flex-none"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 break-words text-sm font-bold text-foreground">{sub.name}</span>
                  <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(sub.id);
                        setEditName(sub.name);
                      }}
                      className="min-h-9 flex-1 rounded-lg px-2 py-1 text-xs font-bold text-muted hover:bg-accent hover:text-primary-dark sm:flex-none"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingSub(sub)}
                      className="min-h-9 flex-1 rounded-lg px-2 py-1 text-xs font-bold text-danger hover:bg-danger-soft sm:flex-none"
                    >
                      Delete
                    </button>
                  </div>
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

      <ConfirmDialog
        open={deletingSub !== null}
        onClose={() => {
          if (!deleteBusy) {
            setDeletingSub(null);
          }
        }}
        onConfirm={handleDeleteConfirm}
        busy={deleteBusy}
        title="Delete sub-category?"
        body="Transactions will keep their amount but lose this sub-category label."
        confirmLabel="Yes, delete"
      />
    </div>
  );
}

function CategoriesContent({ householdId }: { householdId: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const { addToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [typeFilter, setTypeFilter] = useState<CategoryTypeFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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
        setLoading(false);
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
    const { error } = await supabase.from("categories").insert({
      household_id: householdId,
      name: values.name.trim(),
      type: values.type,
    });

    if (error) {
      addToast({ title: "Couldn't create jar", body: error.message, tone: "danger" });
      return;
    }

    addToast({ title: `${values.name.trim()} jar created`, tone: "success" });
    setRefreshKey((current) => current + 1);
  }

  async function updateCategory(id: string, values: Pick<Category, "name" | "type">) {
    const { error } = await supabase
      .from("categories")
      .update({
        name: values.name.trim(),
        type: values.type,
      })
      .eq("id", id)
      .eq("household_id", householdId);

    if (error) {
      addToast({ title: "Couldn't update jar", body: error.message, tone: "danger" });
      return;
    }

    setEditingId(null);
    addToast({ title: "Jar updated", tone: "success" });
    setRefreshKey((current) => current + 1);
  }

  async function handleDeleteCategoryConfirm() {
    if (!deletingCategory) {
      return;
    }

    setDeleteBusy(true);

    const [transactionResult, transferResult] = await Promise.all([
      supabase
        .from("transactions")
        .update({ category_id: null })
        .eq("category_id", deletingCategory.id)
        .eq("household_id", householdId),
      supabase
        .from("transfers")
        .update({ fee_category_id: null })
        .eq("fee_category_id", deletingCategory.id)
        .eq("household_id", householdId),
    ]);

    if (transactionResult.error || transferResult.error) {
      addToast({
        title: "Couldn't delete jar",
        body:
          transactionResult.error?.message ||
          transferResult.error?.message ||
          "Unable to detach this jar from existing records.",
        tone: "danger",
      });
      setDeleteBusy(false);
      return;
    }

    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", deletingCategory.id)
      .eq("household_id", householdId);

    setDeleteBusy(false);

    if (error) {
      addToast({ title: "Couldn't delete jar", body: error.message, tone: "danger" });
      return;
    }

    setDeletingCategory(null);
    addToast({ title: "Jar deleted", tone: "success" });
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
          <Link
            href="/budgets"
            className={`${secondaryButtonClassName} min-h-10 w-fit rounded-full px-4 py-2 text-xs`}
          >
            Budgets
          </Link>
        }
      />

      <div className="space-y-4">
        <Card>
          <CategoryForm buttonLabel="Create jar" onSubmit={createCategory} />
        </Card>

        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-card p-1" role="group" aria-label="Filter jars by type">
          {[
            ["all", "All"],
            ["expense", "Expense"],
            ["income", "Income"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTypeFilter(value as CategoryTypeFilter)}
              aria-pressed={typeFilter === value}
              className={classNames(
                "rounded-xl px-4 py-3 text-sm font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent",
                typeFilter === value
                  ? "bg-accent text-primary-dark shadow-sm"
                  : "text-muted hover:bg-background"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3" aria-hidden="true">
            <Card>
              <Skeleton className="h-5 w-40 rounded-lg" />
              <Skeleton className="mt-2 h-4 w-28 rounded-lg" />
            </Card>
            <Card>
              <Skeleton className="h-5 w-52 rounded-lg" />
              <Skeleton className="mt-2 h-4 w-24 rounded-lg" />
            </Card>
            <Card>
              <Skeleton className="h-5 w-36 rounded-lg" />
              <Skeleton className="mt-2 h-4 w-28 rounded-lg" />
            </Card>
          </div>
        ) : categories.length === 0 ? (
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
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="break-words font-black text-foreground">{category.name}</p>
                          <p className="mt-1 text-sm capitalize text-muted">
                            {category.type}
                            {subCount > 0
                              ? ` · ${subCount} ${subCount === 1 ? "sub-category" : "sub-categories"}`
                              : ""}
                          </p>
                        </div>
                        <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:shrink-0 sm:flex">
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : category.id)}
                            className="min-h-11 w-full rounded-2xl bg-background px-3 py-2 text-sm font-black text-muted transition hover:bg-accent hover:text-primary-dark sm:w-auto"
                          >
                            {isExpanded ? "Hide" : "Subs"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(category.id)}
                            className="min-h-11 w-full rounded-2xl bg-accent px-3 py-2 text-sm font-black text-primary-dark sm:w-auto sm:px-4"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingCategory(category)}
                            className="min-h-11 w-full rounded-2xl border border-border px-3 py-2 text-sm font-black text-danger transition hover:border-danger hover:bg-danger-soft sm:w-auto sm:px-4"
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

      <ConfirmDialog
        open={deletingCategory !== null}
        onClose={() => {
          if (!deleteBusy) {
            setDeletingCategory(null);
          }
        }}
        onConfirm={handleDeleteCategoryConfirm}
        busy={deleteBusy}
        title="Delete this jar?"
        body={`${deletingCategory?.name || "This jar"} will be removed. Past transactions will stay in your ledger without a jar.`}
        confirmLabel="Yes, delete jar"
      />
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
