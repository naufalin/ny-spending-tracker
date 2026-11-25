"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, EmptyState, secondaryButtonClassName } from "@/components/app-shell";
import { loadLaundryBatches, loadLaundryOwners, type LaundryBatch, type LaundryOwner } from "@/lib/laundry";
import { getSupabaseClient } from "@/lib/supabase/client";

export function useLaundryData(householdId: string, batchId?: string, ownerViewerId?: string) {
  const [batches, setBatches] = useState<LaundryBatch[] | null>(null);
  const [owners, setOwners] = useState<LaundryOwner[]>([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();

    void Promise.all([
      loadLaundryBatches(supabase, householdId, batchId),
      ownerViewerId ? loadLaundryOwners(supabase, householdId, ownerViewerId) : [],
    ]).then(([nextBatches, nextOwners]) => {
      if (!active) return;
      setBatches(nextBatches);
      setOwners(nextOwners);
      setError("");
    }).catch((reason: unknown) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : "Could not load laundry.");
    });

    return () => { active = false; };
  }, [householdId, batchId, ownerViewerId, revision]);

  return { batches, setBatches, owners, error, reload: () => setRevision((value) => value + 1) };
}

export function LaundryLoadError({ error, reload }: { error: string; reload: () => void }) {
  return <EmptyState title="Could not load laundry" body={error} action={
    <button type="button" onClick={reload} className={secondaryButtonClassName}>Try again</button>
  } />;
}

export function LaundryLoading() {
  return <Card><p role="status" className="text-sm font-bold text-muted">Loading laundry…</p></Card>;
}

export function LaundryBack({ href = "/laundry", children = "Laundry" }: { href?: string; children?: string }) {
  return <Link href={href} className="mb-1 inline-flex min-h-11 items-center gap-1 rounded-lg text-sm font-black text-foreground hover:text-primary-dark focus-visible:ring-4 focus-visible:ring-accent">
    <span aria-hidden="true">‹</span> {children}
  </Link>;
}

const tagTones = {
  pink: "bg-accent text-foreground",
  green: "bg-success-soft text-success",
  amber: "bg-warning-soft text-foreground",
};

export function LaundryTag({ children, tone = "pink" }: { children: React.ReactNode; tone?: keyof typeof tagTones }) {
  return <span className={`inline-block max-w-full break-words rounded-full px-2.5 py-1 text-xs font-black ${tagTones[tone]}`}>{children}</span>;
}
