"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  Field,
  PageHeader,
  ProtectedPage,
  buttonClassName,
  inputClassName,
} from "@/components/app-shell";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Channel, Profile } from "@/types/database";

function ProfileContent({
  userId,
  householdId,
  name,
  email,
}: {
  userId: string;
  householdId: string;
  name: string;
  email: string;
}) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [displayName, setDisplayName] = useState(name);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [defaultChannelId, setDefaultChannelId] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadProfileOptions() {
      const [channelResult, profileResult] = await Promise.all([
        supabase
          .from("channels")
          .select("*")
          .eq("household_id", householdId)
          .order("name"),
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      ]);

      if (isMounted) {
        setChannels((channelResult.data || []) as Channel[]);
        const profile = profileResult.data as Profile | null;
        setDefaultChannelId(profile?.default_channel_id || "");
        if (profile?.display_name) {
          setDisplayName(profile.display_name);
        }
      }
    }

    loadProfileOptions();

    return () => {
      isMounted = false;
    };
  }, [householdId, supabase, userId]);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const { error: authError } = await supabase.auth.updateUser({
      data: {
        full_name: displayName.trim(),
        name: displayName.trim(),
      },
    });

    if (authError) {
      setSaving(false);
      setMessage(authError.message);
      return;
    }

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      display_name: displayName.trim(),
      default_channel_id: defaultChannelId || null,
      updated_at: new Date().toISOString(),
    });

    setSaving(false);
    setMessage(profileError ? profileError.message : "Profile saved. Your greeting is ready.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <>
      <PageHeader eyebrow="Your little corner" title="About you" />

      <div className="space-y-4">
        <Card>
          <form onSubmit={saveProfile} className="space-y-4">
            <Field label="Display name">
              <input
                required
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className={inputClassName}
                placeholder="What should we call you?"
              />
            </Field>

            <Field label="Default channel">
              <select
                value={defaultChannelId}
                onChange={(event) => setDefaultChannelId(event.target.value)}
                className={inputClassName}
              >
                <option value="">No default</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="rounded-2xl bg-background px-4 py-3">
              <p className="text-sm font-black text-foreground">Signed in as</p>
              <p className="mt-1 text-sm text-muted">{email}</p>
            </div>

            {message ? <p className="text-sm font-bold text-primary-dark">{message}</p> : null}

            <button disabled={saving} className={`${buttonClassName} w-full`}>
              {saving ? "Saving..." : "Save profile"}
            </button>
          </form>
        </Card>

        <button
          type="button"
          onClick={signOut}
          className="w-full rounded-2xl border border-border bg-card px-5 py-3 text-sm font-black text-muted"
        >
          Leave the garden
        </button>
      </div>
    </>
  );
}

function getInitialName(name: unknown, email: string) {
  return typeof name === "string" && name.trim() ? name.trim() : email.split("@")[0] || "";
}

export default function ProfilePage() {
  return (
    <ProtectedPage>
      {({ context }) => (
        <ProfileContent
          userId={context.user.id}
          householdId={context.householdId}
          name={getInitialName(context.user.user_metadata?.full_name, context.user.email || "")}
          email={context.user.email || "Unknown email"}
        />
      )}
    </ProtectedPage>
  );
}
