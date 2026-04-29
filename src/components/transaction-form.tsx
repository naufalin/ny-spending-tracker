"use client";

import { useState } from "react";
import {
  Card,
  EmptyState,
  Field,
  buttonClassName,
  inputClassName,
} from "@/components/app-shell";
import { TypeSelect } from "@/components/forms";
import { formatNumberWithCommas, parseFormattedNumber, todayDate } from "@/lib/utils";
import type { Category, Channel, Transaction, TransactionType } from "@/types/database";

type TransactionFormValues = {
  amount: number;
  type: TransactionType;
  categoryId: string;
  channelId: string | null;
  note: string | null;
  spentAt: string;
};

export function TransactionForm({
  categories,
  channels,
  transaction,
  submitLabel,
  onSubmit,
}: {
  categories: Category[];
  channels: Channel[];
  transaction?: Transaction;
  submitLabel: string;
  onSubmit: (values: TransactionFormValues) => Promise<string | null>;
}) {
  const [amount, setAmount] = useState(
    transaction ? formatNumberWithCommas(String(transaction.amount)) : ""
  );
  const [categoryId, setCategoryId] = useState(transaction?.category_id || "");
  const [channelId, setChannelId] = useState(transaction?.channel_id || "");
  const [note, setNote] = useState(transaction?.note || "");
  const [spentAt, setSpentAt] = useState(transaction?.spent_at || todayDate());
  const [type, setType] = useState<TransactionType>(transaction?.type || "expense");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filteredCategories = categories.filter((category) => category.type === type);
  const selectedCategoryId = categoryId || filteredCategories[0]?.id || "";

  function updateType(nextType: TransactionType) {
    setType(nextType);
    const nextCategory = categories.find((category) => category.type === nextType);
    setCategoryId(nextCategory?.id || "");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const amountValue = parseFormattedNumber(amount);

    if (!amountValue || amountValue < 1) {
      setError("Amount should be at least 1 IDR.");
      setSaving(false);
      return;
    }

    if (!selectedCategoryId) {
      setError("Choose a category first.");
      setSaving(false);
      return;
    }

    const nextError = await onSubmit({
      amount: amountValue,
      type,
      categoryId: selectedCategoryId,
      channelId: channelId || null,
      note: note.trim() || null,
      spentAt,
    });

    setSaving(false);

    if (nextError) {
      setError(nextError);
    }
  }

  if (categories.length === 0) {
    return (
      <EmptyState
        title="Add categories first"
        body="Create a few jars like Coffee, Groceries, or Transport before adding spending."
      />
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Amount">
          <input
            required
            inputMode="numeric"
            type="text"
            value={amount}
            onChange={(event) => setAmount(formatNumberWithCommas(event.target.value))}
            className={`${inputClassName} text-2xl font-black`}
            placeholder="50,000"
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

        <Field label="Channel">
          <select
            value={channelId}
            onChange={(event) => setChannelId(event.target.value)}
            className={inputClassName}
          >
            <option value="">No channel</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
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
          {saving ? "Saving..." : submitLabel}
        </button>
      </form>
    </Card>
  );
}
