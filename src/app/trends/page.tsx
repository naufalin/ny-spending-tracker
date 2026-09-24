"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { Card, EmptyState, PageHeader, ProtectedPage, secondaryButtonClassName } from "@/components/app-shell";
import { formatDate, formatIdr, monthStart, nextMonthStart } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Category, Transaction } from "@/types/database";

type SpendingRow = Transaction;
type DetailSelection = { month: string; categoryId: string | null };
type MonthTotal = { key: string; total: number; label: string; current: boolean };
const MAX_SELECTED_MONTHS = 3;
const monthColors = ["var(--chart-1)", "var(--chart-3)", "var(--chart-5)"];

function monthKey(date: Date) {
  return monthStart(date).slice(0, 7);
}

function addMonths(key: string, offset: number) {
  const [year, month] = key.split("-").map(Number);
  return monthKey(new Date(year, month - 1 + offset, 1));
}

function monthLabel(key: string, short = false) {
  return new Intl.DateTimeFormat("en", {
    month: short ? "short" : "long",
    year: short ? undefined : "numeric",
  }).format(new Date(`${key}-01T00:00:00`));
}

function compactIdr(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

function compactAmount(amount: number) {
  return new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(amount);
}

function TrendsContent({ householdId }: { householdId: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const currentMonth = monthKey(new Date());
  const months = useMemo(() => Array.from({ length: 6 }, (_, index) => addMonths(currentMonth, index - 5)), [currentMonth]);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([addMonths(currentMonth, -1), currentMonth]);
  const [rows, setRows] = useState<SpendingRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [detail, setDetail] = useState<DetailSelection | null>(null);
  const chartScrollerRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      const firstMonth = months[0];
      const end = nextMonthStart(new Date(`${currentMonth}-01T00:00:00`));
      const allRows: SpendingRow[] = [];
      let offset = 0;
      let queryError = "";

      // Fetch every row in the window; a single Supabase request may be capped.
      while (true) {
        const result = await supabase
          .from("transactions")
          .select("*, subcategories(id, name), channels(id, name)")
          .eq("household_id", householdId)
          .eq("type", "expense")
          .gte("spent_at", `${firstMonth}-01`)
          .lt("spent_at", end)
          .order("spent_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + 499);

        if (result.error) {
          queryError = result.error.message;
          break;
        }

        const batch = (result.data || []) as SpendingRow[];
        allRows.push(...batch);
        if (batch.length < 500) break;
        offset += batch.length;
      }

      const categoryResult = await supabase
        .from("categories")
        .select("*")
        .eq("household_id", householdId)
        .eq("type", "expense");

      if (!active) return;
      setRows(queryError || categoryResult.error ? [] : allRows);
      setCategories((categoryResult.data || []) as Category[]);
      setError(queryError || categoryResult.error ? "We couldn't load your spending trends. Check your connection and try again." : "");
      setLoading(false);
    }

    load();
    return () => { active = false; };
  }, [currentMonth, householdId, months, retryKey, supabase]);

  const todayDay = new Date().getDate();
  const totals: MonthTotal[] = months.map((key) => ({
    key,
    label: monthLabel(key, true),
    current: key === currentMonth,
    total: rows.filter((row) => row.spent_at.slice(0, 7) === key && (key !== currentMonth || Number(row.spent_at.slice(8, 10)) <= todayDay)).reduce((sum, row) => sum + row.amount, 0),
  }));
  const highest = Math.max(1, ...totals.map((month) => month.total));
  const orderedSelectedMonths = months.filter((key) => selectedMonths.includes(key));
  const throughDay = orderedSelectedMonths.includes(currentMonth) ? todayDay : undefined;
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const categoryAmounts = (list: SpendingRow[]) => list.reduce((amounts, row) => {
    const key = row.category_id || "uncategorized";
    amounts.set(key, (amounts.get(key) || 0) + row.amount);
    return amounts;
  }, new Map<string, number>());
  const amountsByMonth = new Map(orderedSelectedMonths.map((key) => [
    key,
    categoryAmounts(rows.filter((row) => row.spent_at.slice(0, 7) === key && (!throughDay || Number(row.spent_at.slice(8, 10)) <= throughDay))),
  ]));
  const comparableTotals = new Map(orderedSelectedMonths.map((key) => [
    key,
    [...(amountsByMonth.get(key)?.values() || [])].reduce((sum, amount) => sum + amount, 0),
  ]));
  const categoryIds = [...new Set([...amountsByMonth.values()].flatMap((amounts) => [...amounts.keys()]))];
  const jarRows = categoryIds.map((id) => ({
    id,
    name: categoryNames.get(id) || "Uncategorized",
    amounts: orderedSelectedMonths.map((key) => amountsByMonth.get(key)?.get(id) || 0),
  })).sort((a, b) => Math.max(...b.amounts) - Math.max(...a.amounts));
  const largestJarAmount = Math.max(1, ...jarRows.flatMap((jar) => jar.amounts));
  const chartData = jarRows.map((jar) => ({
    id: jar.id,
    name: jar.name,
    ...Object.fromEntries(orderedSelectedMonths.map((key, index) => [key, jar.amounts[index]])),
  }));
  const chartWidth = Math.max(680, 92 + jarRows.length * Math.max(88, orderedSelectedMonths.length * 32));
  const earliestMonth = orderedSelectedMonths[0];
  const latestMonth = orderedSelectedMonths[orderedSelectedMonths.length - 1];
  const movers = jarRows.map((jar) => ({
    ...jar,
    change: jar.amounts[jar.amounts.length - 1] - jar.amounts[0],
  })).sort((a, b) => orderedSelectedMonths.length > 1
    ? Math.abs(b.change) - Math.abs(a.change)
    : b.amounts[0] - a.amounts[0]).slice(0, 3);
  const detailRows = detail ? rows.filter((row) =>
    row.spent_at.slice(0, 7) === detail.month &&
    (!throughDay || Number(row.spent_at.slice(8, 10)) <= throughDay) &&
    (detail.categoryId === null || (row.category_id || "uncategorized") === detail.categoryId)
  ).sort((a, b) => b.spent_at.localeCompare(a.spent_at) || b.id.localeCompare(a.id)) : [];
  const detailGroups = [...detailRows.reduce((groups, row) => {
    const key = detail?.categoryId === null ? row.category_id || "uncategorized" : row.subcategory_id || "other";
    const name = detail?.categoryId === null ? categoryNames.get(row.category_id || "") || "Uncategorized" : row.subcategories?.name || "Other";
    const group = groups.get(key) || { name, amount: 0, rows: [] as SpendingRow[] };
    group.amount += row.amount;
    group.rows.push(row);
    groups.set(key, group);
    return groups;
  }, new Map<string, { name: string; amount: number; rows: SpendingRow[] }>()).values()].sort((a, b) => b.amount - a.amount);

  function showDetail(month: string, categoryId: string | null = null) {
    setDetail({ month, categoryId });
    window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const scroller = chartScrollerRef.current;
      if (!scroller) return;
      setCanScrollLeft(scroller.scrollLeft > 4);
      setCanScrollRight(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 4);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chartWidth, loading]);

  function updateChartScroll() {
    const scroller = chartScrollerRef.current;
    if (!scroller) return;
    setCanScrollLeft(scroller.scrollLeft > 4);
    setCanScrollRight(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 4);
  }

  function toggleMonth(key: string) {
    setDetail(null);
    setSelectedMonths((selected) => {
      if (selected.includes(key)) return selected.length > 1 ? selected.filter((month) => month !== key) : selected;
      return selected.length < MAX_SELECTED_MONTHS ? [...selected, key] : selected;
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <PageHeader title="Spending trends" />
        <p className="-mt-3 text-sm text-muted">See how your spending changes from month to month.</p>
      </div>

      {error ? (
        <Card className="space-y-3">
          <p role="alert" className="text-sm text-danger">{error}</p>
          <button type="button" onClick={() => setRetryKey((key) => key + 1)} className={secondaryButtonClassName}>Try again</button>
        </Card>
      ) : null}
      {loading ? <Card><p className="text-sm text-muted">Loading your spending trends…</p></Card> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="No spending to compare yet" body="Add expenses to see monthly trends here." />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <>
          <Card className="space-y-5">
            <div>
              <h2 className="text-lg font-black text-foreground">Monthly spending</h2>
              <p className="mt-1 text-sm text-muted">Select up to three months to compare their jars below.</p>
              <p className="mt-2 text-xs font-bold text-primary-dark" role="status">
                {selectedMonths.length} of {MAX_SELECTED_MONTHS} selected{selectedMonths.length === MAX_SELECTED_MONTHS ? " · Deselect one to choose another." : ""}
              </p>
            </div>
            <div className="grid grid-cols-6 gap-2 sm:gap-4" role="group" aria-label="Choose months to compare">
              {totals.map((month) => (
                <button
                  key={month.key}
                  type="button"
                  onClick={() => toggleMonth(month.key)}
                  disabled={!selectedMonths.includes(month.key) && selectedMonths.length >= MAX_SELECTED_MONTHS}
                  aria-pressed={selectedMonths.includes(month.key)}
                  aria-label={`${monthLabel(month.key)}: ${formatIdr(month.total)}${month.current ? ", month to date" : ""}`}
                  className={`group relative flex min-w-0 flex-col items-center rounded-xl border-2 p-1 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-45 ${selectedMonths.includes(month.key) ? "border-primary-dark bg-accent/45 shadow-sm" : "border-transparent hover:border-primary/40"}`}
                >
                  <span className="mb-2 max-w-full truncate text-[10px] font-black tabular-nums text-foreground sm:text-xs">
                    <span className="sm:hidden">{compactAmount(month.total)}</span>
                    <span className="hidden sm:inline">{formatIdr(month.total)}</span>
                  </span>
                  <span className="flex h-36 w-full items-end rounded-xl bg-accent/25 p-1 sm:h-48">
                    <span
                      className={`block w-full rounded-lg transition-all ${selectedMonths.includes(month.key) ? "bg-primary-dark" : "bg-primary group-hover:bg-primary-dark/70"}`}
                      style={{ height: `${month.total ? Math.max(5, (month.total / highest) * 100) : 2}%`, opacity: month.current ? 0.68 : 1 }}
                    />
                  </span>
                  <span className="mt-2 text-xs font-black text-foreground">{month.label}</span>
                  {selectedMonths.includes(month.key) ? <span className="text-[10px] font-black uppercase tracking-wide text-primary-dark"><span className="sm:hidden" aria-hidden="true">✓</span><span className="hidden sm:inline" aria-hidden="true">✓ Selected</span></span> : null}
                  {month.current ? <span className="text-[10px] font-bold text-muted">partial</span> : null}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">{monthLabel(currentMonth)} is still in progress. Its bar includes days 1–{todayDay}; earlier monthly bars show full months.</p>
          </Card>

          <Card className="space-y-4">
            <div>
              <h2 className="text-lg font-black text-foreground">Spending by jar</h2>
              <p className="text-sm text-muted">Selected months sit side by side for each jar.</p>
              {throughDay ? <p className="mt-2 text-xs font-bold text-primary-dark">Fair comparison: each selected month includes only days 1–{throughDay}.</p> : null}
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Selected month totals">
              {orderedSelectedMonths.map((key, index) => (
                <button key={key} type="button" onClick={() => showDetail(key)} className="rounded-xl border border-border bg-accent/30 px-3 py-2 text-left text-xs font-bold text-foreground hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent">
                  <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: monthColors[index] }} aria-hidden="true" />
                  {monthLabel(key)}{throughDay ? ` · days 1–${throughDay}` : ""}: {formatIdr(comparableTotals.get(key) || 0)}
                </button>
              ))}
            </div>
            {jarRows.length ? (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-black text-foreground">{orderedSelectedMonths.length > 1 ? "Biggest jar changes" : "Top jars"}</h3>
                  {orderedSelectedMonths.length > 1 ? <p className="text-xs text-muted">{monthLabel(earliestMonth)} to {monthLabel(latestMonth)}{throughDay ? `, days 1–${throughDay}` : ""}</p> : null}
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {movers.map((jar) => {
                      const drilldownMonth = jar.amounts[jar.amounts.length - 1] > 0 ? latestMonth : earliestMonth;
                      return (
                        <button key={jar.id} type="button" onClick={() => showDetail(drilldownMonth, jar.id)} className="flex items-center justify-between gap-3 rounded-xl bg-accent/25 px-3 py-2 text-left text-sm text-foreground hover:bg-accent/55 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent">
                          <span className="min-w-0 truncate font-bold">{jar.name}</span>
                          <span className="shrink-0 font-black tabular-nums">{orderedSelectedMonths.length > 1 ? `${jar.change > 0 ? "+" : jar.change < 0 ? "−" : ""}${compactIdr(Math.abs(jar.change))}` : compactIdr(jar.amounts[0])}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted">{jarRows.length} jars · Scroll for more · Select a nonzero bar to view transactions below</p>
                  <div className="flex gap-2">
                    <button type="button" disabled={!canScrollLeft} onClick={() => chartScrollerRef.current?.scrollBy({ left: -Math.round(chartScrollerRef.current.clientWidth * 0.75), behavior: "smooth" })} className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-foreground disabled:opacity-40">Previous jars</button>
                    <button type="button" disabled={!canScrollRight} onClick={() => chartScrollerRef.current?.scrollBy({ left: Math.round(chartScrollerRef.current.clientWidth * 0.75), behavior: "smooth" })} className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-foreground disabled:opacity-40">Next jars</button>
                  </div>
                </div>
                <div ref={chartScrollerRef} onScroll={updateChartScroll} className="overflow-x-auto rounded-xl border border-border/70 bg-accent/10 pb-2" tabIndex={0} role="region" aria-label="Jar comparison chart, scroll horizontally">
                  <BarChart width={chartWidth} height={300} data={chartData} margin={{ top: 12, right: 22, bottom: 0, left: 4 }} accessibilityLayer>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="name" interval={0} height={42} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={(value: string) => value.length > 13 ? `${value.slice(0, 12)}…` : value} />
                    <YAxis width={75} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={(value: number) => compactIdr(value)} domain={[0, Math.ceil(largestJarAmount * 1.15)]} />
                    <Tooltip
                      formatter={(value, name) => [formatIdr(Number(value)), String(name)]}
                      contentStyle={{ borderRadius: 14, borderColor: "var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)" }}
                    />
                    {orderedSelectedMonths.map((key, index) => (
                      <Bar
                        key={key}
                        dataKey={key}
                        name={`${monthLabel(key)}${key === currentMonth ? " · to date" : ""}`}
                        fill={monthColors[index]}
                        radius={[5, 5, 0, 0]}
                        maxBarSize={26}
                        isAnimationActive={false}
                        onClick={(bar) => {
                          const jarId = bar.payload?.id as string | undefined;
                          if (jarId && Number(bar.value) > 0) {
                            showDetail(key, jarId);
                          }
                        }}
                      />
                    ))}
                  </BarChart>
                </div>
                <div className="rounded-xl border border-border/70 p-3 text-sm">
                  <h3 className="font-black text-foreground">Exact values</h3>
                  <p className="mt-1 text-xs text-muted">Select an amount to see its transactions below.</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
                      <thead><tr><th scope="col" className="border-b border-border p-2">Jar</th>{orderedSelectedMonths.map((key) => <th scope="col" key={key} className="border-b border-border p-2">{monthLabel(key)}</th>)}</tr></thead>
                      <tbody>{jarRows.map((jar) => (
                        <tr key={jar.id}>
                          <th scope="row" className="border-b border-border/60 p-2 font-bold">{jar.name}</th>
                          {orderedSelectedMonths.map((key, index) => (
                            <td key={key} className="border-b border-border/60 p-2">
                              {jar.amounts[index] > 0
                                ? <button type="button" onClick={() => showDetail(key, jar.id)} className="font-bold text-primary-dark underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent">{formatIdr(jar.amounts[index])}</button>
                                : formatIdr(jar.amounts[index])}
                            </td>
                          ))}
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : <p className="text-sm text-muted">No spending in the selected months.</p>}
          </Card>
          {detail ? (
            <div ref={detailRef} className="scroll-mt-5"><Card className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-foreground">{detail.categoryId === null ? "All jars" : categoryNames.get(detail.categoryId) || "Uncategorized"} · {monthLabel(detail.month)}</h2>
                  <p className="mt-1 text-xs text-muted">{throughDay ? `Days 1–${throughDay} · ` : ""}{detailRows.length} transactions · {formatIdr(detailRows.reduce((sum, row) => sum + row.amount, 0))}</p>
                </div>
                <button type="button" onClick={() => setDetail(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent">Close</button>
              </div>
              {detailGroups.map((group) => (
                <div key={group.name} className="rounded-xl border border-border/70 p-3">
                  <div className="flex justify-between gap-3 border-b border-border/70 pb-2 text-sm font-black text-foreground"><h3>{group.name}</h3><span>{formatIdr(group.amount)}</span></div>
                  <div className="divide-y divide-border/60">
                    {group.rows.map((row) => (
                      <div key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <div className="min-w-0"><p className="break-words font-bold text-foreground">{row.note || row.channels?.name || "Expense"}</p><p className="text-xs text-muted">{formatDate(row.spent_at)}{detail.categoryId === null && row.subcategories?.name ? ` · ${row.subcategories.name}` : ""}{row.channels?.name ? ` · ${row.channels.name}` : ""}</p></div>
                        <span className="shrink-0 font-black tabular-nums text-primary-dark">{formatIdr(row.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </Card></div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function TrendsPage() {
  return <ProtectedPage>{({ context }) => <TrendsContent householdId={context.householdId} />}</ProtectedPage>;
}
