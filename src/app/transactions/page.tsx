"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  EmptyState,
  Field,
  Modal,
  ProtectedPage,
  buttonClassName,
  inputClassName,
  secondaryButtonClassName,
} from "@/components/app-shell";
import { TransactionForm } from "@/components/transaction-form";
import { formatDate, formatIdr, monthStart, nextMonthStart } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase/client";
import { GoogleSheetsSyncButton } from "@/components/google-sheets-sync-button";
import type { Category, Channel, Profile, Subcategory, Transaction, TransactionType } from "@/types/database";

const PAGE_SIZE = 25;
const UNDO_TOAST_DURATION = 8_000;

type PendingDeletion = {
  transaction: Transaction;
};

function TransactionsContent({ householdId, userId }: { householdId: string; userId: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [people, setPeople] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [hasAnyTransactions, setHasAnyTransactions] = useState<boolean | null>(null);
  const [committingDeleteIds, setCommittingDeleteIds] = useState<Set<string>>(new Set());
  const [confirmingTransaction, setConfirmingTransaction] = useState<Transaction | null>(null);
  const [pendingDeletions, setPendingDeletions] = useState<PendingDeletion[]>([]);
  const [message, setMessage] = useState("");
  const [month, setMonth] = useState(monthStart().slice(0, 7));
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const deletionTimersRef = useRef(new Map<string, number>());
  const requestVersionRef = useRef(0);
  const pendingDeletionIdsRef = useRef(new Set<string>());

  const fetchTransactionPage = useCallback(async (offset: number) => {
    let query = supabase
      .from("transactions")
      .select("*, categories(id, name, type), subcategories(id, name), channels(id, name)", { count: "exact" })
      .eq("household_id", householdId)
      .order("spent_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (month) {
      const monthDate = new Date(`${month}-01T00:00:00`);
      query = query.gte("spent_at", `${month}-01`).lt("spent_at", nextMonthStart(monthDate));
    }

    if (searchQuery.trim()) {
      const escapedSearch = searchQuery.trim().replace(/[\\%_]/g, "\\$&");
      query = query.ilike("note", `%${escapedSearch}%`);
    }

    if (typeFilter !== "all") {
      query = query.eq("type", typeFilter);
    }

    if (categoryFilter !== "all") {
      query = query.eq("category_id", categoryFilter);
    }

    if (subcategoryFilter !== "all") {
      query = query.eq("subcategory_id", subcategoryFilter);
    }

    if (channelFilter !== "all") {
      query = query.eq("channel_id", channelFilter);
    }

    if (personFilter !== "all") {
      query = query.eq("user_id", personFilter);
    }

    const transactionResult = await query.range(offset, offset + PAGE_SIZE - 1);
    const rawTransactions = (transactionResult.data || []) as Transaction[];
    const nextTransactions = rawTransactions.filter(
      (transaction) => !pendingDeletionIdsRef.current.has(transaction.id)
    );
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

    return {
      error: transactionResult.error,
      transactions: nextTransactions,
      rawCount: rawTransactions.length,
      count: transactionResult.count,
      userIds,
      profiles: ((profileData || []) as Profile[]).reduce<Record<string, Profile>>((acc, profile) => {
        acc[profile.id] = profile;
        return acc;
      }, {}),
    };
  }, [categoryFilter, channelFilter, householdId, month, personFilter, searchQuery, subcategoryFilter, supabase, typeFilter]);

  useEffect(() => {
    let isMounted = true;

    async function loadOptions() {
      const [categoryResult, channelResult, subcategoryResult, presenceResult, memberResult] = await Promise.all([
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
          .from("subcategories")
          .select("*")
          .eq("household_id", householdId)
          .order("name"),
        supabase.from("transactions").select("id").eq("household_id", householdId).limit(1),
        supabase.from("household_members").select("user_id").eq("household_id", householdId),
      ]);

      if (!isMounted) {
        return;
      }

      setCategories((categoryResult.data || []) as Category[]);
      setChannels((channelResult.data || []) as Channel[]);
      setSubcategories((subcategoryResult.data || []) as Subcategory[]);
      if (!presenceResult.error) {
        setHasAnyTransactions((presenceResult.data || []).length > 0);
      }

      const memberIds = Array.from(
        new Set(
          ((memberResult.data || []) as Array<{ user_id: string | null }>)
            .map((member) => member.user_id)
            .filter((id): id is string => Boolean(id))
        )
      );
      if (memberIds.length) {
        const { data: memberProfiles } = await supabase.from("profiles").select("*").in("id", memberIds);
        if (!isMounted) {
          return;
        }
        setPeople(memberIds);
        setProfiles((current) => ({
          ...current,
          ...((memberProfiles || []) as Profile[]).reduce<Record<string, Profile>>((acc, profile) => {
            acc[profile.id] = profile;
            return acc;
          }, {}),
        }));
      }
    }

    void loadOptions();

    return () => {
      isMounted = false;
    };
  }, [householdId, supabase]);

  useEffect(() => {
    const requestVersion = ++requestVersionRef.current;
    let isMounted = true;

    async function loadFirstPage() {
      setLoading(true);
      setLoadingMore(false);
      setTransactions([]);
      setNextOffset(0);
      setTotalCount(null);
      setMessage("");

      const result = await fetchTransactionPage(0);

      if (!isMounted || requestVersion !== requestVersionRef.current) {
        return;
      }

      if (result.error) {
        setMessage(result.error.message);
        setLoading(false);
        return;
      }

      setTransactions(result.transactions);
      setNextOffset(result.rawCount);
      setTotalCount(result.count);
      setPeople((current) => Array.from(new Set([...current, ...result.userIds])));
      setProfiles((current) => ({ ...current, ...result.profiles }));
      setLoading(false);
    }

    void loadFirstPage();

    return () => {
      isMounted = false;
    };
  }, [fetchTransactionPage]);

  const hasMore = totalCount !== null && nextOffset < totalCount;

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

  function requestDelete(transaction: Transaction) {
    setConfirmingTransaction(transaction);
  }

  async function loadMore() {
    if (!hasMore || loadingMore || loading) {
      return;
    }

    const requestVersion = requestVersionRef.current;
    setLoadingMore(true);
    const result = await fetchTransactionPage(nextOffset);

    if (requestVersion !== requestVersionRef.current) {
      setLoadingMore(false);
      return;
    }

    if (result.error) {
      setMessage(result.error.message);
      setLoadingMore(false);
      return;
    }

    setTransactions((current) => {
      const existingIds = new Set(current.map((transaction) => transaction.id));
      return [...current, ...result.transactions.filter((transaction) => !existingIds.has(transaction.id))];
    });
    setNextOffset((current) => current + result.rawCount);
    setTotalCount(result.count);
    setPeople((current) => Array.from(new Set([...current, ...result.userIds])));
    setProfiles((current) => ({ ...current, ...result.profiles }));
    setLoadingMore(false);
  }

  function transactionMatchesCurrentFilters(transaction: Transaction) {
    if (month && !transaction.spent_at.startsWith(month)) {
      return false;
    }

    if (searchQuery.trim() && !(transaction.note || "").toLowerCase().includes(searchQuery.trim().toLowerCase())) {
      return false;
    }

    if (typeFilter !== "all" && transaction.type !== typeFilter) {
      return false;
    }

    if (categoryFilter !== "all" && transaction.category_id !== categoryFilter) {
      return false;
    }

    if (subcategoryFilter !== "all" && transaction.subcategory_id !== subcategoryFilter) {
      return false;
    }

    if (channelFilter !== "all" && transaction.channel_id !== channelFilter) {
      return false;
    }

    return personFilter === "all" || transaction.user_id === personFilter;
  }

  function restoreTransaction(transaction: Transaction) {
    if (!transactionMatchesCurrentFilters(transaction)) {
      return;
    }

    setTransactions((current) => {
      if (current.some((item) => item.id === transaction.id)) {
        return current;
      }

      return [...current, transaction].sort((first, second) => {
        const dateOrder = second.spent_at.localeCompare(first.spent_at);
        if (dateOrder !== 0) {
          return dateOrder;
        }

        return (second.created_at || "").localeCompare(first.created_at || "");
      });
    });
  }

  async function commitDeferredDelete(transaction: Transaction) {
    deletionTimersRef.current.delete(transaction.id);
    setCommittingDeleteIds((current) => new Set(current).add(transaction.id));

    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", transaction.id)
      .eq("household_id", householdId);

    pendingDeletionIdsRef.current.delete(transaction.id);
    setPendingDeletions((current) => current.filter((item) => item.transaction.id !== transaction.id));
    setCommittingDeleteIds((current) => {
      const next = new Set(current);
      next.delete(transaction.id);
      return next;
    });

    if (error) {
      restoreTransaction(transaction);
      setMessage(`Couldn't delete ${transaction.note || "this transaction"}: ${error.message}`);
      return;
    }

    setNextOffset((current) => Math.max(0, current - 1));
    setTotalCount((current) => (current === null ? current : Math.max(0, current - 1)));
  }

  function confirmDelete() {
    const transaction = confirmingTransaction;

    if (!transaction) {
      return;
    }

    setConfirmingTransaction(null);
    setMessage("");
    pendingDeletionIdsRef.current.add(transaction.id);
    setPendingDeletions((current) => [...current, { transaction }]);
    setTransactions((current) => current.filter((item) => item.id !== transaction.id));

    const timerId = window.setTimeout(() => {
      void commitDeferredDelete(transaction);
    }, UNDO_TOAST_DURATION);
    deletionTimersRef.current.set(transaction.id, timerId);
  }

  function undoDelete(transactionId: string) {
    const pendingDeletion = pendingDeletions.find((item) => item.transaction.id === transactionId);

    if (!pendingDeletion || committingDeleteIds.has(transactionId)) {
      return;
    }

    const timerId = deletionTimersRef.current.get(transactionId);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      deletionTimersRef.current.delete(transactionId);
    }

    pendingDeletionIdsRef.current.delete(transactionId);
    setPendingDeletions((current) => current.filter((item) => item.transaction.id !== transactionId));
    restoreTransaction(pendingDeletion.transaction);
  }

  function clearFilters() {
    setMonth("");
    setSearchQuery("");
    setTypeFilter("all");
    setCategoryFilter("all");
    setSubcategoryFilter("all");
    setChannelFilter("all");
    setPersonFilter("all");
  }

  const activeFilterChips: Array<{
    key: string;
    label: string;
    onRemove: () => void;
  }> = [];

  if (month) {
    activeFilterChips.push({
      key: "month",
      label: `Month: ${new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(
        new Date(`${month}-01T00:00:00`)
      )}`,
      onRemove: () => setMonth(""),
    });
  }

  if (searchQuery.trim()) {
    activeFilterChips.push({
      key: "search",
      label: `Note: ${searchQuery.trim()}`,
      onRemove: () => setSearchQuery(""),
    });
  }

  if (typeFilter !== "all") {
    activeFilterChips.push({
      key: "type",
      label: `Type: ${typeFilter === "expense" ? "Expense" : "Income"}`,
      onRemove: () => setTypeFilter("all"),
    });
  }

  if (categoryFilter !== "all") {
    activeFilterChips.push({
      key: "category",
      label: `Category: ${categories.find((category) => category.id === categoryFilter)?.name || "Selected"}`,
      onRemove: () => {
        setCategoryFilter("all");
        setSubcategoryFilter("all");
      },
    });
  }

  if (subcategoryFilter !== "all") {
    activeFilterChips.push({
      key: "subcategory",
      label: `Sub-category: ${subcategories.find((subcategory) => subcategory.id === subcategoryFilter)?.name || "Selected"}`,
      onRemove: () => setSubcategoryFilter("all"),
    });
  }

  if (channelFilter !== "all") {
    activeFilterChips.push({
      key: "channel",
      label: `Channel: ${channels.find((channel) => channel.id === channelFilter)?.name || "Selected"}`,
      onRemove: () => setChannelFilter("all"),
    });
  }

  if (personFilter !== "all") {
    activeFilterChips.push({
      key: "person",
      label: `Person: ${personFilter === userId ? "You" : profiles[personFilter]?.display_name || "Member"}`,
      onRemove: () => setPersonFilter("all"),
    });
  }

  const activeFilterCount = activeFilterChips.length;

  return (
    <>
      <header className="mb-5 petal-rise">
        <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-sm font-bold text-primary-dark">
          <span aria-hidden="true">✿</span>
          Spending basket
        </p>
        <h1 className="mt-2 break-words text-[2rem] font-black leading-tight tracking-normal text-foreground sm:text-3xl">
          Spending basket
        </h1>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <Link
            href="/transfers"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-border bg-card px-4 py-3 text-sm font-black text-muted"
          >
            Transfers
          </Link>
          <Link
            href="/transfers/new"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-border bg-card px-4 py-3 text-sm font-black text-muted"
          >
            Move money
          </Link>
          <Link href="/transactions/new" className={`${buttonClassName} col-span-2 sm:col-span-1`}>
            Add spending
          </Link>
        </div>
      </header>

      {loading ? (
        <EmptyState title="Gathering spending" body="Your ledger is opening up." />
      ) : hasAnyTransactions === false ? (
        <EmptyState title="No spending yet" body="A fresh lily garden. Add your first transaction." />
      ) : (
        <div className="space-y-3">
          <Card>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-foreground">Find spending</p>
                <p className="mt-1 text-xs leading-5 text-muted">Narrow the basket by month, note, type, jar, or wallet.</p>
              </div>
              <div className="shrink-0">
                <GoogleSheetsSyncButton householdId={householdId} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Month">
                <input
                  type="month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  className={inputClassName}
                />
              </Field>
              <Field label="Search notes">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search notes or descriptions"
                  className={inputClassName}
                />
              </Field>
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
              aria-expanded={filtersOpen}
              aria-controls="transaction-filters"
              className="mt-3 flex min-h-12 w-full items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm font-black text-muted transition hover:border-primary-dark hover:text-primary-dark md:hidden"
            >
              <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</span>
              <span aria-hidden="true">{filtersOpen ? "Hide" : "Show"}</span>
            </button>
            <div
              id="transaction-filters"
              className={
                filtersOpen
                  ? "mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
                  : "mt-3 hidden grid-cols-1 gap-3 sm:grid-cols-2 md:grid"
              }
            >
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
                  onChange={(event) => {
                    setCategoryFilter(event.target.value);
                    setSubcategoryFilter("all");
                  }}
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
              {(() => {
                const filteredSubs = categoryFilter === "all"
                  ? subcategories
                  : subcategories.filter((sub) => sub.category_id === categoryFilter);

                if (filteredSubs.length === 0) return null;

                return (
                  <Field label="Sub-category">
                    <select
                      value={subcategoryFilter}
                      onChange={(event) => setSubcategoryFilter(event.target.value)}
                      className={inputClassName}
                    >
                      <option value="all">All</option>
                      {filteredSubs.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                );
              })()}
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
                  onClick={clearFilters}
                  className="min-h-12 w-full rounded-2xl border border-border px-4 py-3 text-sm font-black text-muted transition hover:border-primary-dark hover:text-primary-dark"
                >
                  Clear filters
                </button>
              </div>
            </div>
            {activeFilterChips.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Active filters">
                {activeFilterChips.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={filter.onRemove}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full bg-accent px-3 py-2 text-xs font-black text-primary-dark transition hover:bg-primary hover:text-foreground"
                    aria-label={`Remove ${filter.label} filter`}
                  >
                    {filter.label}
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            ) : null}
          </Card>

          {transactions.length === 0 ? (
            <EmptyState title="Nothing matches" body="Try relaxing the filters a little." />
          ) : null}

          {transactions.map((transaction) => (
            <Card key={transaction.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-accent px-3 py-1 text-sm font-black text-primary-dark">
                      {transaction.categories?.name || "Uncategorized"}
                    </span>
                    {transaction.subcategories?.name ? (
                      <span className="rounded-full bg-accent/60 px-3 py-1 text-xs font-black text-primary-dark">
                        {transaction.subcategories.name}
                      </span>
                    ) : null}
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
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingTransaction(transaction)}
                  className="rounded-2xl bg-accent px-4 py-2 text-sm font-black text-primary-dark transition hover:bg-primary-dark hover:text-white"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => requestDelete(transaction)}
                  disabled={committingDeleteIds.has(transaction.id)}
                  className="rounded-2xl border border-border px-4 py-2 text-sm font-black text-muted transition hover:border-primary-dark hover:text-primary-dark disabled:opacity-60"
                >
                  {committingDeleteIds.has(transaction.id) ? "Deleting..." : "Delete"}
                </button>
              </div>
            </Card>
          ))}
          {hasMore ? (
            <div className="pt-1 text-center">
              <p className="mb-2 text-xs font-bold text-muted">
                Showing {transactions.length} loaded{totalCount !== null ? ` of ${totalCount}` : ""} transactions
              </p>
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className={`${secondaryButtonClassName} w-full sm:w-auto`}
              >
                {loadingMore ? "Loading..." : "Load more"}
              </button>
            </div>
          ) : null}
        </div>
      )}
      {message ? (
        <p role="alert" className="mt-3 rounded-2xl bg-accent px-4 py-3 text-sm font-bold text-primary-dark">
          {message}
        </p>
      ) : null}
      {pendingDeletions.length > 0 ? (
        <div className="fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 space-y-2 md:bottom-6 md:left-auto md:right-8 md:w-96">
          {pendingDeletions.map(({ transaction }) => (
            <div
              key={transaction.id}
              role="status"
              aria-live="polite"
              className="flex items-center gap-3 rounded-2xl bg-foreground px-4 py-3 text-white shadow-[0_14px_34px_rgba(63,52,50,0.24)]"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black">Transaction removed</p>
                <p className="mt-1 break-words text-xs leading-5 text-white/75">
                  {transaction.note || transaction.categories?.name || "Untitled transaction"} · {formatIdr(transaction.amount)} · {formatDate(transaction.spent_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => undoDelete(transaction.id)}
                disabled={committingDeleteIds.has(transaction.id)}
                className="min-h-11 shrink-0 rounded-xl bg-primary px-3 py-2 text-sm font-black text-foreground transition hover:bg-white disabled:opacity-60"
              >
                {committingDeleteIds.has(transaction.id) ? "Deleting..." : "Undo"}
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <Modal
        open={editingTransaction !== null}
        onClose={() => setEditingTransaction(null)}
        title="Edit transaction"
      >
        {editingTransaction ? (
          <TransactionForm
            categories={categories}
            subcategories={subcategories}
            channels={channels}
            transaction={editingTransaction}
            submitLabel="Save changes 🌿"
            successMessage="Updated!"
            onSuccess={() => setTimeout(() => setEditingTransaction(null), 800)}
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
                .eq("id", editingTransaction.id)
                .eq("household_id", householdId);

              if (error) {
                return error.message;
              }

              setTransactions((current) =>
                current.map((txn) =>
                  txn.id === editingTransaction.id
                    ? {
                        ...txn,
                        category_id: values.categoryId,
                        subcategory_id: values.subcategoryId,
                        channel_id: values.channelId,
                        amount: values.amount,
                        type: values.type,
                        note: values.note,
                        spent_at: values.spentAt,
                        categories: categories.find((c) => c.id === values.categoryId) || null,
                        subcategories: subcategories.find((s) => s.id === values.subcategoryId) || null,
                        channels: channels.find((c) => c.id === values.channelId) || null,
                      }
                    : txn
                )
              );
              return null;
            }}
          />
        ) : null}
      </Modal>
      <Modal
        open={confirmingTransaction !== null}
        onClose={() => setConfirmingTransaction(null)}
        title="Delete transaction?"
      >
        {confirmingTransaction ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-muted">
              This removes the transaction from your spending history. You can undo it for a few seconds after deleting.
            </p>
            <div className="rounded-2xl bg-background px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-black text-foreground">
                    {confirmingTransaction.note || "No note"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {confirmingTransaction.categories?.name || "Uncategorized"} · {formatDate(confirmingTransaction.spent_at)}
                  </p>
                </div>
                <p
                  className={
                    confirmingTransaction.type === "expense"
                      ? "shrink-0 text-right font-black text-primary-dark"
                      : "shrink-0 text-right font-black text-secondary"
                  }
                >
                  {confirmingTransaction.type === "expense" ? "-" : "+"}
                  {formatIdr(confirmingTransaction.amount)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmingTransaction(null);
                }}
                className={secondaryButtonClassName}
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className={`${buttonClassName} bg-primary-dark text-white hover:bg-primary-dark`}
              >
                Delete
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
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
