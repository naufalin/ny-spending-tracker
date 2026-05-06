"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, ProtectedPage } from "@/components/app-shell";
import { TransferForm } from "@/components/transfer-form";
import { getSupabaseClient } from "@/lib/supabase/client";
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

  useEffect(() => {
    let isMounted = true;

    async function loadOptions() {
      const [categoryResult, channelResult] = await Promise.all([
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
      ]);

      if (isMounted) {
        setCategories((categoryResult.data || []) as Category[]);
        setChannels((channelResult.data || []) as Channel[]);
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
        submitLabel="Save transfer"
        successMessage="Transfer saved."
        onSubmit={async (values) => {
          const fromChannel = channels.find((channel) => channel.id === values.fromChannelId);
          const toChannel = channels.find((channel) => channel.id === values.toChannelId);

          const transferResult = await supabase
            .from("transfers")
            .insert({
              household_id: householdId,
              user_id: userId,
              from_channel_id: values.fromChannelId,
              to_channel_id: values.toChannelId,
              amount: values.amount,
              fee_amount: values.feeAmount,
              fee_category_id: values.feeCategoryId,
              fee_transaction_id: null,
              note: values.note,
              transferred_at: values.transferredAt,
            })
            .select("id")
            .single();

          if (transferResult.error) {
            return transferResult.error.message;
          }

          if (values.feeAmount > 0) {
            const transferNote = `Transfer fee: ${fromChannel?.name || "source"} to ${
              toChannel?.name || "destination"
            }${values.note ? ` - ${values.note}` : ""}`;
            const feeResult = await supabase
              .from("transactions")
              .insert({
                household_id: householdId,
                user_id: userId,
                category_id: values.feeCategoryId,
                channel_id: values.fromChannelId,
                amount: values.feeAmount,
                type: "expense",
                note: transferNote,
                spent_at: values.transferredAt,
              })
              .select("id")
              .single();

            if (feeResult.error) {
              await supabase
                .from("transfers")
                .delete()
                .eq("id", transferResult.data.id)
                .eq("household_id", householdId);

              return feeResult.error.message;
            }

            const linkResult = await supabase
              .from("transfers")
              .update({ fee_transaction_id: feeResult.data.id })
              .eq("id", transferResult.data.id)
              .eq("household_id", householdId);

            if (linkResult.error) {
              return linkResult.error.message;
            }
          }

          router.push("/transactions");
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
