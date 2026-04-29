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
                <p className="font-black text-foreground">{channel.name}</p>
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
