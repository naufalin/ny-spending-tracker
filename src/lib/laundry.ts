import type { SupabaseClient } from "@supabase/supabase-js";

export type LaundryOwner = { key: string; label: string };
export type LaundryReturns = Record<string, number>;

export type LaundryItem = {
  id: string;
  position: number;
  name: string;
  owner_key: string | null;
  owner_label: string | null;
  quantity: number;
  returns: LaundryReturns;
};

export type LaundryBatch = {
  id: string;
  sent_on: string;
  closed_at: string | null;
  discrepancy_note: string | null;
  items: LaundryItem[];
};

export const sharedLaundryOwner: LaundryOwner = { key: "shared", label: "Shared" };

export function laundryToday() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts();
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  return [part("year"), part("month"), part("day")].join("-");
}

export function returnedQuantity(item: LaundryItem) {
  return Object.values(item.returns).reduce((total, quantity) => total + quantity, 0);
}

export function batchTotals(batch: LaundryBatch) {
  const sent = batch.items.reduce((total, item) => total + item.quantity, 0);
  const returned = batch.items.reduce((total, item) => total + returnedQuantity(item), 0);
  return { sent, returned, missing: sent - returned };
}

export function returnEntries(item: LaundryItem) {
  return Object.entries(item.returns).sort(([a], [b]) => b.localeCompare(a));
}

const batchColumns = "id, sent_on, closed_at, discrepancy_note, items:laundry_items(id, position, name, owner_key, owner_label, quantity, returns)";

export async function loadLaundryBatches(
  supabase: SupabaseClient,
  householdId: string,
  batchId?: string
): Promise<LaundryBatch[]> {
  const query = () => supabase.from("laundry_batches").select(batchColumns)
    .eq("household_id", householdId)
    .order("sent_on", { ascending: false })
    .order("id", { ascending: false })
    .order("position", { referencedTable: "items" });

  if (batchId) {
    const { data, error } = await query().eq("id", batchId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? [data as LaundryBatch] : [];
  }

  const batches: LaundryBatch[] = [];
  const pageSize = 50;
  for (;;) {
    const cursor = batches.at(-1);
    const page = query().limit(pageSize);
    if (cursor) {
      page.or(`sent_on.lt.${cursor.sent_on},and(sent_on.eq.${cursor.sent_on},id.lt.${cursor.id})`);
    }
    const { data, error } = await page;
    if (error) throw new Error(error.message);
    batches.push(...data as LaundryBatch[]);
    if (data.length < pageSize) return batches;
  }
}

export async function loadLaundryOwners(supabase: SupabaseClient, householdId: string, userId: string) {
  const { data, error } = await supabase.rpc("laundry_owners", { p_household_id: householdId });
  if (error) throw new Error(error.message);

  return [
    ...(data as LaundryOwner[]).map((owner) => ({
      ...owner,
      label: owner.key === userId ? "Me" : owner.label,
    })),
    sharedLaundryOwner,
  ];
}
