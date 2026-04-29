"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  EmptyState,
  Field,
  PageHeader,
  ProtectedPage,
  buttonClassName,
  inputClassName,
} from "@/components/app-shell";
import { TypeSelect } from "@/components/forms";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatNumberWithCommas, parseFormattedNumber, todayDate } from "@/lib/utils";
import type { Category, TransactionType } from "@/types/database";

function NewTransactionContent({
  householdId,
  userId,
}: {
  householdId: string;
  userId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");
  const [spentAt, setSpentAt] = useState(todayDate());
  const [type, setType] = useState<TransactionType>("expense");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase
        .from("categories")
        .select("*")
        .eq("household_id", householdId)
        .order("name");

      setCategories((data || []) as Category[]);
    }

    loadCategories();
  }, [householdId, supabase]);

  const filteredCategories = categories.filter((category) => category.type === type);
  const selectedCategoryId = categoryId || filteredCategories[0]?.id || "";

  function updateType(nextType: TransactionType) {
    setType(nextType);
    const nextCategory = categories.find((category) => category.type === nextType);
    setCategoryId(nextCategory?.id || "");
  }

  async function saveTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const amountValue = parseFormattedNumber(amount);

    if (!amountValue || amountValue < 1) {
      setError("Amount should be at least 1 IDR.");
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("transactions").insert({
      household_id: householdId,
      user_id: userId,
      category_id: selectedCategoryId || null,
      amount: amountValue,
      type,
      note: note.trim() || null,
      spent_at: spentAt,
    });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/transactions");
  }

  return (
    <>
      <PageHeader eyebrow="Add today’s spending 🌸" title="New transaction" />

      {categories.length === 0 ? (
        <EmptyState
          title="Add categories first"
          body="Create a few jars like Coffee, Groceries, or Transport before adding spending."
        />
      ) : (
        <Card>
          <form onSubmit={saveTransaction} className="space-y-4">
            <Field label="Amount">
              <input
                required
                inputMode="numeric"
                type="text"
                value={amount}
                onChange={(event) => setAmount(formatNumberWithCommas(event.target.value))}
                className={`${inputClassName} text-2xl font-black`}
                placeholder="50000"
              />
            </Field>

            <Field label="Type">
              <TypeSelect value={type} onChange={updateType} />
            </Field>

            <Field label="Category">
              <select
                required
                value={selectedCategoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className={inputClassName}
              >
                {filteredCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Note">
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className={inputClassName}
                placeholder="Optional sweet little detail"
              />
            </Field>

            <Field label="Date">
              <input
                required
                type="date"
                value={spentAt}
                onChange={(event) => setSpentAt(event.target.value)}
                className={inputClassName}
              />
            </Field>

            {error ? <p className="text-sm font-bold text-primary-dark">{error}</p> : null}

            <button disabled={saving} className={`${buttonClassName} w-full`}>
              {saving ? "Saving..." : "Save spending"}
            </button>
          </form>
        </Card>
      )}
    </>
  );
}

export default function NewTransactionPage() {
  return (
    <ProtectedPage>
      {({ context }) => (
        <NewTransactionContent householdId={context.householdId} userId={context.user.id} />
      )}
    </ProtectedPage>
  );
}
