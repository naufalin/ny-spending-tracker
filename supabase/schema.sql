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

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  name text not null
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  user_id uuid references auth.users(id),
  category_id uuid references public.categories(id),
  channel_id uuid references public.channels(id),
  amount integer not null,
  type text not null check (type in ('expense', 'income')),
  note text,
  spent_at date not null default current_date,
  created_at timestamptz default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  month date not null,
  amount integer not null,
  created_at timestamptz default now()
);

create unique index if not exists budgets_household_category_month_key
  on public.budgets (household_id, category_id, month);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.channels enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;

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
