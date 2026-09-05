"use client";

import { Modal, dangerButtonClassName, secondaryButtonClassName } from "@/components/app-shell";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Yes, delete",
  cancelLabel = "Cancel",
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
    >
      <p className="text-sm leading-6 text-muted">{body}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className={secondaryButtonClassName}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={dangerButtonClassName}
        >
          {busy ? "Working..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
