"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { classNames } from "@/lib/utils";

type ToastTone = "default" | "success" | "danger";

type ToastInput = {
  title: string;
  body?: string;
  tone?: ToastTone;
  action?: { label: string; onClick: () => void };
  durationMs?: number;
};

type ToastItem = ToastInput & { id: number };

type ToastContextValue = {
  addToast: (toast: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>.");
  }

  return context;
}

const toneDotClass: Record<ToastTone, string> = {
  default: "bg-accent",
  success: "bg-[#9ed193]",
  danger: "bg-[#eda69e]",
};

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const { title, body, tone = "default", action, durationMs = 4000, id } = toast;

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(id), durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, id, onDismiss]);

  function handleAction() {
    action?.onClick();
    onDismiss(id);
  }

  return (
    <div className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl bg-foreground px-4 py-3 text-background shadow-[0_16px_40px_rgba(63,52,50,0.32)]">
      <span className={classNames("mt-1.5 h-2 w-2 shrink-0 rounded-full", toneDotClass[tone])} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black leading-6">{title}</p>
        {body ? <p className="text-xs leading-5 opacity-75">{body}</p> : null}
      </div>
      {action ? (
        <button
          type="button"
          onClick={handleAction}
          className="shrink-0 rounded-lg px-2 py-1 text-sm font-black text-accent underline-offset-2 transition hover:bg-white/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((toast: ToastInput) => {
    const id = nextId.current++;

    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
  }, []);

  const contextValue = useMemo(() => ({ addToast }), [addToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[70] flex flex-col items-stretch gap-2 sm:items-end md:inset-x-auto md:bottom-6 md:right-6 md:w-96"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
