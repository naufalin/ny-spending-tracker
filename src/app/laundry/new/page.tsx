"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, PageHeader, ProtectedPage, buttonClassName, inputClassName, secondaryButtonClassName } from "@/components/app-shell";
import { LaundryBack, LaundryLoading, LaundryLoadError, useLaundryData } from "@/components/laundry";
import { laundryToday } from "@/lib/laundry";
import { getSupabaseClient } from "@/lib/supabase/client";

function NewLaundryContent({ householdId, userId }: { householdId: string; userId: string }) {
  const router = useRouter();
  const { batches, owners, error, reload } = useLaundryData(householdId, undefined, userId);
  const [rows, setRows] = useState([0]);
  const nextRow = useRef(1);
  const batchId = useRef<string | null>(null);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const today = laundryToday();
  const suggestions = new Map<string, string>();
  for (const batch of batches ?? []) {
    for (const item of batch.items) {
      const key = item.name.toLowerCase();
      if (!suggestions.has(key)) suggestions.set(key, item.name);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const fields = new FormData(event.currentTarget);
    const items = rows.map((row) => ({
      name: String(fields.get(`name-${row}`) ?? "").trim(),
      owner_key: String(fields.get(`owner-${row}`) ?? "") || null,
      quantity: Number(fields.get(`quantity-${row}`)),
    }));
    if (items.some(({ name }) => !name)) {
      setSaveError("Enter an item name for each row.");
      return;
    }

    pending.current = true;
    setSaving(true);
    setSaveError("");
    try {
      batchId.current ??= crypto.randomUUID();
      const { error } = await getSupabaseClient().rpc("create_laundry_batch", {
        p_batch_id: batchId.current,
        p_household_id: householdId,
        p_sent_on: fields.get("sent_on"),
        p_items: items,
      });
      if (error) throw new Error(error.message);
      router.push("/laundry");
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Could not save the batch.");
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl">
      <LaundryBack />
      <PageHeader title="New batch" />
      {error ? <LaundryLoadError error={error} reload={reload} /> : !batches ? <LaundryLoading /> : (
        <form onSubmit={save}>
          <fieldset className="min-w-0 space-y-3" disabled={saving}>
            <Field label="Drop-off date">
              <input name="sent_on" type="date" required max={today} defaultValue={today} className={inputClassName} />
            </Field>
            <h2 className="pt-2 font-black">Items sent</h2>
            <datalist id="laundry-item-suggestions">
              {[...suggestions.values()].map((name) => <option key={name} value={name} />)}
            </datalist>
            {rows.map((row, index) => (
              <Card key={row} className="space-y-3">
                <Field label="Item name">
                  <input name={`name-${row}`} className={inputClassName} placeholder="e.g. Blue striped work shirt" list="laundry-item-suggestions" required maxLength={120} />
                </Field>
                <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2">
                  <Field label="Owner (optional)">
                    <select name={`owner-${row}`} className={inputClassName}>
                      <option value="">No owner</option>
                      {owners.map((owner) => <option key={owner.key} value={owner.key}>{owner.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Quantity">
                    <input name={`quantity-${row}`} className={inputClassName} type="number" inputMode="numeric" required min={1} max={999} defaultValue={1} />
                  </Field>
                </div>
                {rows.length > 1 ? (
                  <button type="button" aria-label={`Remove item ${index + 1}`} onClick={() => setRows((values) => values.filter((id) => id !== row))} className="min-h-11 rounded-lg px-2 text-sm font-black text-danger hover:bg-danger-soft">
                    Remove
                  </button>
                ) : null}
              </Card>
            ))}
            {rows.length < 100 ? (
              <button type="button" onClick={() => {
                const row = nextRow.current++;
                setRows((values) => [...values, row]);
                requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[name="name-${row}"]`)?.focus());
              }} className={`${secondaryButtonClassName} w-full`}>+ Add item</button>
            ) : null}
            {saveError ? <p role="alert" className="text-sm font-bold text-danger">{saveError}</p> : null}
            <button className={`${buttonClassName} w-full`}>{saving ? "Saving…" : "Save batch"}</button>
          </fieldset>
        </form>
      )}
    </div>
  );
}

export default function NewLaundryPage() {
  return <ProtectedPage>{({ context }) => (
    <NewLaundryContent key={context.householdId} householdId={context.householdId} userId={context.user.id} />
  )}</ProtectedPage>;
}
