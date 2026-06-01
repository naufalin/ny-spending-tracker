"use client";

import { useState } from "react";
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
import { formatNumberWithCommas, parseFormattedNumber, todayDate } from "@/lib/utils";
import type { Category, Channel } from "@/types/database";

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
type TransferFormOutput = {
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
  onSubmit: (values: TransferFormOutput) => Promise<string | null>;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TransferFormInput>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      amount: "",
      fromChannelId: channels[0]?.id || "",
      toChannelId: channels[1]?.id || "",
      feeAmount: "",
      feeCategoryId: "",
      note: "",
      transferredAt: todayDate(),
    },
  });

  const [saved, setSaved] = useState(false);
  const expenseCategories = categories.filter((category) => category.type === "expense");

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
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <Field label="Transfer amount">
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
          />
          {errors.amount ? (
            <p className="mt-1 text-sm font-bold text-primary-dark">{errors.amount.message}</p>
          ) : null}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <select {...register("fromChannelId")} className={inputClassName}>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="To">
            <select {...register("toChannelId")} className={inputClassName}>
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

        <Field label="Fee">
          <input
            inputMode="numeric"
            type="text"
            {...register("feeAmount", {
              onChange: (event) => {
                setValue("feeAmount", formatNumberWithCommas(event.target.value));
              },
            })}
            className={inputClassName}
            placeholder="Optional"
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
