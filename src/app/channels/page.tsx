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
import { formatDate, formatIdr } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Channel, Transfer } from "@/types/database";

function ChannelsContent({ householdId }: { householdId: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadChannels() {
      const [channelResult, transferResult] = await Promise.all([
        supabase
          .from("channels")
          .select("*")
          .eq("household_id", householdId)
          .order("name"),
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

      if (isMounted) {
        setChannels((channelResult.data || []) as Channel[]);
        setTransfers((transferResult.data || []) as Transfer[]);
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
          <Link href="/transfers/new" className={buttonClassName}>
            Transfer
          </Link>
        }
      />

      <div className="space-y-4">
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

            {message ? <p className="text-sm font-bold text-primary-dark">{message}</p> : null}

            <button disabled={saving} className={`${buttonClassName} w-full`}>
              {saving ? "Saving..." : "Create wallet"}
            </button>
          </form>
        </Card>

        {channels.length === 0 ? (
          <EmptyState
            title="No wallets yet"
            body="Add Tunai, Rekening BCA, Rekening Jago, or any money path you use."
          />
        ) : (
          <div className="space-y-3">
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
                        className="rounded-2xl border border-border px-4 py-2 text-sm font-black text-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-foreground">{channel.name}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(channel.id);
                          setEditingName(channel.name);
                        }}
                        className="rounded-2xl bg-accent px-4 py-2 text-sm font-black text-primary-dark"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteChannel(channel.id)}
                        className="rounded-2xl border border-border px-4 py-2 text-sm font-black text-muted"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {transfers.length ? (
          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-foreground">Recent transfers</h2>
              <Link href="/transfers/new" className="text-sm font-black text-primary-dark">
                New
              </Link>
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
