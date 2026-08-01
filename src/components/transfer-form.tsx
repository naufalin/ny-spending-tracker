"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Card,
  EmptyState,
  Field,
  buttonClassName,
  inputClassName,
} from "@/components/app-shell";
import { formatIdr, formatNumberWithCommas, parseFormattedNumber, todayDate } from "@/lib/utils";
import type { Category, Channel, Transfer, TransferInput } from "@/types/database";

const transferSchema = z
  .object({
    amount: z
      .string()
      .min(1, "Enter an amount.")
      .refine((val) => parseFormattedNumber(val) >= 1, "Amount should be at least 1 IDR."),
    fromChannelId: z.string().min(1, "Choose a source wallet."),
    toChannelId: z.string().min(1, "Choose a destination wallet."),
    feeAmount: z.string().optional(),
    feeCategoryId: z.string().optional(),
    note: z.string().optional(),
    transferredAt: z.string().min(1, "Pick a date."),
  })
  .refine((data) => data.fromChannelId !== data.toChannelId, {
    message: "Choose two different wallets.",
    path: ["toChannelId"],
  });

type TransferFormInput = z.input<typeof transferSchema>;
export function TransferForm({
  categories,
  channels,
  channelBalances,
  transfer,
  submitLabel,
  successMessage,
  onSuccess,
  onSubmit,
}: {
  categories: Category[];
  channels: Channel[];
  channelBalances?: Record<string, number>;
  transfer?: Transfer;
  submitLabel: string;
  successMessage?: string;
  onSuccess?: () => void;
  onSubmit: (values: TransferInput) => Promise<string | null>;
}) {
  const defaultValues = useMemo<TransferFormInput>(
    () => ({
      amount: transfer ? formatNumberWithCommas(String(transfer.amount)) : "",
      fromChannelId: transfer?.from_channel_id || channels[0]?.id || "",
      toChannelId: transfer?.to_channel_id || channels[1]?.id || "",
      feeAmount: transfer?.fee_amount ? formatNumberWithCommas(String(transfer.fee_amount)) : "",
      feeCategoryId: transfer?.fee_category_id || "",
      note: transfer?.note || "",
      transferredAt: transfer?.transferred_at || todayDate(),
    }),
    [channels, transfer]
  );
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TransferFormInput>({
    resolver: zodResolver(transferSchema),
    defaultValues,
  });

  const [saved, setSaved] = useState(false);
  const expenseCategories = categories.filter((category) => category.type === "expense");
  const selectedFromChannelId = watch("fromChannelId");
  const selectedToChannelId = watch("toChannelId");
  const watchedAmount = watch("amount");
  const watchedFeeAmount = watch("feeAmount");
  const selectedFromChannel = channels.find((channel) => channel.id === selectedFromChannelId);
  const selectedToChannel = channels.find((channel) => channel.id === selectedToChannelId);
  const transferAmount = parseFormattedNumber(watchedAmount || "0");
  const feeAmount = parseFormattedNumber(watchedFeeAmount || "0");
  const sourceOutflow = transferAmount + feeAmount;

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  async function handleFormSubmit(data: TransferFormInput) {
    const parsedAmount = parseFormattedNumber(data.amount);
    const parsedFee = parseFormattedNumber(data.feeAmount || "0");

    if (parsedAmount < 1) {
      setError("amount", { message: "Amount should be at least 1 IDR." });
      return;
    }

    const nextError = await onSubmit({
      amount: parsedAmount,
      fromChannelId: data.fromChannelId,
      toChannelId: data.toChannelId,
      feeAmount: parsedFee || 0,
      feeCategoryId: data.feeCategoryId || null,
      note: data.note?.trim() || null,
      transferredAt: data.transferredAt,
    });

    if (nextError) {
      setError("root", { message: nextError });
      return;
    }

    setSaved(true);
    onSuccess?.();
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
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
        <div className="rounded-3xl bg-[linear-gradient(145deg,#FFFFFF,#FFF9F2)] p-4">
          <p className="text-sm font-black text-primary-dark">Move money between wallets</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            This keeps the money in your household total. Only an optional fee counts as spending.
          </p>
        </div>

        <Field label="How much?">
          <input
            required
            inputMode="numeric"
            type="text"
            {...register("amount", {
              onChange: (event) => {
                setValue("amount", formatNumberWithCommas(event.target.value));
              },
            })}
            className={`${inputClassName} text-2xl font-black`}
            placeholder="500,000"
            aria-label="Transfer amount"
          />
          {errors.amount ? (
            <p className="mt-1 text-sm font-bold text-primary-dark">{errors.amount.message}</p>
          ) : null}
        </Field>

        <div className="rounded-3xl border border-border bg-background p-3">
          <div className="space-y-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end sm:gap-3 sm:space-y-0">
            <Field label="From wallet">
              <select {...register("fromChannelId")} className={`${inputClassName} min-w-0`}>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="flex h-10 items-center justify-center text-2xl font-black text-primary-dark sm:pb-1" aria-hidden="true">
              <span className="sm:hidden">↓</span>
              <span className="hidden sm:inline">→</span>
            </div>

            <Field label="To wallet">
              <select {...register("toChannelId")} className={`${inputClassName} min-w-0`}>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
              {errors.toChannelId ? (
                <p className="mt-1 text-sm font-bold text-primary-dark">{errors.toChannelId.message}</p>
              ) : null}
            </Field>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-3 text-xs font-bold text-muted">
            <span className="min-w-0 truncate">{selectedFromChannel?.name || "Source wallet"}</span>
            <span aria-hidden="true">→</span>
            <span className="min-w-0 truncate text-right">{selectedToChannel?.name || "Destination wallet"}</span>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-foreground">Optional fee</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Fees are recorded as an expense from the source wallet.
              </p>
            </div>
            {feeAmount > 0 ? (
              <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-black text-primary-dark">
                {formatIdr(feeAmount)}
              </span>
            ) : null}
          </div>
          <div className="mt-4 space-y-4">
            <Field label="Fee amount">
              <input
                inputMode="numeric"
                type="text"
                {...register("feeAmount", {
                  onChange: (event) => {
                    setValue("feeAmount", formatNumberWithCommas(event.target.value));
                  },
                })}
                className={inputClassName}
                placeholder="0"
              />
            </Field>

            <Field label="Fee category">
              <select {...register("feeCategoryId")} className={inputClassName}>
                <option value="">Uncategorized fee</option>
                {expenseCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        {channelBalances && Object.keys(channelBalances).length > 0 ? (
          <div className="rounded-3xl bg-secondary/15 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-muted">Source balance</p>
                <p className="mt-1 truncate text-sm font-black text-foreground">
                  {selectedFromChannel?.name || "Source wallet"}
                </p>
              </div>
              <p className="shrink-0 text-right text-sm font-black text-foreground">
                {formatIdr(channelBalances[selectedFromChannelId] || 0)}
              </p>
            </div>
            {sourceOutflow > (channelBalances[selectedFromChannelId] || 0) ? (
              <p className="mt-3 rounded-2xl bg-card/80 px-3 py-2 text-xs font-bold leading-5 text-primary-dark">
                This move is higher than the current recorded balance. You can still save it for cash or offline adjustments.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Note">
            <input
              {...register("note")}
              className={inputClassName}
              placeholder="Optional transfer note"
            />
          </Field>

          <Field label="When?">
            <input
              required
              type="date"
              {...register("transferredAt")}
              className={inputClassName}
            />
            {errors.transferredAt ? (
              <p className="mt-1 text-sm font-bold text-primary-dark">{errors.transferredAt.message}</p>
            ) : null}
          </Field>
        </div>

        {transferAmount > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-background px-4 py-3 text-sm">
            <span className="font-bold text-muted">Leaving source wallet</span>
            <span className="shrink-0 font-black text-primary-dark">{formatIdr(sourceOutflow)}</span>
          </div>
        ) : null}

        {errors.root ? (
          <p className="text-sm font-bold text-primary-dark">{errors.root.message}</p>
        ) : null}
        {saved && successMessage ? (
          <p className="rounded-2xl bg-accent px-4 py-3 text-sm font-black text-primary-dark">
            {successMessage}
          </p>
        ) : null}

        <button disabled={isSubmitting} className={`${buttonClassName} w-full`}>
          {isSubmitting ? "Saving..." : submitLabel}
        </button>
      </form>
    </Card>
  );
}
