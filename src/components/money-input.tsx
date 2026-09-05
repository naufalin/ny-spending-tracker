"use client";

import { classNames, formatAmountInput } from "@/lib/utils";
import { inputClassName } from "@/components/app-shell";

export function MoneyInput({
  value,
  onChange,
  id,
  required = false,
  placeholder = "50.000",
  className,
  ariaInvalid,
  ariaDescribedby,
}: {
  value: string;
  onChange: (formatted: string) => void;
  id?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  ariaInvalid?: boolean;
  ariaDescribedby?: string;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-muted"
      >
        Rp
      </span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        id={id}
        value={value}
        onChange={(event) => onChange(formatAmountInput(event.target.value))}
        placeholder={placeholder}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
        className={classNames(inputClassName, "pl-14 text-xl font-black tabular-nums", className)}
      />
    </div>
  );
}
