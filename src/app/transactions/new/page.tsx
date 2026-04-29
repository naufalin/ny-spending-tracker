"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, ProtectedPage } from "@/components/app-shell";
import { TransactionForm } from "@/components/transaction-form";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Category, Channel, Profile } from "@/types/database";

function NewTransactionContent({
  householdId,
  userId,
}: {
  householdId: string;
  userId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [defaultChannelId, setDefaultChannelId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadOptions() {
      const [categoryResult, channelResult, profileResult] = await Promise.all([
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
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      ]);

      if (isMounted) {
        setCategories((categoryResult.data || []) as Category[]);
        setChannels((channelResult.data || []) as Channel[]);
        setDefaultChannelId(((profileResult.data as Profile | null)?.default_channel_id) || null);
      }
    }

    loadOptions();

    return () => {
      isMounted = false;
    };
  }, [householdId, supabase, userId]);

  return (
    <>
      <PageHeader eyebrow="Add today’s spending 🌸" title="New transaction" />
      <TransactionForm
        categories={categories}
        channels={channels}
        defaultChannelId={defaultChannelId}
        submitLabel="Save spending 🌸"
        successMessage="Saved to the garden."
        onSubmit={async (values) => {
          const { error } = await supabase.from("transactions").insert({
            household_id: householdId,
            user_id: userId,
            category_id: values.categoryId,
            channel_id: values.channelId,
            amount: values.amount,
            type: values.type,
            note: values.note,
            spent_at: values.spentAt,
          });

          if (error) {
            return error.message;
          }

          router.push("/transactions");
          return null;
        }}
      />
    </>
  );
}

export default function NewTransactionPage() {
  return (
    <ProtectedPage>
      {({ context }) => (
        <NewTransactionContent householdId={context.householdId} userId={context.user.id} />
      )}
    </ProtectedPage>
  );
}
