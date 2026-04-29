"use client";

import { useMemo, useState } from "react";
import {
  Card,
  Field,
  PageHeader,
  ProtectedPage,
  buttonClassName,
  inputClassName,
} from "@/components/app-shell";
import { getSupabaseClient } from "@/lib/supabase/client";

function ProfileContent({
  userId,
  name,
  email,
}: {
  userId: string;
  name: string;
  email: string;
}) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [displayName, setDisplayName] = useState(name);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

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
      <PageHeader eyebrow="Your little corner" title="Profile" />

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
          Sign out
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
          name={getInitialName(context.user.user_metadata?.full_name, context.user.email || "")}
          email={context.user.email || "Unknown email"}
        />
      )}
    </ProtectedPage>
  );
}
