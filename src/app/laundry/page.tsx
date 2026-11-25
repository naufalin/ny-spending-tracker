"use client";

import Link from "next/link";
import { Card, PageHeader, ProtectedPage, buttonClassName, secondaryButtonClassName } from "@/components/app-shell";
import { LaundryLoadError, LaundryLoading, LaundryTag, useLaundryData } from "@/components/laundry";
import { batchTotals, type LaundryBatch } from "@/lib/laundry";
import { formatDate } from "@/lib/utils";

function BatchLink({ batch }: { batch: LaundryBatch }) {
  const { sent, returned, missing } = batchTotals(batch);
  const closed = Boolean(batch.closed_at);
  const status = closed ? (missing ? "Closed with missing items" : "Complete")
    : missing === 0 ? "Ready to close" : returned ? "Checking return" : "At the laundry";

  return (
    <Link href={`/laundry/${batch.id}`} className="block rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary focus-visible:ring-4 focus-visible:ring-accent">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-black">Sent {formatDate(batch.sent_on)}</span>
        <LaundryTag tone={missing ? "amber" : "green"}>{status}</LaundryTag>
      </div>
      <p className="mt-1 text-sm text-muted">
        {returned} of {sent} returned{missing ? ` · ${missing} ${closed ? "missing" : "outstanding"}` : ""}
      </p>
    </Link>
  );
}

function LaundryContent({ householdId }: { householdId: string }) {
  const { batches, error, reload } = useLaundryData(householdId);
  const open = batches?.filter((batch) => !batch.closed_at);
  const past = batches?.filter((batch) => batch.closed_at);

  return (
    <>
      <PageHeader title="Laundry" action={
        <div className="grid gap-2 sm:flex">
          <Link href="/laundry/new" className={buttonClassName}>+ New batch</Link>
          <Link href="/laundry/history" className={secondaryButtonClassName}>Browse item history</Link>
        </div>
      } />
      {error ? <LaundryLoadError error={error} reload={reload} /> : !open || !past ? <LaundryLoading /> : (
        <div className="grid gap-5 md:grid-cols-2">
          <section aria-labelledby="open-laundry" className="space-y-2">
            <h2 id="open-laundry" className="font-black">Open batches</h2>
            {open.length ? open.map((batch) => <BatchLink key={batch.id} batch={batch} />)
              : <Card><p className="text-sm text-muted">No open batches.</p></Card>}
          </section>
          <section aria-labelledby="past-laundry" className="space-y-2">
            <h2 id="past-laundry" className="font-black">Past batches</h2>
            {past.length ? past.map((batch) => <BatchLink key={batch.id} batch={batch} />)
              : <Card><p className="text-sm text-muted">Completed batches will appear here.</p></Card>}
          </section>
        </div>
      )}
    </>
  );
}

export default function LaundryPage() {
  return <ProtectedPage>{({ context }) => (
    <LaundryContent key={context.householdId} householdId={context.householdId} />
  )}</ProtectedPage>;
}
