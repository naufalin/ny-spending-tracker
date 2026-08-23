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

function ChannelsContent({ householdId }: { householdId: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [channelBalances, setChannelBalances] = useState<Record<string, number>>({});
  const [latestActivity, setLatestActivity] = useState<Record<string, WalletActivity>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadChannels() {
      setLoading(true);
      setLoadError("");

      try {
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

        const [channelResult, balanceTransactions, nextTransfers] = await Promise.all([
          supabase
            .from("channels")
            .select("*")
            .eq("household_id", householdId)
            .order("name"),
          loadBalanceTransactions(),
          loadTransfers(),
        ]);

        if (channelResult.error) {
          throw channelResult.error;
        }

        if (!isMounted) {
          return;
        }

        const nextChannels = (channelResult.data || []) as Channel[];
        const nextActivity: Record<string, WalletActivity> = {};

        function recordActivity(channelId: string | null, activity: WalletActivity) {
          if (!channelId || (nextActivity[channelId]?.date || "") > activity.date) {
            return;
          }

          nextActivity[channelId] = activity;
        }

        for (const transaction of balanceTransactions) {
          recordActivity(transaction.channel_id, {
            amount: transaction.type === "income" ? transaction.amount : -transaction.amount,
            date: transaction.spent_at,
            label: transaction.type === "income" ? "Income" : "Spending",
          });
        }

        for (const transfer of nextTransfers) {
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

        setChannels(nextChannels);
        setTransfers(nextTransfers.slice(0, 5));
        setChannelBalances(calculateChannelBalances(nextChannels, balanceTransactions, nextTransfers));
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
    setMessage("");

    const { error } = await supabase.from("channels").insert({
      household_id: householdId,
      name: name.trim(),
    });

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setName("");
    setShowCreateForm(false);
    setRefreshKey((current) => current + 1);
  }

  async function updateChannel(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setMessage("");

    const { error } = await supabase
      .from("channels")
      .update({ name: editingName.trim() })
      .eq("id", id)
      .eq("household_id", householdId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setEditingId(null);
    setEditingName("");
    setRefreshKey((current) => current + 1);
  }

  async function deleteChannel(id: string) {
    const shouldDelete = window.confirm(
      "Delete this channel? Transactions that use it must be edited first."
    );

    if (!shouldDelete) {
      return;
    }

    setMessage("");

    const { error } = await supabase
      .from("channels")
      .delete()
      .eq("id", id)
      .eq("household_id", householdId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setRefreshKey((current) => current + 1);
  }

  return (
    <>
      <PageHeader
        eyebrow="Money paths"
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
        {message ? (
          <p aria-live="polite" className="rounded-2xl bg-accent/50 px-4 py-3 text-sm font-bold text-primary-dark">
            {message}
          </p>
        ) : null}

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
          <EmptyState title="Opening wallets" body="Counting what is available in every money path." />
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
            <Card className="bg-[linear-gradient(145deg,#FFFFFF,#F2FAF3)]">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-muted">Total balance</p>
                  <p className="mt-1 text-3xl font-black text-foreground">
                    {formatIdr(Object.values(channelBalances).reduce((sum, balance) => sum + balance, 0))}
                  </p>
                </div>
                <p className="rounded-full bg-secondary/15 px-3 py-1 text-xs font-black text-secondary">
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
                          <p className="mt-1 text-xl font-black text-secondary">
                            {formatIdr(channelBalances[channel.id] || 0)}
                          </p>
                          {latestActivity[channel.id] ? (
                            <p className="mt-2 text-xs font-bold text-muted">
                              {latestActivity[channel.id].label}: {latestActivity[channel.id].amount >= 0 ? "+" : "-"}
                              {formatIdr(Math.abs(latestActivity[channel.id].amount))} · {formatDate(latestActivity[channel.id].date)}
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
                          className="min-h-11 rounded-2xl bg-accent px-4 py-2 text-sm font-black text-primary-dark"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteChannel(channel.id)}
                          className="min-h-11 rounded-2xl border border-border px-4 py-2 text-sm font-black text-muted"
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
                    <p className="text-right font-black text-secondary">
                      {formatIdr(transfer.amount)}
                    </p>
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
