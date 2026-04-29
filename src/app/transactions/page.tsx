"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, EmptyState, PageHeader, ProtectedPage, buttonClassName } from "@/components/app-shell";
import { formatDate, formatIdr } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Profile, Transaction } from "@/types/database";

function TransactionsContent({ householdId, userId }: { householdId: string; userId: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadTransactions() {
      const { data } = await supabase
        .from("transactions")
        .select("*, categories(id, name, type), channels(id, name)")
        .eq("household_id", householdId)
        .order("spent_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);

      const nextTransactions = (data || []) as Transaction[];
      const userIds = Array.from(
        new Set(
          nextTransactions
            .map((transaction) => transaction.user_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      const { data: profileData } = userIds.length
        ? await supabase.from("profiles").select("*").in("id", userIds)
        : { data: [] };

      if (isMounted) {
        setTransactions(nextTransactions);
        setProfiles(
          ((profileData || []) as Profile[]).reduce<Record<string, Profile>>((acc, profile) => {
            acc[profile.id] = profile;
            return acc;
          }, {})
        );
        setLoading(false);
      }
    }

    loadTransactions();

    return () => {
      isMounted = false;
    };
  }, [householdId, supabase]);

  function getCreatorLabel(transaction: Transaction) {
    if (!transaction.user_id) {
      return "Added by someone";
    }

    if (transaction.user_id === userId) {
      return "Added by you";
    }

    return `Added by ${profiles[transaction.user_id]?.display_name || "household member"}`;
  }

  async function deleteTransaction(transactionId: string) {
    const shouldDelete = window.confirm("Delete this transaction?");

    if (!shouldDelete) {
      return;
    }

    setDeletingId(transactionId);
    setMessage("");

    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", transactionId)
      .eq("household_id", householdId);

    setDeletingId(null);

    if (error) {
      setMessage(error.message);
      return;
    }

    setTransactions((current) =>
      current.filter((transaction) => transaction.id !== transactionId)
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Spending basket"
        title="Transactions"
        action={
          <Link href="/transactions/new" className={buttonClassName}>
            Add
          </Link>
        }
      />

      {loading ? (
        <EmptyState title="Gathering spending" body="Your ledger is opening up." />
      ) : transactions.length === 0 ? (
        <EmptyState title="No spending yet" body="A fresh lily garden. Add your first transaction." />
      ) : (
        <div className="space-y-3">
          {message ? (
            <p className="rounded-2xl bg-accent px-4 py-3 text-sm font-bold text-primary-dark">
              {message}
            </p>
          ) : null}

          {transactions.map((transaction) => (
            <Card key={transaction.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-foreground">
                    {transaction.categories?.name || "Uncategorized"}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {formatDate(transaction.spent_at)} · {getCreatorLabel(transaction)}
                  </p>
                  <p className="mt-1 text-sm font-bold text-muted">
                    {transaction.channels?.name || "No channel"}
                  </p>
                  {transaction.note ? (
                    <p className="mt-2 text-sm leading-6 text-muted">{transaction.note}</p>
                  ) : null}
                </div>
                <p
                  className={
                    transaction.type === "expense"
                      ? "text-right font-black text-primary-dark"
                      : "text-right font-black text-secondary"
                  }
                >
                  {transaction.type === "expense" ? "-" : "+"}
                  {formatIdr(transaction.amount)}
                </p>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Link
                  href={`/transactions/${transaction.id}/edit`}
                  className="rounded-2xl border border-border px-4 py-2 text-sm font-black text-muted transition hover:bg-accent hover:text-primary-dark"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => deleteTransaction(transaction.id)}
                  disabled={deletingId === transaction.id}
                  className="rounded-2xl border border-border px-4 py-2 text-sm font-black text-muted transition hover:bg-accent hover:text-primary-dark disabled:opacity-60"
                >
                  {deletingId === transaction.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export default function TransactionsPage() {
  return (
    <ProtectedPage>
      {({ context }) => (
        <TransactionsContent householdId={context.householdId} userId={context.user.id} />
      )}
    </ProtectedPage>
  );
}
