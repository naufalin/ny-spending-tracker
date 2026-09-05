"use client";

import { classNames, formatIdr } from "@/lib/utils";

export type MoneyTone = "neutral" | "expense" | "income" | "danger";

export function Money({
  amount,
  tone = "neutral",
  signed = false,
  className,
}: {
  amount: number;
  tone?: MoneyTone;
  signed?: boolean;
  className?: string;
}) {
  const sign = amount < 0 ? "-" : signed && amount > 0 ? "+" : "";
  const toneClass =
    tone === "income"
      ? "text-success"
      : tone === "expense"
        ? "text-primary-dark"
        : tone === "danger"
          ? "text-danger"
          : "text-foreground";

  return (
    <span className={classNames("whitespace-nowrap tabular-nums", toneClass, className)}>
      {sign}
      {formatIdr(Math.abs(amount))}
    </span>
  );
}
