"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { buttonClassName, Field, inputClassName } from "@/components/app-shell";
import type { TransactionType } from "@/types/database";

const categorySchema = z.object({
  name: z.string().min(1, "Enter a category name."),
  type: z.enum(["expense", "income"]),
});

type CategoryFormInput = z.input<typeof categorySchema>;

export function TypeSelect({
  value,
  onChange,
}: {
  value: TransactionType;
  onChange: (value: TransactionType) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-background p-1">
      {(["expense", "income"] as const).map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={
            value === type
              ? "rounded-xl bg-card px-4 py-3 text-sm font-black text-primary-dark shadow-sm"
              : "rounded-xl px-4 py-3 text-sm font-black text-muted"
          }
        >
          {type === "expense" ? "Expense" : "Income"}
        </button>
      ))}
    </div>
  );
}

export function CategoryForm({
  buttonLabel,
  defaultName = "",
  defaultType = "expense",
  onSubmit,
}: {
  buttonLabel: string;
  defaultName?: string;
  defaultType?: TransactionType;
  onSubmit: (values: { name: string; type: TransactionType }) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: defaultName,
      type: defaultType,
    },
  });

  const type = watch("type");

  async function handleFormSubmit(data: CategoryFormInput) {
    await onSubmit({ name: data.name, type: data.type });

    if (!defaultName) {
      reset({ name: "", type: "expense" });
    }
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <Field label="Category name">
        <input
          {...register("name")}
          className={inputClassName}
          placeholder="Groceries, transport, date night"
        />
        {errors.name ? (
          <p className="mt-1 text-sm font-bold text-primary-dark">{errors.name.message}</p>
        ) : null}
      </Field>
      <Field label="Type">
        <Controller
          control={control}
          name="type"
          render={() => (
            <TypeSelect
              value={type}
              onChange={(nextType) => setValue("type", nextType)}
            />
          )}
        />
      </Field>
      <button disabled={isSubmitting} className={`${buttonClassName} w-full`}>
        {isSubmitting ? "Saving..." : buttonLabel}
      </button>
    </form>
  );
}
