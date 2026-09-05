-- Fast wallet balances: aggregates every transaction and transfer per channel
-- in a single query instead of paging through all rows client-side.
-- Run this in the Supabase SQL editor (or supabase db push).

create or replace function public.wallet_balances(p_household_id uuid)
returns table (
  channel_id uuid,
  balance integer,
  latest_date date,
  latest_amount integer,
  latest_kind text
)
language sql
stable
as $$
  with txn_activity as (
    select
      t.channel_id,
      case when t.type = 'income' then t.amount else -t.amount end as signed_amount,
      t.spent_at as activity_date,
      t.type::text as kind
    from public.transactions t
    where t.household_id = p_household_id
      and t.channel_id is not null
  ),
  transfer_out as (
    select
      tr.from_channel_id as channel_id,
      -tr.amount as signed_amount,
      tr.transferred_at as activity_date,
      'transfer_out'::text as kind
    from public.transfers tr
    where tr.household_id = p_household_id
  ),
  transfer_in as (
    select
      tr.to_channel_id as channel_id,
      tr.amount as signed_amount,
      tr.transferred_at as activity_date,
      'transfer_in'::text as kind
    from public.transfers tr
    where tr.household_id = p_household_id
  ),
  all_activity as (
    select channel_id, signed_amount, activity_date, kind from txn_activity
    union all
    select channel_id, signed_amount, activity_date, kind from transfer_out
    union all
    select channel_id, signed_amount, activity_date, kind from transfer_in
  )
  select
    c.id,
    coalesce(bal.total, 0)::integer as balance,
    latest.activity_date as latest_date,
    latest.signed_amount::integer as latest_amount,
    latest.kind as latest_kind
  from public.channels c
  left join (
    select channel_id, sum(signed_amount) as total
    from all_activity
    group by channel_id
  ) bal on bal.channel_id = c.id
  left join lateral (
    select a.signed_amount, a.activity_date, a.kind
    from all_activity a
    where a.channel_id = c.id
    order by a.activity_date desc
    limit 1
  ) latest on true
  where c.household_id = p_household_id
  order by c.name;
$$;
