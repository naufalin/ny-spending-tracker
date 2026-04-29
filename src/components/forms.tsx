"use client";

import { useState } from "react";
import { buttonClassName, Field, inputClassName } from "@/components/app-shell";
import type { TransactionType } from "@/types/database";

export function TypeSelect({
  value,
  onChange,
}: {
  value: TransactionType;
  onChange: (value: TransactionType) => void;
}) {
  const [current, setCurrent] = useState<TransactionType>(value);

  function update(nextValue: TransactionType) {
    setCurrent(nextValue);
    onChange(nextValue);
  }

  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-background p-1">
      {(["expense", "income"] as const).map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => update(type)}
          className={
            current === type
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
  const [name, setName] = useState(defaultName);
  const [type, setType] = useState<TransactionType>(defaultType);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await onSubmit({ name, type });
    setSaving(false);

    if (!defaultName) {
      setName("");
      setType("expense");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Category name">
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={inputClassName}
          placeholder="Coffee, groceries, date night"
        />
      </Field>
      <Field label="Type">
        <TypeSelect value={type} onChange={setType} />
      </Field>
      <button disabled={saving} className={`${buttonClassName} w-full`}>
        {saving ? "Saving..." : buttonLabel}
      </button>
    </form>
  );
}
