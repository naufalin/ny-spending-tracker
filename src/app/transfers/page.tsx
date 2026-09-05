"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  ProtectedPage,
  buttonClassName,
  dangerButtonClassName,
  inputClassName,
  secondaryButtonClassName,
} from "@/components/app-shell";
import { Money } from "@/components/money";
import { RowMenu } from "@/components/row-menu";
import { ListSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { TransferForm } from "@/components/transfer-form";
import { deleteTransfer as removeTransfer, saveTransfer } from "@/lib/transfers";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDate, formatIdr } from "@/lib/utils";
import type { Category, Channel, Profile, Transfer } from "@/types/database";

function TransfersContent({ householdId, userId }: { householdId: string; userId: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const { addToast } = useToast();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingTransfer, setConfirmingTransfer] = useState<Transfer | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [destinationFilter, setDestinationFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");
  const [noteSearch, setNoteSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadTransfers() {
      setLoading(true);

      const [transferResult, categoryResult, channelResult] = await Promise.all([
        supabase
          .from("transfers")
          .select(
            "*, from_channel:channels!transfers_from_channel_id_fkey(id, name), to_channel:channels!transfers_to_channel_id_fkey(id, name), fee_category:categories(id, name, type)"
          )
          .eq("household_id", householdId)
          .order("transferred_at", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("categories")
          .select("*")
          .eq("household_id", householdId)
          .order("name"),
        supabase
          .from("channels")
          .select("*")
          .eq("household_id", householdId)
          .order("name"),
      ]);

      if (!isMounted) {
        return;
      }

      if (transferResult.error) {
        addToast({ title: "Couldn't load transfers", body: transferResult.error.message, tone: "danger" });
        setLoading(false);
        return;
      }

      const nextTransfers = (transferResult.data || []) as Transfer[];
      const userIds = Array.from(
        new Set(
          nextTransfers
            .map((transfer) => transfer.user_id)
            .filter((id): id is string => Boolean(id))
        )
      );
      const { data: profileData } = userIds.length
        ? await supabase.from("profiles").select("*").in("id", userIds)
        : { data: [] };

      if (!isMounted) {
        return;
      }

      setTransfers(nextTransfers);
      setCategories((categoryResult.data || []) as Category[]);
      setChannels((channelResult.data || []) as Channel[]);
      setProfiles(
        ((profileData || []) as Profile[]).reduce<Record<string, Profile>>((acc, profile) => {
          acc[profile.id] = profile;
          return acc;
        }, {})
      );
      setLoading(false);
    }

    loadTransfers();

    return () => {
      isMounted = false;
    };
  }, [addToast, householdId, refreshKey, supabase]);

  const filteredTransfers = transfers.filter((transfer) => {
    if (fromDate && transfer.transferred_at < fromDate) {
      return false;
    }

    if (toDate && transfer.transferred_at > toDate) {
      return false;
    }

    if (sourceFilter !== "all" && transfer.from_channel_id !== sourceFilter) {
      return false;
    }

    if (destinationFilter !== "all" && transfer.to_channel_id !== destinationFilter) {
      return false;
    }

    if (personFilter !== "all" && transfer.user_id !== personFilter) {
      return false;
    }

    if (
      noteSearch.trim() &&
      !(transfer.note || "").toLowerCase().includes(noteSearch.trim().toLowerCase())
    ) {
      return false;
    }

    return true;
  });

  const people = Array.from(
    new Set(transfers.map((transfer) => transfer.user_id).filter((id): id is string => Boolean(id)))
  );
  const totalAmount = filteredTransfers.reduce((sum, transfer) => sum + transfer.amount, 0);
  const totalFees = filteredTransfers.reduce((sum, transfer) => sum + transfer.fee_amount, 0);

  function getCreatorLabel(transfer: Transfer) {
    if (!transfer.user_id) {
      return "Added by someone";
    }

    if (transfer.user_id === userId) {
      return "Added by you";
    }

    return `Added by ${profiles[transfer.user_id]?.display_name || "household member"}`;
  }

  function getCreatorShortLabel(transfer: Transfer) {
    if (!transfer.user_id) {
      return "Someone";
    }

    if (transfer.user_id === userId) {
      return "You";
    }

    return profiles[transfer.user_id]?.display_name || "Member";
  }

  async function confirmDelete() {
    if (!confirmingTransfer) {
      return;
    }

    const transfer = confirmingTransfer;
    setDeletingId(transfer.id);

    const error = await removeTransfer(supabase, householdId, transfer.id);

    setDeletingId(null);

    if (error) {
      addToast({ title: "Couldn't delete transfer", body: error, tone: "danger" });
      return;
    }

    setTransfers((current) => current.filter((item) => item.id !== transfer.id));
    setConfirmingTransfer(null);
    addToast({ title: "Transfer deleted", tone: "success" });
  }

  function clearFilters() {
    setFromDate("");
    setToDate("");
    setSourceFilter("all");
    setDestinationFilter("all");
    setPersonFilter("all");
    setNoteSearch("");
  }

  const activeFilterChips: Array<{
    key: string;
    label: string;
    onRemove: () => void;
  }> = [];

  if (fromDate) {
    activeFilterChips.push({
      key: "from",
      label: `From: ${formatDate(fromDate)}`,
      onRemove: () => setFromDate(""),
    });
  }

  if (toDate) {
    activeFilterChips.push({
      key: "to",
      label: `To: ${formatDate(toDate)}`,
      onRemove: () => setToDate(""),
    });
  }

  if (sourceFilter !== "all") {
    activeFilterChips.push({
      key: "source",
      label: `From wallet: ${channels.find((channel) => channel.id === sourceFilter)?.name || "Selected"}`,
      onRemove: () => setSourceFilter("all"),
    });
  }

  if (destinationFilter !== "all") {
    activeFilterChips.push({
      key: "destination",
      label: `To wallet: ${channels.find((channel) => channel.id === destinationFilter)?.name || "Selected"}`,
      onRemove: () => setDestinationFilter("all"),
    });
  }

  if (personFilter !== "all") {
    activeFilterChips.push({
      key: "person",
      label: `Person: ${personFilter === userId ? "You" : profiles[personFilter]?.display_name || "Member"}`,
      onRemove: () => setPersonFilter("all"),
    });
  }

  if (noteSearch.trim()) {
    activeFilterChips.push({
      key: "note",
      label: `Note: ${noteSearch.trim()}`,
      onRemove: () => setNoteSearch(""),
    });
  }

  const activeFilterCount = activeFilterChips.length;

  return (
    <>
      <PageHeader
        eyebrow="Money moves"
        title="Transfers"
        action={
          <Link href="/transfers/new" className={`${buttonClassName} w-full sm:w-auto`}>
            Move money
          </Link>
        }
      />

      {loading ? (
        <ListSkeleton />
      ) : transfers.length === 0 ? (
        <EmptyState
          title="No transfers yet"
          body="Move money between two wallets and the full history will grow here."
        />
      ) : (
        <div className="space-y-3">
          <Card>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-foreground">Find a move</p>
                <p className="mt-1 text-xs leading-5 text-muted">Filter wallet-to-wallet activity by date, person, or note.</p>
              </div>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-secondary/20 px-3 py-1 text-xs font-black text-foreground">
                {filteredTransfers.length} shown
              </span>
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
              aria-expanded={filtersOpen}
              aria-controls="transfer-filters"
              className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm font-black text-muted transition hover:border-primary-dark hover:text-primary-dark md:hidden"
            >
              <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</span>
              <span aria-hidden="true">{filtersOpen ? "Hide" : "Show"}</span>
            </button>
            <div
              id="transfer-filters"
              className={
                filtersOpen
                  ? "mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
                  : "mt-3 hidden grid-cols-1 gap-3 sm:grid-cols-2 md:grid"
              }
            >
              <Field label="From date">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className={inputClassName}
                />
              </Field>
              <Field label="To date">
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className={inputClassName}
                />
              </Field>
              <Field label="Source wallet">
                <select
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value)}
                  className={inputClassName}
                >
                  <option value="all">All</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Destination wallet">
                <select
                  value={destinationFilter}
                  onChange={(event) => setDestinationFilter(event.target.value)}
                  className={inputClassName}
                >
                  <option value="all">All</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Person">
                <select
                  value={personFilter}
                  onChange={(event) => setPersonFilter(event.target.value)}
                  className={inputClassName}
                >
                  <option value="all">All</option>
                  {people.map((personId) => (
                    <option key={personId} value={personId}>
                      {personId === userId ? "You" : profiles[personId]?.display_name || "Household member"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Note search">
                <input
                  type="search"
                  value={noteSearch}
                  onChange={(event) => setNoteSearch(event.target.value)}
                  className={inputClassName}
                  placeholder="ATM, savings, rent..."
                />
              </Field>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-12 w-full rounded-2xl border border-border px-4 py-3 text-sm font-black text-muted transition hover:border-primary-dark hover:text-primary-dark"
                >
                  Clear filters
                </button>
              </div>
            </div>
            {activeFilterChips.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Active filters">
                {activeFilterChips.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={filter.onRemove}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full bg-accent px-3 py-2 text-xs font-black text-primary-dark transition hover:bg-primary hover:text-foreground"
                    aria-label={`Remove ${filter.label} filter`}
                  >
                    {filter.label}
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            ) : null}
          </Card>

          <Card>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-2xl bg-background p-3">
                <p className="text-xs font-bold text-muted">Transfers</p>
                <p className="mt-1 text-lg font-black text-foreground">{filteredTransfers.length}</p>
              </div>
              <div className="rounded-2xl bg-background p-3">
                <p className="text-xs font-bold text-muted">Moved</p>
                <Money amount={totalAmount} className="mt-1 block text-sm font-black" />
              </div>
              <div className="rounded-2xl bg-background p-3">
                <p className="text-xs font-bold text-muted">Fees</p>
                <Money amount={totalFees} tone="expense" className="mt-1 block text-sm font-black" />
              </div>
            </div>
          </Card>

          {filteredTransfers.length === 0 ? (
            <EmptyState title="Nothing matches" body="Try relaxing the filters a little." />
          ) : null}

          {filteredTransfers.map((transfer) => (
            <Card key={transfer.id} className="p-4">
              <div className="md:flex md:items-center md:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-block max-w-full break-words rounded-full bg-accent px-3 py-1 text-sm font-black text-primary-dark">
                      {transfer.from_channel?.name || "Source"} → {transfer.to_channel?.name || "Destination"}
                    </span>
                    <span className="rounded-full bg-background px-3 py-1 text-xs font-black text-muted">
                      {getCreatorShortLabel(transfer)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {formatDate(transfer.transferred_at)} · {getCreatorLabel(transfer)}
                  </p>
                  {transfer.note ? (
                    <p className="mt-2 text-sm leading-6 text-muted">{transfer.note}</p>
                  ) : null}
                  {transfer.fee_amount > 0 ? (
                    <p className="mt-2 text-xs font-bold text-primary-dark">
                      Fee: {formatIdr(transfer.fee_amount)}
                      {transfer.fee_category?.name ? ` · ${transfer.fee_category.name}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 md:mt-0 md:justify-end">
                  <Money amount={transfer.amount} className="text-lg font-black" />
                  <RowMenu
                    label={`Actions for this transfer`}
                    items={[
                      { label: "Edit", onSelect: () => setEditingTransfer(transfer) },
                      {
                        label: deletingId === transfer.id ? "Deleting..." : "Delete",
                        danger: true,
                        onSelect: () => {
                          if (deletingId !== transfer.id) {
                            setConfirmingTransfer(transfer);
                          }
                        },
                      },
                    ]}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={editingTransfer !== null}
        onClose={() => setEditingTransfer(null)}
        title="Edit transfer"
      >
        {editingTransfer ? (
          <TransferForm
            key={editingTransfer.id}
            categories={categories}
            channels={channels}
            transfer={editingTransfer}
            submitLabel="Save changes"
            successMessage="Transfer updated."
            onSuccess={() => setTimeout(() => setEditingTransfer(null), 700)}
            onSubmit={async (values) => {
              const error = await saveTransfer({
                supabase,
                householdId,
                userId,
                transferId: editingTransfer.id,
                values,
              });

              if (!error) {
                setRefreshKey((current) => current + 1);
                addToast({ title: "Transfer updated", tone: "success" });
              }

              return error;
            }}
          />
        ) : null}
      </Modal>

      <Modal
        open={confirmingTransfer !== null}
        onClose={() => {
          if (!deletingId) {
            setConfirmingTransfer(null);
          }
        }}
        title="Delete transfer?"
      >
        {confirmingTransfer ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-muted">
              This removes the wallet move. Any linked fee expense will be removed too.
            </p>
            <div className="rounded-2xl bg-background px-4 py-3">
              <p className="text-sm font-black text-foreground">
                {confirmingTransfer.from_channel?.name || "Source"} → {confirmingTransfer.to_channel?.name || "Destination"}
              </p>
              <Money amount={confirmingTransfer.amount} className="mt-1 block text-sm font-black" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmingTransfer(null)}
                disabled={deletingId !== null}
                className={secondaryButtonClassName}
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deletingId !== null}
                className={dangerButtonClassName}
              >
                {deletingId ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

export default function TransfersPage() {
  return (
    <ProtectedPage>
      {({ context }) => <TransfersContent householdId={context.householdId} userId={context.user.id} />}
    </ProtectedPage>
  );
}
