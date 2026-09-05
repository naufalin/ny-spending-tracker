"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Card,
  EmptyState,
  Field,
  PageHeader,
  ProtectedPage,
  buttonClassName,
  inputClassName,
} from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Money } from "@/components/money";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { calculateChannelBalances } from "@/lib/transfers";
import { formatDate, formatIdr } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Channel, Transaction, Transfer } from "@/types/database";

type WalletActivity = {
  amount: number;
  date: string;
  label: string;
};

const BALANCE_PAGE_SIZE = 1_000;

type WalletBalanceRow = {
  channel_id: string;
  balance: number;
  latest_date: string | null;
  latest_amount: number | null;
  latest_kind: "income" | "expense" | "transfer_in" | "transfer_out" | null;
};

const activityLabels: Record<NonNullable<WalletBalanceRow["latest_kind"]>, string> = {
  income: "Income",
  expense: "Spending",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
};

function ChannelsContent({ householdId }: { householdId: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const { addToast } = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [channelBalances, setChannelBalances] = useState<Record<string, number>>({});
  const [latestActivity, setLatestActivity] = useState<Record<string, WalletActivity>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [deletingChannel, setDeletingChannel] = useState<Channel | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadChannels() {
      setLoading(true);
      setLoadError("");

      try {
        async function tryBalanceRpc() {
          const { data, error } = await supabase
            .rpc("wallet_balances", { p_household_id: householdId });

          if (error) {
            return null;
          }

          return (data || []) as WalletBalanceRow[];
        }

        async function loadBalanceTransactions() {
          const rows: Pick<Transaction, "channel_id" | "type" | "amount" | "spent_at">[] = [];

          for (let from = 0; ; from += BALANCE_PAGE_SIZE) {
            const { data, error } = await supabase
              .from("transactions")
              .select("channel_id, type, amount, spent_at")
              .eq("household_id", householdId)
              .range(from, from + BALANCE_PAGE_SIZE - 1);

            if (error) {
              throw error;
            }

            const page = (data || []) as Pick<
              Transaction,
              "channel_id" | "type" | "amount" | "spent_at"
            >[];
            rows.push(...page);

            if (page.length < BALANCE_PAGE_SIZE) {
              return rows;
            }
          }
        }

        async function loadTransfers() {
          const rows: Transfer[] = [];

          for (let from = 0; ; from += BALANCE_PAGE_SIZE) {
            const { data, error } = await supabase
              .from("transfers")
              .select(
                "*, from_channel:channels!transfers_from_channel_id_fkey(id, name), to_channel:channels!transfers_to_channel_id_fkey(id, name)"
              )
              .eq("household_id", householdId)
              .order("transferred_at", { ascending: false })
              .order("created_at", { ascending: false })
              .range(from, from + BALANCE_PAGE_SIZE - 1);

            if (error) {
              throw error;
            }

            const page = (data || []) as Transfer[];
            rows.push(...page);

            if (page.length < BALANCE_PAGE_SIZE) {
              return rows;
            }
          }
        }

        const [channelResult, rpcRows, recentTransfersResult] = await Promise.all([
          supabase
            .from("channels")
            .select("*")
            .eq("household_id", householdId)
            .order("name"),
          tryBalanceRpc(),
          supabase
            .from("transfers")
            .select(
              "*, from_channel:channels!transfers_from_channel_id_fkey(id, name), to_channel:channels!transfers_to_channel_id_fkey(id, name)"
            )
            .eq("household_id", householdId)
            .order("transferred_at", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        if (channelResult.error) {
          throw channelResult.error;
        }

        if (!isMounted) {
          return;
        }

        const nextChannels = (channelResult.data || []) as Channel[];
        let nextBalances: Record<string, number>;
        const nextActivity: Record<string, WalletActivity> = {};
        let nextTransfers: Transfer[];

        if (rpcRows) {
          // Fast path: one aggregate query for balances and latest activity.
          nextBalances = {};
          for (const row of rpcRows) {
            nextBalances[row.channel_id] = row.balance;
            if (row.latest_date && row.latest_kind) {
              nextActivity[row.channel_id] = {
                amount: row.latest_amount || 0,
                date: row.latest_date,
                label: activityLabels[row.latest_kind],
              };
            }
          }
          nextTransfers = (recentTransfersResult.data || []) as Transfer[];
        } else {
          // Fallback when the wallet_balances RPC has not been installed yet.
          const [balanceTransactions, allTransfers] = await Promise.all([
            loadBalanceTransactions(),
            loadTransfers(),
          ]);

          if (!isMounted) {
            return;
          }

          nextTransfers = allTransfers;
          nextBalances = calculateChannelBalances(nextChannels, balanceTransactions, allTransfers);

          for (const transaction of balanceTransactions) {
            recordActivity(transaction.channel_id, {
              amount: transaction.type === "income" ? transaction.amount : -transaction.amount,
              date: transaction.spent_at,
              label: transaction.type === "income" ? "Income" : "Spending",
            });
          }

          for (const transfer of allTransfers) {
            recordActivity(transfer.from_channel_id, {
              amount: -transfer.amount,
              date: transfer.transferred_at,
              label: "Transfer out",
            });
            recordActivity(transfer.to_channel_id, {
              amount: transfer.amount,
              date: transfer.transferred_at,
              label: "Transfer in",
            });
          }
        }

        function recordActivity(channelId: string | null, activity: WalletActivity) {
          if (!channelId || (nextActivity[channelId]?.date || "") > activity.date) {
            return;
          }

          nextActivity[channelId] = activity;
        }

        setChannels(nextChannels);
        setTransfers(nextTransfers.slice(0, 5));
        setChannelBalances(nextBalances);
        setLatestActivity(nextActivity);
        setLoading(false);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : "Could not load wallet balances.");
        setLoading(false);
      }
    }

    loadChannels();

    return () => {
      isMounted = false;
    };
  }, [householdId, refreshKey, supabase]);

  async function createChannel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const { error } = await supabase.from("channels").insert({
      household_id: householdId,
      name: name.trim(),
    });

    setSaving(false);

    if (error) {
      addToast({ title: "Couldn't create wallet", body: error.message, tone: "danger" });
      return;
    }

    setName("");
    setShowCreateForm(false);
    addToast({ title: `${name.trim()} wallet created`, tone: "success" });
    setRefreshKey((current) => current + 1);
  }

  async function updateChannel(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();

    const { error } = await supabase
      .from("channels")
      .update({ name: editingName.trim() })
      .eq("id", id)
      .eq("household_id", householdId);

    if (error) {
      addToast({ title: "Couldn't rename wallet", body: error.message, tone: "danger" });
      return;
    }

    setEditingId(null);
    setEditingName("");
    addToast({ title: "Wallet renamed", tone: "success" });
    setRefreshKey((current) => current + 1);
  }

  async function handleDeleteChannelConfirm() {
    if (!deletingChannel) {
      return;
    }

    setDeleteBusy(true);

    const { error } = await supabase
      .from("channels")
      .delete()
      .eq("id", deletingChannel.id)
      .eq("household_id", householdId);

    setDeleteBusy(false);

    if (error) {
      addToast({ title: "Couldn't delete wallet", body: error.message, tone: "danger" });
      return;
    }

    setDeletingChannel(null);
    addToast({ title: "Wallet deleted", tone: "success" });
    setRefreshKey((current) => current + 1);
  }

  return (
    <>
      <PageHeader
        eyebrow="Money pots"
        title="Wallets"
        action={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button
              type="button"
              onClick={() => setShowCreateForm((current) => !current)}
              className="min-h-12 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-black text-muted"
            >
              {showCreateForm ? "Close" : "Add wallet"}
            </button>
            <Link href="/transfers/new" className={`${buttonClassName} w-full sm:w-auto`}>
              Move money
            </Link>
          </div>
        }
      />

      <div className="space-y-4">
        {showCreateForm ? (
          <Card>
            <form onSubmit={createChannel} className="space-y-4">
              <Field label="Wallet name">
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={inputClassName}
                  placeholder="Tunai, BCA, Jago"
                />
              </Field>

              <button disabled={saving} className={`${buttonClassName} w-full`}>
                {saving ? "Saving..." : "Create wallet"}
              </button>
            </form>
          </Card>
        ) : null}

        {loading ? (
          <div className="space-y-4" aria-hidden="true">
            <Card>
              <Skeleton className="h-9 w-52 rounded-xl" />
            </Card>
            <div className="grid gap-3 sm:grid-cols-2">
              <Card>
                <Skeleton className="h-5 w-32 rounded-lg" />
                <Skeleton className="mt-2 h-7 w-28 rounded-lg" />
                <Skeleton className="mt-2 h-4 w-40 rounded-lg" />
              </Card>
              <Card>
                <Skeleton className="h-5 w-28 rounded-lg" />
                <Skeleton className="mt-2 h-7 w-24 rounded-lg" />
                <Skeleton className="mt-2 h-4 w-36 rounded-lg" />
              </Card>
            </div>
          </div>
        ) : loadError ? (
          <Card>
            <h2 className="text-lg font-black text-foreground">Could not load wallet balances</h2>
            <p className="mt-2 break-words text-sm leading-6 text-muted">{loadError}</p>
            <button
              type="button"
              onClick={() => setRefreshKey((current) => current + 1)}
              className={`${buttonClassName} mt-4 w-full sm:w-auto`}
            >
              Try again
            </button>
          </Card>
        ) : channels.length === 0 ? (
          <EmptyState
            title="No wallets yet"
            body="Add Tunai, Rekening BCA, Rekening Jago, or any money path you use."
          />
        ) : (
          <>
            <Card className="bg-[linear-gradient(145deg,var(--card),var(--success-soft))]">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-muted">Total balance</p>
                  <Money
                    amount={Object.values(channelBalances).reduce((sum, balance) => sum + balance, 0)}
                    className="mt-1 block text-3xl font-black"
                  />
                </div>
                <p className="rounded-full bg-secondary/15 px-3 py-1 text-xs font-black text-success">
                  {channels.length} {channels.length === 1 ? "wallet" : "wallets"}
                </p>
              </div>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2">
              {channels.map((channel) => (
                <Card key={channel.id}>
                  {editingId === channel.id ? (
                    <form onSubmit={(event) => updateChannel(event, channel.id)} className="space-y-3">
                      <Field label="Wallet name">
                        <input
                          required
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          className={inputClassName}
                        />
                      </Field>
                      <div className="grid grid-cols-2 gap-2">
                        <button className={buttonClassName}>Save</button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="min-h-11 rounded-2xl border border-border px-4 py-2 text-sm font-black text-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words font-black text-foreground">{channel.name}</p>
                          <Money
                            amount={channelBalances[channel.id] || 0}
                            tone={(channelBalances[channel.id] || 0) < 0 ? "danger" : "neutral"}
                            className="mt-1 block text-xl font-black"
                          />
                          {latestActivity[channel.id] ? (
                            <p className="mt-2 text-xs font-bold text-muted">
                              {latestActivity[channel.id].label}:{" "}
                              <Money
                                amount={latestActivity[channel.id].amount}
                                tone={latestActivity[channel.id].amount >= 0 ? "income" : "expense"}
                                signed
                                className="text-xs font-bold"
                              />{" "}
                              · {formatDate(latestActivity[channel.id].date)}
                            </p>
                          ) : (
                            <p className="mt-2 text-xs font-bold text-muted">No activity yet</p>
                          )}
                        </div>
                        <span aria-hidden="true" className="rounded-2xl bg-secondary/10 p-2 text-secondary">
                          👛
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(channel.id);
                            setEditingName(channel.name);
                          }}
                          className="min-h-11 rounded-2xl bg-accent px-4 py-2 text-sm font-black text-primary-dark transition hover:bg-primary hover:text-foreground"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingChannel(channel)}
                          className="min-h-11 rounded-2xl border border-border px-4 py-2 text-sm font-black text-danger transition hover:border-danger hover:bg-danger-soft"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}

        {transfers.length ? (
          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-foreground">Recent transfers</h2>
              <div className="flex items-center gap-3">
                <Link href="/transfers" className="text-sm font-black text-primary-dark">
                  View all
                </Link>
                <Link href="/transfers/new" className="text-sm font-black text-primary-dark">
                  New
                </Link>
              </div>
            </div>
            <div className="space-y-3">
              {transfers.map((transfer) => (
                <div
                  key={transfer.id}
                  className="rounded-2xl bg-background px-4 py-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-foreground">
                        {transfer.from_channel?.name || "Source"} to{" "}
                        {transfer.to_channel?.name || "Destination"}
                      </p>
                      <p className="mt-1 text-xs font-bold text-muted">
                        {formatDate(transfer.transferred_at)}
                        {transfer.fee_amount > 0
                          ? ` - fee ${formatIdr(transfer.fee_amount)}`
                          : ""}
                      </p>
                    </div>
                    <Money amount={transfer.amount} className="text-right font-black" />
                  </div>
                  {transfer.note ? (
                    <p className="mt-2 text-sm leading-6 text-muted">{transfer.note}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>

      <ConfirmDialog
        open={deletingChannel !== null}
        onClose={() => {
          if (!deleteBusy) {
            setDeletingChannel(null);
          }
        }}
        onConfirm={handleDeleteChannelConfirm}
        busy={deleteBusy}
        title="Delete this wallet?"
        body={`${deletingChannel?.name || "This wallet"} will be removed. Transactions that use it must be edited first, so existing records keep their history.`}
        confirmLabel="Yes, delete wallet"
      />
    </>
  );
}

export default function ChannelsPage() {
  return (
    <ProtectedPage>
      {({ context }) => <ChannelsContent householdId={context.householdId} />}
    </ProtectedPage>
  );
}
