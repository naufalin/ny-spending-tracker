create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists public.household_members (
  household_id uuid references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'member',
  primary key (household_id, user_id)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  updated_at timestamptz default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('expense', 'income'))
);

create table if not exists public.subcategories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  name text not null
);

alter table public.profiles
  add column if not exists default_channel_id uuid references public.channels(id) on delete set null;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  user_id uuid references auth.users(id),
  category_id uuid references public.categories(id) on delete set null,
  subcategory_id uuid references public.subcategories(id) on delete set null,
  channel_id uuid references public.channels(id),
  amount integer not null,
  type text not null check (type in ('expense', 'income')),
  note text,
  spent_at date not null default current_date,
  created_at timestamptz default now()
);

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  user_id uuid references auth.users(id),
  from_channel_id uuid not null references public.channels(id),
  to_channel_id uuid not null references public.channels(id),
  amount integer not null check (amount > 0),
  fee_amount integer not null default 0 check (fee_amount >= 0),
  fee_category_id uuid references public.categories(id) on delete set null,
  fee_transaction_id uuid references public.transactions(id) on delete set null,
  note text,
  transferred_at date not null default current_date,
  created_at timestamptz default now(),
  check (from_channel_id <> to_channel_id)
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  month date not null,
  amount integer not null,
  created_at timestamptz default now()
);

create table if not exists public.google_sheets_connections (
  household_id uuid primary key references public.households(id) on delete cascade,
  spreadsheet_id text,
  spreadsheet_name text,
  connected_by uuid references auth.users(id),
  encrypted_refresh_token text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_sync_status text check (last_sync_status in ('success', 'error')),
  last_sync_summary jsonb,
  last_sync_error text
);

create unique index if not exists budgets_household_category_month_key
  on public.budgets (household_id, category_id, month);

create index if not exists transfers_household_transferred_at_idx
  on public.transfers (household_id, transferred_at desc, created_at desc);

alter table public.transactions
  drop constraint if exists transactions_category_id_fkey,
  add constraint transactions_category_id_fkey
    foreign key (category_id) references public.categories(id) on delete set null;

alter table public.transfers
  drop constraint if exists transfers_fee_category_id_fkey,
  add constraint transfers_fee_category_id_fkey
    foreign key (fee_category_id) references public.categories(id) on delete set null;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.subcategories enable row level security;
alter table public.channels enable row level security;
alter table public.transactions enable row level security;
alter table public.transfers enable row level security;
alter table public.budgets enable row level security;
alter table public.google_sheets_connections enable row level security;

drop policy if exists "Members can view their households" on public.households;
drop policy if exists "Users can view their own household memberships" on public.household_members;
drop policy if exists "Members can view household profiles" on public.profiles;
drop policy if exists "Users can create their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Members can view categories" on public.categories;
drop policy if exists "Members can create categories" on public.categories;
drop policy if exists "Members can update categories" on public.categories;
drop policy if exists "Members can delete categories" on public.categories;
drop policy if exists "Members can view subcategories" on public.subcategories;
drop policy if exists "Members can create subcategories" on public.subcategories;
drop policy if exists "Members can update subcategories" on public.subcategories;
drop policy if exists "Members can delete subcategories" on public.subcategories;
drop policy if exists "Members can view channels" on public.channels;
drop policy if exists "Members can create channels" on public.channels;
drop policy if exists "Members can update channels" on public.channels;
drop policy if exists "Members can delete channels" on public.channels;
drop policy if exists "Members can view transactions" on public.transactions;
drop policy if exists "Members can create transactions" on public.transactions;
drop policy if exists "Members can delete transactions" on public.transactions;
drop policy if exists "Members can update transactions" on public.transactions;
drop policy if exists "Members can view transfers" on public.transfers;
drop policy if exists "Members can create transfers" on public.transfers;
drop policy if exists "Members can delete transfers" on public.transfers;
drop policy if exists "Members can update transfers" on public.transfers;
drop policy if exists "Members can view budgets" on public.budgets;
drop policy if exists "Members can create budgets" on public.budgets;
drop policy if exists "Members can update budgets" on public.budgets;
drop policy if exists "Members can view google sheet connection" on public.google_sheets_connections;

create policy "Members can view their households"
  on public.households
  for select
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = households.id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Users can view their own household memberships"
  on public.household_members
  for select
  using (user_id = auth.uid());

create policy "Members can view household profiles"
  on public.profiles
  for select
  using (
    profiles.id = auth.uid()
    or exists (
      select 1
      from public.household_members viewer
      join public.household_members profile_member
        on profile_member.household_id = viewer.household_id
      where viewer.user_id = auth.uid()
        and profile_member.user_id = profiles.id
    )
  );

create policy "Users can create their own profile"
  on public.profiles
  for insert
  with check (id = auth.uid());

create policy "Users can update their own profile"
  on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Members can view categories"
  on public.categories
  for select
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = categories.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can view google sheet connection"
  on public.google_sheets_connections
  for select
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = google_sheets_connections.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can create categories"
  on public.categories
  for insert
  with check (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = categories.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can update categories"
  on public.categories
  for update
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = categories.household_id
        and household_members.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = categories.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can delete categories"
  on public.categories
  for delete
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = categories.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can view subcategories"
  on public.subcategories
  for select
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = subcategories.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can create subcategories"
  on public.subcategories
  for insert
  with check (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = subcategories.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can update subcategories"
  on public.subcategories
  for update
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = subcategories.household_id
        and household_members.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = subcategories.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can delete subcategories"
  on public.subcategories
  for delete
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = subcategories.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can view channels"
  on public.channels
  for select
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = channels.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can create channels"
  on public.channels
  for insert
  with check (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = channels.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can update channels"
  on public.channels
  for update
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = channels.household_id
        and household_members.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = channels.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can delete channels"
  on public.channels
  for delete
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = channels.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can view transactions"
  on public.transactions
  for select
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = transactions.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can create transactions"
  on public.transactions
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.household_members
      where household_members.household_id = transactions.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can delete transactions"
  on public.transactions
  for delete
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = transactions.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can update transactions"
  on public.transactions
  for update
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = transactions.household_id
        and household_members.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = transactions.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can view transfers"
  on public.transfers
  for select
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = transfers.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can create transfers"
  on public.transfers
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.household_members
      where household_members.household_id = transfers.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can delete transfers"
  on public.transfers
  for delete
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = transfers.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can update transfers"
  on public.transfers
  for update
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = transfers.household_id
        and household_members.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = transfers.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can view budgets"
  on public.budgets
  for select
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = budgets.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can create budgets"
  on public.budgets
  for insert
  with check (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = budgets.household_id
        and household_members.user_id = auth.uid()
    )
  );

create policy "Members can update budgets"
  on public.budgets
  for update
  using (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = budgets.household_id
        and household_members.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.household_members
      where household_members.household_id = budgets.household_id
        and household_members.user_id = auth.uid()
    )
  );

create or replace function public.save_transfer(
  p_transfer_id uuid,
  p_household_id uuid,
  p_user_id uuid,
  p_from_channel_id uuid,
  p_to_channel_id uuid,
  p_amount integer,
  p_fee_amount integer,
  p_fee_category_id uuid,
  p_note text,
  p_transferred_at date
)
returns void
language plpgsql
set search_path = public
as $function$
declare
  v_existing_fee_transaction_id uuid;
  v_fee_transaction_id uuid;
  v_from_name text;
  v_to_name text;
  v_fee_note text;
  v_saved_transfer_id uuid;
begin
  if not exists (
    select 1
    from public.household_members
    where household_id = p_household_id
      and user_id = auth.uid()
  ) then
    raise exception 'Household access denied';
  end if;

  if p_transfer_id is null and p_user_id <> auth.uid() then
    raise exception 'Transfer creator must be the signed-in user';
  end if;

  if p_amount <= 0 then
    raise exception 'Transfer amount must be greater than zero';
  end if;

  if p_fee_amount < 0 then
    raise exception 'Transfer fee cannot be negative';
  end if;

  if p_from_channel_id = p_to_channel_id then
    raise exception 'Source and destination wallets must be different';
  end if;

  select name
  into v_from_name
  from public.channels
  where id = p_from_channel_id
    and household_id = p_household_id;

  if not found then
    raise exception 'Source wallet not found';
  end if;

  select name
  into v_to_name
  from public.channels
  where id = p_to_channel_id
    and household_id = p_household_id;

  if not found then
    raise exception 'Destination wallet not found';
  end if;

  if p_fee_category_id is not null and not exists (
    select 1
    from public.categories
    where id = p_fee_category_id
      and household_id = p_household_id
      and type = 'expense'
  ) then
    raise exception 'Fee category not found';
  end if;

  if p_transfer_id is null then
    insert into public.transfers (
      household_id,
      user_id,
      from_channel_id,
      to_channel_id,
      amount,
      fee_amount,
      fee_category_id,
      fee_transaction_id,
      note,
      transferred_at
    ) values (
      p_household_id,
      p_user_id,
      p_from_channel_id,
      p_to_channel_id,
      p_amount,
      p_fee_amount,
      case when p_fee_amount > 0 then p_fee_category_id else null end,
      null,
      p_note,
      p_transferred_at
    ) returning id, fee_transaction_id into v_saved_transfer_id, v_existing_fee_transaction_id;
  else
    select id, fee_transaction_id
    into v_saved_transfer_id, v_existing_fee_transaction_id
    from public.transfers
    where id = p_transfer_id
      and household_id = p_household_id
    for update;

    if not found then
      raise exception 'Transfer not found';
    end if;

    update public.transfers
    set from_channel_id = p_from_channel_id,
        to_channel_id = p_to_channel_id,
        amount = p_amount,
        fee_amount = p_fee_amount,
        fee_category_id = case when p_fee_amount > 0 then p_fee_category_id else null end,
        note = p_note,
        transferred_at = p_transferred_at
    where id = v_saved_transfer_id
      and household_id = p_household_id;
  end if;

  v_fee_note := format(
    'Transfer fee: %s to %s%s',
    v_from_name,
    v_to_name,
    case
      when p_note is not null and length(trim(p_note)) > 0 then format(' - %s', trim(p_note))
      else ''
    end
  );

  if p_fee_amount > 0 then
    v_fee_transaction_id := v_existing_fee_transaction_id;

    if v_fee_transaction_id is not null then
      update public.transactions
      set category_id = p_fee_category_id,
          channel_id = p_from_channel_id,
          amount = p_fee_amount,
          type = 'expense',
          note = v_fee_note,
          spent_at = p_transferred_at
      where id = v_fee_transaction_id
        and household_id = p_household_id;

      if not found then
        v_fee_transaction_id := null;
      end if;
    end if;

    if v_fee_transaction_id is null then
      insert into public.transactions (
        household_id,
        user_id,
        category_id,
        channel_id,
        amount,
        type,
        note,
        spent_at
      ) values (
        p_household_id,
        p_user_id,
        p_fee_category_id,
        p_from_channel_id,
        p_fee_amount,
        'expense',
        v_fee_note,
        p_transferred_at
      ) returning id into v_fee_transaction_id;
    end if;

    update public.transfers
    set fee_transaction_id = v_fee_transaction_id
    where id = v_saved_transfer_id
      and household_id = p_household_id;
  elsif v_existing_fee_transaction_id is not null then
    delete from public.transactions
    where id = v_existing_fee_transaction_id
      and household_id = p_household_id;

    update public.transfers
    set fee_transaction_id = null
    where id = v_saved_transfer_id
      and household_id = p_household_id;
  end if;
end;
$function$;

create or replace function public.delete_transfer(
  p_transfer_id uuid,
  p_household_id uuid
)
returns void
language plpgsql
set search_path = public
as $function$
declare
  v_fee_transaction_id uuid;
begin
  if not exists (
    select 1
    from public.household_members
    where household_id = p_household_id
      and user_id = auth.uid()
  ) then
    raise exception 'Household access denied';
  end if;

  select fee_transaction_id
  into v_fee_transaction_id
  from public.transfers
  where id = p_transfer_id
    and household_id = p_household_id
  for update;

  if not found then
    raise exception 'Transfer not found';
  end if;

  if v_fee_transaction_id is not null then
    delete from public.transactions
    where id = v_fee_transaction_id
      and household_id = p_household_id;
  end if;

  delete from public.transfers
  where id = p_transfer_id
    and household_id = p_household_id;
end;
$function$;

grant execute on function public.save_transfer(uuid, uuid, uuid, uuid, uuid, integer, integer, uuid, text, date) to authenticated;
grant execute on function public.delete_transfer(uuid, uuid) to authenticated;
