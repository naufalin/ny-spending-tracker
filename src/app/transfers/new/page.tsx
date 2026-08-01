"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, ProtectedPage } from "@/components/app-shell";
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

  useEffect(() => {
    let isMounted = true;

    async function loadOptions() {
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
