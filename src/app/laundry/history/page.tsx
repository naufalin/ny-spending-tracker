"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Card, Field, PageHeader, ProtectedPage, inputClassName, secondaryButtonClassName } from "@/components/app-shell";
import { LaundryBack, LaundryLoadError, LaundryLoading, LaundryTag, useLaundryData } from "@/components/laundry";
import { returnEntries, returnedQuantity } from "@/lib/laundry";
import { formatDate } from "@/lib/utils";

function HistoryContent({ householdId }: { householdId: string }) {
  const params = useSearchParams();
  const [itemName, setItemName] = useState(params.get("q") ?? "");
  const [owner, setOwner] = useState(params.get("owner") ?? "");
  const [pastOnly, setPastOnly] = useState(params.get("batches") === "past");
  const { batches, error, reload } = useLaundryData(householdId);
  const query = itemName.trim().toLowerCase();
  const owners = new Map<string, string>();
  const rows = (batches ?? []).flatMap((batch) => batch.items.map((item) => ({ batch, item })));
  for (const { item } of rows) {
    if (item.owner_key && item.owner_label && !owners.has(item.owner_key)) {
      owners.set(item.owner_key, item.owner_label);
    }
  }

  const matches = rows.filter(({ batch, item }) =>
    (!pastOnly || batch.closed_at) &&
    (!query || item.name.toLowerCase().includes(query)) &&
    (!owner || owner === (item.owner_key ?? "untagged"))
  );
  const matchedItems = new Set(matches.map(({ item }) => JSON.stringify([item.name.toLowerCase(), item.owner_key])));
  let latest = "";
  for (const { item } of matches) {
    for (const date of Object.keys(item.returns)) {
      if (date > latest) latest = date;
    }
  }

  const returnParams = new URLSearchParams({ from: "history" });
  if (itemName) returnParams.set("q", itemName);
  if (owner) returnParams.set("owner", owner);
  if (pastOnly) returnParams.set("batches", "past");

  return (
    <div className="max-w-2xl">
      <LaundryBack />
      <PageHeader title="Item history" />
      {error ? <LaundryLoadError error={error} reload={reload} /> : !batches ? <LaundryLoading /> : (
        <div className="space-y-4">
          <Card className="space-y-3">
            <Field label="Item name">
              <input type="search" value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Search items" maxLength={120} className={inputClassName} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Owner">
                <select value={owner} onChange={(event) => setOwner(event.target.value)} className={inputClassName}>
                  <option value="">All owners</option>
                  <option value="untagged">No owner</option>
                  {[...owners].map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </Field>
              <Field label="Batches">
                <select value={pastOnly ? "past" : "all"} onChange={(event) => setPastOnly(event.target.value === "past")} className={inputClassName}>
                  <option value="all">All batches</option>
                  <option value="past">Past batches</option>
                </select>
              </Field>
            </div>
            {itemName || owner || pastOnly ? (
              <button type="button" className={secondaryButtonClassName} onClick={() => {
                setItemName("");
                setOwner("");
                setPastOnly(false);
              }}>Clear filters</button>
            ) : null}
          </Card>
          <div className="space-y-2">
            <p role="status" className="text-sm font-bold text-muted">{matches.length} item {matches.length === 1 ? "entry" : "entries"}</p>
            {query && matches.length ? (
              <div className="rounded-2xl bg-success-soft p-4">
                <p className="text-sm font-bold">{matchedItems.size > 1 ? "Latest return across matches" : "Last confirmed return"}</p>
                <p className="text-xl font-black">{latest ? formatDate(latest) : "No confirmed return"}</p>
              </div>
            ) : null}
            {matches.length ? matches.map(({ batch, item }) => {
              const entries = returnEntries(item);
              const remaining = item.quantity - returnedQuantity(item);

              return (
                <Link key={item.id} href={`/laundry/${batch.id}?${returnParams}`} className="block space-y-1 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary focus-visible:ring-4 focus-visible:ring-accent">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words font-black">{item.name}</span>
                    {item.owner_label ? <LaundryTag tone={item.owner_key === "shared" ? "green" : "pink"}>{item.owner_label}</LaundryTag> : null}
                  </div>
                  <p className="text-sm text-muted">Sent {formatDate(batch.sent_on)} · {item.quantity} {item.quantity === 1 ? "item" : "items"}</p>
                  <p className="text-sm text-muted">
                    {entries.length ? entries.map(([day, quantity]) => `${quantity} returned ${formatDate(day)}`).join(" · ") : "No return recorded"}
                    {remaining ? ` · ${remaining} ${batch.closed_at ? "missing" : "outstanding"}` : ""}
                  </p>
                </Link>
              );
            }) : <Card><p className="text-sm text-muted">
              {query || owner || pastOnly ? "No logged items match these filters." : "Items will appear here after you log a batch."}
            </p></Card>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LaundryHistoryPage() {
  return <ProtectedPage>{({ context }) => (
    <Suspense fallback={<LaundryLoading />}>
      <HistoryContent key={context.householdId} householdId={context.householdId} />
    </Suspense>
  )}</ProtectedPage>;
}
