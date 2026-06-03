"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { EmptyState, PageHeader, ProtectedPage } from "@/components/app-shell";
import { TransactionForm } from "@/components/transaction-form";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Category, Channel, Subcategory, Transaction } from "@/types/database";

function EditTransactionContent({ householdId }: { householdId: string }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      const [categoryResult, subcategoryResult, channelResult, transactionResult] = await Promise.all([
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
        supabase
          .from("transactions")
          .select("*, categories(id, name, type), subcategories(id, name), channels(id, name)")
          .eq("household_id", householdId)
          .eq("id", params.id)
          .maybeSingle(),
      ]);

      if (isMounted) {
        setCategories((categoryResult.data || []) as Category[]);
        setSubcategories((subcategoryResult.data || []) as Subcategory[]);
        setChannels((channelResult.data || []) as Channel[]);
        setTransaction((transactionResult.data || null) as Transaction | null);
        setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [householdId, params.id, supabase]);

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Tidying the ledger" title="Edit transaction" />
        <EmptyState title="Opening transaction" body="Finding that little record." />
      </>
    );
  }

  if (!transaction) {
    return (
      <>
        <PageHeader eyebrow="Tidying the ledger" title="Edit transaction" />
        <EmptyState title="Transaction not found" body="It may have been deleted already." />
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Tidying the ledger" title="Edit transaction" />
      <TransactionForm
        categories={categories}
        subcategories={subcategories}
        channels={channels}
        transaction={transaction}
        submitLabel="Save changes 🌿"
        successMessage="This record is tidy now."
        onSubmit={async (values) => {
          const { error } = await supabase
            .from("transactions")
            .update({
              category_id: values.categoryId,
              subcategory_id: values.subcategoryId,
              channel_id: values.channelId,
              amount: values.amount,
              type: values.type,
              note: values.note,
              spent_at: values.spentAt,
            })
            .eq("id", transaction.id)
            .eq("household_id", householdId);

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

export default function EditTransactionPage() {
  return (
    <ProtectedPage>
      {({ context }) => <EditTransactionContent householdId={context.householdId} />}
    </ProtectedPage>
  );
}
