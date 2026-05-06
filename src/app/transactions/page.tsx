"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, EmptyState, Field, PageHeader, ProtectedPage, buttonClassName, inputClassName } from "@/components/app-shell";
import { formatDate, formatIdr, monthStart } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Category, Channel, Profile, Transaction, TransactionType } from "@/types/database";

function TransactionsContent({ householdId, userId }: { householdId: string; userId: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [month, setMonth] = useState(monthStart().slice(0, 7));
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");

  useEffect(() => {
    let isMounted = true;

    async function loadTransactions() {
      const [transactionResult, categoryResult, channelResult] = await Promise.all([
        supabase
          .from("transactions")
          .select("*, categories(id, name, type), channels(id, name)")
          .eq("household_id", householdId)
          .order("spent_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(200),
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

      const nextTransactions = (transactionResult.data || []) as Transaction[];
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
        setCategories((categoryResult.data || []) as Category[]);
        setChannels((channelResult.data || []) as Channel[]);
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

  const filteredTransactions = transactions.filter((transaction) => {
    if (month && !transaction.spent_at.startsWith(month)) {
      return false;
    }

    if (typeFilter !== "all" && transaction.type !== typeFilter) {
      return false;
    }

    if (categoryFilter !== "all" && transaction.category_id !== categoryFilter) {
      return false;
    }

    if (channelFilter !== "all" && transaction.channel_id !== channelFilter) {
      return false;
    }

    if (personFilter !== "all" && transaction.user_id !== personFilter) {
      return false;
    }

    return true;
  });

  const people = Array.from(
    new Set(transactions.map((transaction) => transaction.user_id).filter((id): id is string => Boolean(id)))
  );

  function getCreatorLabel(transaction: Transaction) {
    if (!transaction.user_id) {
      return "Added by someone";
    }

    if (transaction.user_id === userId) {
      return "Added by you";
    }

    return `Added by ${profiles[transaction.user_id]?.display_name || "household member"}`;
  }

  function getCreatorShortLabel(transaction: Transaction) {
    if (!transaction.user_id) {
      return "Someone";
    }

    if (transaction.user_id === userId) {
      return "You";
    }

    return profiles[transaction.user_id]?.display_name || "Member";
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
        title="Spending basket"
        action={
          <div className="flex gap-2">
            <Link
              href="/transfers/new"
              className="rounded-2xl border border-border bg-card px-4 py-3 text-sm font-black text-muted"
            >
              Transfer
            </Link>
            <Link href="/transactions/new" className={buttonClassName}>
              Add
            </Link>
          </div>
        }
      />

      {loading ? (
        <EmptyState title="Gathering spending" body="Your ledger is opening up." />
      ) : transactions.length === 0 ? (
        <EmptyState title="No spending yet" body="A fresh lily garden. Add your first transaction." />
      ) : (
        <div className="space-y-3">
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Month">
                <input
                  type="month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  className={inputClassName}
                />
              </Field>
              <Field label="Type">
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value as "all" | TransactionType)}
                  className={inputClassName}
                >
                  <option value="all">All</option>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </Field>
              <Field label="Category">
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className={inputClassName}
                >
                  <option value="all">All</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Channel">
                <select
                  value={channelFilter}
                  onChange={(event) => setChannelFilter(event.target.value)}
                  className={inputClassName}
                >
                  <option value="all">All</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Person">
                <select
                  value={personFilter}
                  onChange={(event) => setPersonFilter(event.target.value)}
                  className={inputClassName}
                >
                  <option value="all">All</option>
                  {people.map((personId) => (
                    <option key={personId} value={personId}>
                      {personId === userId ? "You" : profiles[personId]?.display_name || "Household member"}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    setMonth("");
                    setTypeFilter("all");
                    setCategoryFilter("all");
                    setChannelFilter("all");
                    setPersonFilter("all");
                  }}
                  className="min-h-12 w-full rounded-2xl border border-border px-4 py-3 text-sm font-black text-muted"
                >
                  Clear
                </button>
              </div>
            </div>
          </Card>

          {message ? (
            <p className="rounded-2xl bg-accent px-4 py-3 text-sm font-bold text-primary-dark">
              {message}
            </p>
          ) : null}

          {filteredTransactions.length === 0 ? (
            <EmptyState title="Nothing matches" body="Try relaxing the filters a little." />
          ) : null}

          {filteredTransactions.map((transaction) => (
            <Card key={transaction.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-accent px-3 py-1 text-sm font-black text-primary-dark">
                      {transaction.categories?.name || "Uncategorized"}
                    </span>
                    <span className="rounded-full bg-background px-3 py-1 text-xs font-black text-muted">
                      {transaction.channels?.name || "No channel"}
                    </span>
                    <span className="rounded-full bg-background px-3 py-1 text-xs font-black text-muted">
                      {getCreatorShortLabel(transaction)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {formatDate(transaction.spent_at)} · {getCreatorLabel(transaction)}
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
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setOpenActionsId((current) =>
                      current === transaction.id ? null : transaction.id
                    )
                  }
                  className="rounded-2xl border border-border px-4 py-2 text-sm font-black text-muted transition hover:bg-accent hover:text-primary-dark disabled:opacity-60"
                >
                  More
                </button>
              </div>
              {openActionsId === transaction.id ? (
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-background p-2">
                  <Link
                    href={`/transactions/${transaction.id}/edit`}
                    className="rounded-xl bg-card px-4 py-3 text-center text-sm font-black text-foreground"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => deleteTransaction(transaction.id)}
                    disabled={deletingId === transaction.id}
                    className="rounded-xl bg-card px-4 py-3 text-sm font-black text-primary-dark disabled:opacity-60"
                  >
                    {deletingId === transaction.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              ) : null}
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
