"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import type { Subcategory } from "@/types/database";

const transactionSchema = z.object({
  amount: z
    .string()
    .min(1, "Enter an amount.")
    .refine((val) => parseFormattedNumber(val) >= 1, "Amount should be at least 1 IDR."),
  type: z.enum(["expense", "income"]),
  categoryId: z.string().min(1, "Choose a category."),
  subcategoryId: z.string().nullable(),
  channelId: z.string().nullable(),
  note: z.string().nullable(),
  spentAt: z.string().min(1, "Pick a date."),
});

type TransactionFormInput = z.input<typeof transactionSchema>;
type TransactionFormOutput = {
  amount: number;
  type: TransactionType;
  categoryId: string;
  subcategoryId: string | null;
  channelId: string | null;
  note: string | null;
  spentAt: string;
};

export function TransactionForm({
  categories,
  subcategories,
  channels,
  transaction,
  defaultChannelId,
  submitLabel,
  successMessage,
  onSuccess,
  onSubmit,
}: {
  categories: Category[];
  subcategories: Subcategory[];
  channels: Channel[];
  transaction?: Transaction;
  defaultChannelId?: string | null;
  submitLabel: string;
  successMessage?: string;
  onSuccess?: () => void;
  onSubmit: (values: TransactionFormOutput) => Promise<string | null>;
}) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormInput>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      amount: transaction ? formatNumberWithCommas(String(transaction.amount)) : "",
      type: transaction?.type || "expense",
      categoryId: transaction?.category_id || "",
      subcategoryId: transaction?.subcategory_id || null,
      channelId: transaction?.channel_id || defaultChannelId || null,
      note: transaction?.note || null,
      spentAt: transaction?.spent_at || todayDate(),
    },
  });

  const [saved, setSaved] = useState(false);
  const type = watch("type");
  const amountValue = watch("amount");
  const filteredCategories = categories.filter((category) => category.type === type);
  const categoryId = watch("categoryId");
  const filteredSubcategories = subcategories.filter((sub) => sub.category_id === categoryId);

  function handleTypeChange(nextType: TransactionType) {
    setValue("type", nextType);
    const nextCategory = categories.find((category) => category.type === nextType);
    setValue("categoryId", nextCategory?.id || "");
    setValue("subcategoryId", null);
  }

  function setQuickAmount(value: number) {
    setValue("amount", formatNumberWithCommas(String(value)));
  }

  async function handleFormSubmit(data: TransactionFormInput) {
    const parsedAmount = parseFormattedNumber(data.amount);
    if (parsedAmount < 1) {
      setError("amount", { message: "Amount should be at least 1 IDR." });
      return;
    }

    if (!data.categoryId) {
      setError("categoryId", { message: "Choose a category." });
      return;
    }

    const nextError = await onSubmit({
      amount: parsedAmount,
      type: data.type,
      categoryId: data.categoryId,
      subcategoryId: data.subcategoryId || null,
      channelId: data.channelId || null,
      note: data.note?.trim() || null,
      spentAt: data.spentAt,
    });

    if (nextError) {
      setError("root", { message: nextError });
      return;
    }

    setSaved(true);
    onSuccess?.();
  }

  if (categories.length === 0) {
    return (
      <EmptyState
        title="Add categories first"
        body="Create a few jars like Groceries, Transport, or Bills before adding spending."
      />
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <Field label="How much?">
          <div className="space-y-3">
            <input
              required
              inputMode="numeric"
              type="text"
              {...register("amount", {
                onChange: (event) => {
                  const formatted = formatNumberWithCommas(event.target.value);
                  setValue("amount", formatted);
                },
              })}
              className={`${inputClassName} text-2xl font-black`}
              placeholder="50,000"
            />
            {errors.amount ? (
              <p className="text-sm font-bold text-primary-dark">{errors.amount.message}</p>
            ) : null}
            <div className="grid grid-cols-4 gap-2">
              {[10000, 25000, 50000, 100000].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setQuickAmount(value)}
                  className="rounded-xl bg-accent px-2 py-2 text-xs font-black text-primary-dark"
                >
                  {formatNumberWithCommas(String(value))}
                </button>
              ))}
            </div>
          </div>
        </Field>

        <Field label="Kind of bloom">
          <Controller
            control={control}
            name="type"
            render={() => (
              <TypeSelect value={type} onChange={handleTypeChange} />
            )}
          />
        </Field>

        <Field label="Little jar">
          <select
            {...register("categoryId", {
              onChange: () => setValue("subcategoryId", null),
            })}
            className={inputClassName}
          >
            {filteredCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {errors.categoryId ? (
            <p className="mt-1 text-sm font-bold text-primary-dark">{errors.categoryId.message}</p>
          ) : null}
        </Field>

        {filteredSubcategories.length > 0 ? (
          <Field label="Little petal">
            <select
              {...register("subcategoryId")}
              className={inputClassName}
            >
              <option value="">No sub-category</option>
              {filteredSubcategories.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Paid from">
          <select
            {...register("channelId")}
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

        <Field label="Tiny note">
          <input
            {...register("note")}
            className={inputClassName}
            placeholder="Optional sweet little memory"
          />
        </Field>

        <Field label="When?">
          <input
            required
            type="date"
            {...register("spentAt")}
            className={inputClassName}
          />
          {errors.spentAt ? (
            <p className="mt-1 text-sm font-bold text-primary-dark">{errors.spentAt.message}</p>
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
