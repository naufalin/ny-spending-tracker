"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, ProtectedPage } from "@/components/app-shell";
import { TransferForm } from "@/components/transfer-form";
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
