"use client";

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
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Channel } from "@/types/database";

function ChannelsContent({ householdId }: { householdId: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadChannels() {
      const { data } = await supabase
        .from("channels")
        .select("*")
        .eq("household_id", householdId)
        .order("name");

      if (isMounted) {
        setChannels((data || []) as Channel[]);
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
      <PageHeader eyebrow="Spending channels" title="Wallets" />

      <div className="space-y-4">
        <Card>
          <form onSubmit={createChannel} className="space-y-4">
            <Field label="Channel name">
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
              {saving ? "Saving..." : "Create channel"}
            </button>
          </form>
        </Card>

        {channels.length === 0 ? (
          <EmptyState
            title="No channels yet"
            body="Add Tunai, Rekening BCA, Rekening Jago, or any wallet you use."
          />
        ) : (
          <div className="space-y-3">
            {channels.map((channel) => (
              <Card key={channel.id}>
                {editingId === channel.id ? (
                  <form onSubmit={(event) => updateChannel(event, channel.id)} className="space-y-3">
                    <Field label="Channel name">
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
