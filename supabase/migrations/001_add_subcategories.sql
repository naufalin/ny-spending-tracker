-- Sub-categories: a second level under categories (jars).
-- Example: category "Household Supplies" -> subcategories "Cleaning", "Toiletries", "Kitchenware"

create table if not exists public.subcategories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null
);

-- Link transactions to an optional sub-category
alter table public.transactions
  add column if not exists subcategory_id uuid references public.subcategories(id) on delete set null;

-- RLS
alter table public.subcategories enable row level security;

drop policy if exists "Members can view subcategories" on public.subcategories;
drop policy if exists "Members can create subcategories" on public.subcategories;
drop policy if exists "Members can update subcategories" on public.subcategories;
drop policy if exists "Members can delete subcategories" on public.subcategories;

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
