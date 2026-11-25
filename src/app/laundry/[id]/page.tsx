"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState, type FormEvent } from "react";
import { Card, EmptyState, Field, PageHeader, ProtectedPage, buttonClassName, inputClassName, secondaryButtonClassName } from "@/components/app-shell";
import { LaundryBack, LaundryLoadError, LaundryLoading, LaundryTag, useLaundryData } from "@/components/laundry";
import { batchTotals, laundryToday, returnEntries, returnedQuantity, type LaundryItem, type LaundryReturns } from "@/lib/laundry";
import { getSupabaseClient } from "@/lib/supabase/client";
import { classNames, formatDate } from "@/lib/utils";

const countButtonClass = "min-h-11 min-w-11 rounded-xl px-2 text-sm font-black tabular-nums transition hover:bg-accent focus-visible:ring-4 focus-visible:ring-accent disabled:opacity-55";

function BatchContent({ householdId, batchId }: { householdId: string; batchId: string }) {
  const params = useSearchParams();
  const fromHistory = params.get("from") === "history";
  const historyParams = new URLSearchParams(params.toString());
  historyParams.delete("from");
  const historyQuery = historyParams.toString();
  const historyHref = historyQuery ? `/laundry/history?${historyQuery}` : "/laundry/history";
  const { batches, setBatches, error, reload } = useLaundryData(householdId, batchId);
  const batch = batches?.[0];
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const pending = useRef(false);
  const today = laundryToday();
  const supabase = getSupabaseClient();

  async function mutate(operation: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setSaveError("");
    try {
      await operation();
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Could not save the change.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  async function saveCount(item: LaundryItem, count: number, day: string) {
    await mutate(async () => {
      const { data, error } = await supabase.rpc("set_laundry_return", {
        p_batch_id: batchId,
        p_item_id: item.id,
        p_expected_returns: item.returns,
        p_count: count,
        p_returned_on: day,
      });
      if (error) {
        setEditing(null);
        reload();
        throw new Error(error.message);
      }

      setBatches((values) => values?.map((entry) => ({
        ...entry,
        items: entry.items.map((row) => row.id === item.id ? { ...row, returns: data as LaundryReturns } : row),
      })) ?? null);
      setEditing(null);
    });
  }

  async function closeBatch(missing: number, note: string | null = null) {
    if (!batch) return;
    await mutate(async () => {
      const { error } = await supabase.rpc("close_laundry_batch", {
        p_batch_id: batchId,
        p_expected_returns: Object.fromEntries(batch.items.map((item) => [item.id, item.returns])),
        p_note: note,
      });
      if (error) {
        if (error.code === "40001") setConfirming(false);
        reload();
        throw new Error(error.message);
      }
      setBatches((values) => values?.map((entry) => ({
        ...entry, closed_at: new Date().toISOString(), discrepancy_note: missing ? note : null,
      })) ?? null);
      setConfirming(false);
      setEditing(null);
    });
  }

  function submitCount(event: FormEvent<HTMLFormElement>, item: LaundryItem) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void saveCount(item, Number(fields.get("count")), String(fields.get("returned_on")));
  }

  function submitDiscrepancy(event: FormEvent<HTMLFormElement>, missing: number) {
    event.preventDefault();
    const note = String(new FormData(event.currentTarget).get("note") ?? "").trim();
    if (!note) {
      setSaveError("Add a note about the missing items.");
      return;
    }
    void closeBatch(missing, note);
  }

  const totals = batch ? batchTotals(batch) : null;

  return (
    <div className="max-w-xl">
      <LaundryBack href={fromHistory ? historyHref : "/laundry"}>{fromHistory ? "Item history" : "Laundry"}</LaundryBack>
      <PageHeader title={batch?.closed_at ? "Batch details" : "Check return"} />
      {error ? <LaundryLoadError error={error} reload={reload} /> : !batches ? <LaundryLoading /> : !batch || !totals ? (
        <EmptyState title="Batch not found" body="This batch is unavailable in your household." />
      ) : (
        <div className="space-y-4">
          <Card className="space-y-3">
            <p className="text-sm text-muted">Sent {formatDate(batch.sent_on)}</p>
            <div className="flex flex-wrap items-center justify-between gap-2" aria-live="polite">
              <p className="font-black">{totals.returned} of {totals.sent} returned</p>
              <LaundryTag tone={totals.missing ? "amber" : "green"}>
                {totals.missing ? `${totals.missing} ${batch.closed_at ? "missing" : "outstanding"}` : "All returned"}
              </LaundryTag>
            </div>
            <div role="progressbar" aria-label="Items returned" aria-valuemin={0} aria-valuenow={totals.returned} aria-valuemax={totals.sent} className="h-2 overflow-hidden rounded-full bg-accent">
              <div className="h-full rounded-full bg-success motion-safe:transition-[width]" style={{ width: `${totals.returned / totals.sent * 100}%` }} />
            </div>
          </Card>

          <section aria-labelledby="laundry-items" className="space-y-2">
            <h2 id="laundry-items" className="font-black">Items sent</h2>
            {!batch.closed_at ? <p className="text-sm text-muted">Tap the circle for a full return today, or tap the count to enter a different quantity or date.</p> : null}
            {batch.items.map((item) => {
              const count = returnedQuantity(item);
              const complete = count === item.quantity;
              const label = item.owner_label ? `${item.name}, ${item.owner_label}` : item.name;
              const entries = returnEntries(item);

              return (
                <Card key={item.id} className="space-y-3">
                  <div className="flex items-center gap-2">
                    {!batch.closed_at ? (
                      <button type="button" disabled={saving || confirming} aria-label={complete ? `All returned. Adjust ${label}` : `Mark all returned for ${label}`}
                        className={classNames(countButtonClass, complete ? "bg-success-soft text-success" : "bg-accent")}
                        onClick={() => {
                          if (complete) setEditing(item.id);
                          else void saveCount(item, item.quantity, today);
                        }}>{complete ? "✓" : "○"}</button>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words font-black">{item.name}</h3>
                      {item.owner_label ? <LaundryTag tone={item.owner_key === "shared" ? "green" : "pink"}>{item.owner_label}</LaundryTag> : null}
                    </div>
                    {batch.closed_at ? <span className="text-sm font-black tabular-nums">{count}/{item.quantity} returned</span> : (
                      <button type="button" disabled={saving || confirming} aria-expanded={editing === item.id} aria-label={`Adjust return for ${label}, ${count} of ${item.quantity} returned`}
                        className={classNames(countButtonClass, "bg-background")} onClick={() => setEditing(item.id)}>
                        {count}/{item.quantity}
                      </button>
                    )}
                  </div>
                  {entries.length ? <p className="text-xs text-muted">
                    {entries.map(([day, quantity]) => `${quantity} returned ${formatDate(day)}`).join(" · ")}
                  </p> : null}
                  {!batch.closed_at && editing === item.id ? (
                    <form onSubmit={(event) => submitCount(event, item)}>
                      <fieldset disabled={saving} className="min-w-0 space-y-3">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Field label="Total returned">
                            <input type="number" inputMode="numeric" min={0} max={item.quantity} required name="count" defaultValue={count} className={inputClassName} />
                          </Field>
                          <Field label="Date for any newly returned items">
                            <input type="date" name="returned_on" min={batch.sent_on} max={today} defaultValue={today} required className={inputClassName} />
                          </Field>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button className={buttonClassName}>{saving ? "Saving…" : "Save count"}</button>
                          <button type="button" onClick={() => setEditing(null)} className={secondaryButtonClassName}>Cancel</button>
                        </div>
                      </fieldset>
                    </form>
                  ) : null}
                </Card>
              );
            })}
          </section>

          {saveError ? <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-bold text-danger">{saveError}</p> : null}
          {batch.closed_at ? (
            <Card className="space-y-1">
              <h2 className="font-black">{batch.discrepancy_note ? "Discrepancy note" : "Batch complete"}</h2>
              {batch.discrepancy_note ? <p className="whitespace-pre-wrap break-words text-sm text-muted">{batch.discrepancy_note}</p> : null}
            </Card>
          ) : confirming ? (
            <Card>
              <form onSubmit={(event) => submitDiscrepancy(event, totals.missing)}>
                <fieldset disabled={saving} className="min-w-0 space-y-3">
                  <h2 className="font-black">Close with {totals.missing} missing</h2>
                  <Field label="Discrepancy note">
                    <textarea name="note" rows={3} required maxLength={1000} className={inputClassName} />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <button className={buttonClassName}>{saving ? "Closing…" : "Close batch"}</button>
                    <button type="button" onClick={() => setConfirming(false)} className={secondaryButtonClassName}>Keep open</button>
                  </div>
                </fieldset>
              </form>
            </Card>
          ) : (
            <button type="button" disabled={saving || editing !== null}
              className={classNames(totals.missing ? secondaryButtonClassName : buttonClassName, "w-full disabled:opacity-55")}
              onClick={() => {
                if (totals.missing) setConfirming(true);
                else void closeBatch(0);
              }}>{totals.missing ? "Close with missing items" : "Complete batch"}</button>
          )}
        </div>
      )}
    </div>
  );
}

export default function LaundryBatchPage() {
  const { id } = useParams<{ id: string }>();
  return <ProtectedPage>{({ context }) => (
    <Suspense fallback={<LaundryLoading />}>
      <BatchContent key={`${context.householdId}:${id}`} householdId={context.householdId} batchId={id} />
    </Suspense>
  )}</ProtectedPage>;
}
