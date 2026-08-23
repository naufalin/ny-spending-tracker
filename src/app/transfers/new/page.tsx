"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, PageHeader, ProtectedPage } from "@/components/app-shell";
import { TransferForm } from "@/components/transfer-form";
import { calculateChannelBalances } from "@/lib/transfers";
import { getSupabaseClient } from "@/lib/supabase/client";
import { saveTransfer } from "@/lib/transfers";
import type { Category, Channel } from "@/types/database";

function NewTransferContent({
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
  const [channelBalances, setChannelBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadOptions() {
      try {
        const [categoryResult, channelResult, transactionResult, transferResult] = await Promise.all([
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
          supabase
            .from("transactions")
            .select("channel_id, type, amount")
            .eq("household_id", householdId),
          supabase
            .from("transfers")
            .select("from_channel_id, to_channel_id, amount")
            .eq("household_id", householdId),
        ]);

        const queryError =
          categoryResult.error ||
          channelResult.error ||
          transactionResult.error ||
          transferResult.error;

        if (queryError) {
          throw new Error(queryError.message);
        }

        if (isMounted) {
          const nextCategories = (categoryResult.data || []) as Category[];
          const nextChannels = (channelResult.data || []) as Channel[];
          setCategories(nextCategories);
          setChannels(nextChannels);
          setChannelBalances(
            calculateChannelBalances(
              nextChannels,
              transactionResult.data || [],
              transferResult.data || []
            )
          );
          setLoading(false);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : "Could not load transfer options.");
        setLoading(false);
      }
    }

    loadOptions();

    return () => {
      isMounted = false;
    };
  }, [householdId, supabase]);

  return (
    <>
      <PageHeader eyebrow="Move money" title="New transfer" />
      {loading ? (
        <EmptyState
          title="Loading your wallets"
          body="Gathering your wallet balances and transfer options."
        />
      ) : loadError ? (
        <EmptyState title="Could not load transfer options" body={loadError} />
      ) : (
        <TransferForm
          categories={categories}
          channels={channels}
          channelBalances={channelBalances}
          submitLabel="Save transfer"
          successMessage="Transfer saved."
          onSubmit={async (values) => {
            const error = await saveTransfer({
              supabase,
              householdId,
              userId,
              values,
            });

            if (error) {
              return error;
            }

            router.push("/transfers");
            return null;
          }}
        />
      )}
    </>
  );
}

export default function NewTransferPage() {
  return (
    <ProtectedPage>
      {({ context }) => (
        <NewTransferContent householdId={context.householdId} userId={context.user.id} />
      )}
    </ProtectedPage>
  );
}
