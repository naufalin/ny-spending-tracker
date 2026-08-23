"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, PageHeader, ProtectedPage } from "@/components/app-shell";
import { TransactionForm } from "@/components/transaction-form";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Category, Channel, Profile, Subcategory } from "@/types/database";

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
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [defaultChannelId, setDefaultChannelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadOptions() {
      try {
        const [categoryResult, subcategoryResult, channelResult, profileResult] = await Promise.all([
          supabase
            .from("categories")
            .select("*")
            .eq("household_id", householdId)
            .order("name"),
          supabase
            .from("subcategories")
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

        const queryError =
          categoryResult.error ||
          subcategoryResult.error ||
          channelResult.error ||
          profileResult.error;

        if (queryError) {
          throw new Error(queryError.message);
        }

        if (isMounted) {
          const nextChannels = (channelResult.data || []) as Channel[];
          const profile = profileResult.data as Profile | null;
          const requestedDefaultChannelId = profile?.default_channel_id || null;

          setCategories((categoryResult.data || []) as Category[]);
          setSubcategories((subcategoryResult.data || []) as Subcategory[]);
          setChannels(nextChannels);
          setDefaultChannelId(
            requestedDefaultChannelId &&
              nextChannels.some((channel) => channel.id === requestedDefaultChannelId)
              ? requestedDefaultChannelId
              : null
          );
          setLoading(false);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : "Could not load spending options.");
        setLoading(false);
      }
    }

    loadOptions();

    return () => {
      isMounted = false;
    };
  }, [householdId, supabase, userId]);

  return (
    <>
      <PageHeader eyebrow="Add today's spending 🌸" title="New transaction" />
      {loading ? (
        <EmptyState
          title="Preparing your spending form"
          body="Loading your categories, wallets, and preferences."
        />
      ) : loadError ? (
        <EmptyState title="Could not load spending options" body={loadError} />
      ) : (
        <TransactionForm
          categories={categories}
          subcategories={subcategories}
          channels={channels}
          defaultChannelId={defaultChannelId}
          submitLabel="Save spending 🌸"
          successMessage="Saved to the garden."
          onSubmit={async (values) => {
            const { error } = await supabase.from("transactions").insert({
              household_id: householdId,
              user_id: userId,
              category_id: values.categoryId,
              subcategory_id: values.subcategoryId,
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
      )}
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
