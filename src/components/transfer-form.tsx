"use client";

import { useState } from "react";
import {
  Card,
  EmptyState,
  Field,
  buttonClassName,
  inputClassName,
} from "@/components/app-shell";
import { formatNumberWithCommas, parseFormattedNumber, todayDate } from "@/lib/utils";
import type { Category, Channel } from "@/types/database";

type TransferFormValues = {
  amount: number;
  fromChannelId: string;
  toChannelId: string;
  feeAmount: number;
  feeCategoryId: string | null;
  note: string | null;
  transferredAt: string;
};

export function TransferForm({
  categories,
  channels,
  submitLabel,
  successMessage,
  onSubmit,
}: {
  categories: Category[];
  channels: Channel[];
  submitLabel: string;
  successMessage?: string;
  onSubmit: (values: TransferFormValues) => Promise<string | null>;
}) {
  const [amount, setAmount] = useState("");
  const [fromChannelId, setFromChannelId] = useState(channels[0]?.id || "");
  const [toChannelId, setToChannelId] = useState(channels[1]?.id || "");
  const [feeAmount, setFeeAmount] = useState("");
  const [feeCategoryId, setFeeCategoryId] = useState("");
  const [note, setNote] = useState("");
  const [transferredAt, setTransferredAt] = useState(todayDate());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const expenseCategories = categories.filter((category) => category.type === "expense");
  const selectedFromChannelId = fromChannelId || channels[0]?.id || "";
  const selectedToChannelId = toChannelId || channels[1]?.id || "";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    const amountValue = parseFormattedNumber(amount);
    const feeAmountValue = parseFormattedNumber(feeAmount);

    if (!amountValue || amountValue < 1) {
      setError("Amount should be at least 1 IDR.");
      setSaving(false);
      return;
    }

    if (!selectedFromChannelId || !selectedToChannelId) {
      setError("Choose both wallets first.");
      setSaving(false);
      return;
    }

    if (selectedFromChannelId === selectedToChannelId) {
      setError("Choose two different wallets.");
      setSaving(false);
      return;
    }

    const nextError = await onSubmit({
      amount: amountValue,
      fromChannelId: selectedFromChannelId,
      toChannelId: selectedToChannelId,
      feeAmount: feeAmountValue || 0,
      feeCategoryId: feeCategoryId || null,
      note: note.trim() || null,
      transferredAt,
    });

    setSaving(false);

    if (nextError) {
      setError(nextError);
      return;
    }

    setSaved(true);
  }

  if (channels.length < 2) {
    return (
      <EmptyState
        title="Add another wallet first"
        body="Transfers need at least two wallets: one source and one destination."
      />
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Transfer amount">
          <input
            required
            inputMode="numeric"
            type="text"
            value={amount}
            onChange={(event) => setAmount(formatNumberWithCommas(event.target.value))}
            className={`${inputClassName} text-2xl font-black`}
            placeholder="500,000"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <select
              required
              value={selectedFromChannelId}
              onChange={(event) => setFromChannelId(event.target.value)}
              className={inputClassName}
            >
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="To">
            <select
              required
              value={selectedToChannelId}
              onChange={(event) => setToChannelId(event.target.value)}
              className={inputClassName}
            >
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Fee">
          <input
            inputMode="numeric"
            type="text"
            value={feeAmount}
            onChange={(event) => setFeeAmount(formatNumberWithCommas(event.target.value))}
            className={inputClassName}
            placeholder="Optional"
          />
        </Field>

        <Field label="Fee category">
          <select
            value={feeCategoryId}
            onChange={(event) => setFeeCategoryId(event.target.value)}
            className={inputClassName}
          >
            <option value="">Uncategorized fee</option>
            {expenseCategories.map((category) => (
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
            placeholder="Optional transfer note"
          />
        </Field>

        <Field label="When?">
          <input
            required
            type="date"
            value={transferredAt}
            onChange={(event) => setTransferredAt(event.target.value)}
            className={inputClassName}
          />
        </Field>

        {error ? <p className="text-sm font-bold text-primary-dark">{error}</p> : null}
        {saved && successMessage ? (
          <p className="rounded-2xl bg-accent px-4 py-3 text-sm font-black text-primary-dark">
            {successMessage}
          </p>
        ) : null}

        <button disabled={saving} className={`${buttonClassName} w-full`}>
          {saving ? "Saving..." : submitLabel}
        </button>
      </form>
    </Card>
  );
}
