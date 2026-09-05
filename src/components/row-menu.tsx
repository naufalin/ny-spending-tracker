"use client";

import { useEffect, useRef, useState } from "react";
import { classNames } from "@/lib/utils";

export type RowMenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
};

export function RowMenu({
  items,
  label = "Row actions",
}: {
  items: RowMenuItem[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function toggleMenu() {
    setOpen((current) => {
      if (!current && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setDropUp(window.innerHeight - rect.bottom < 150);
      }

      return !current;
    });
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        ref={buttonRef}
        onClick={toggleMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-accent hover:text-primary-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
          <path d="M10 6.25a1.55 1.55 0 1 0 0-3.1 1.55 1.55 0 0 0 0 3.1ZM10 11.55a1.55 1.55 0 1 0 0-3.1 1.55 1.55 0 0 0 0 3.1ZM10 16.85a1.55 1.55 0 1 0 0-3.1 1.55 1.55 0 0 0 0 3.1Z" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className={classNames(
            "absolute right-0 z-30 w-36 overflow-hidden rounded-2xl border border-border bg-card py-1 shadow-[0_14px_34px_rgba(63,52,50,0.16)]",
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={classNames(
                "block w-full px-4 py-2.5 text-left text-sm font-bold transition hover:bg-accent/60",
                item.danger ? "text-danger" : "text-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
