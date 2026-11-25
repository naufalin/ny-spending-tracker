begin;

create table public.laundry_batches (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  sent_on date not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  discrepancy_note text check (discrepancy_note ~ '[^[:space:]]' and char_length(discrepancy_note) <= 1000),
  check (discrepancy_note is null or closed_at is not null)
);

create table public.laundry_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.laundry_batches(id) on delete cascade,
  position integer not null,
  name text not null check (name ~ '[^[:space:]]' and char_length(name) <= 120),
  owner_key text,
  owner_label text,
  quantity integer not null check (quantity between 1 and 999),
  returns jsonb not null default '{}' check (jsonb_typeof(returns) = 'object'),
  unique (batch_id, position),
  check ((owner_key is null) = (owner_label is null))
);

create index laundry_batches_household_sent_idx
  on public.laundry_batches (household_id, sent_on desc, id desc);

alter table public.laundry_batches enable row level security;
alter table public.laundry_items enable row level security;

create policy "Household members can view laundry batches"
  on public.laundry_batches for select to authenticated
  using (exists (
    select 1 from public.household_members m
    where m.household_id = laundry_batches.household_id and m.user_id = auth.uid()
  ));

create policy "Household members can view laundry items"
  on public.laundry_items for select to authenticated
  using (exists (select 1 from public.laundry_batches b where b.id = laundry_items.batch_id));

revoke all on public.laundry_batches, public.laundry_items from public, anon, authenticated;
grant select on public.laundry_batches, public.laundry_items to authenticated;

create function public.laundry_owners(p_household_id uuid)
returns table (key text, label text)
language sql stable security definer set search_path = ''
as $$
  select m.user_id::text,
    coalesce(nullif(btrim(p.display_name), ''), 'Household member')
  from public.household_members m
  left join public.profiles p on p.id = m.user_id
  where m.household_id = p_household_id
    and exists (
      select 1 from public.household_members viewer
      where viewer.household_id = p_household_id and viewer.user_id = auth.uid()
    )
  order by 2, 1;
$$;

create function public.create_laundry_batch(
  p_batch_id uuid, p_household_id uuid, p_sent_on date, p_items jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_item record;
  v_label text;
begin
  if not exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id and m.user_id = auth.uid()
  ) then
    raise exception 'Household access denied.' using errcode = '42501';
  end if;

  if p_sent_on is null or p_sent_on > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Choose a drop-off date no later than today.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Enter at least one item.';
  end if;
  if jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Enter between 1 and 100 item rows.';
  end if;

  insert into public.laundry_batches (id, household_id, created_by, sent_on)
  values (p_batch_id, p_household_id, auth.uid(), p_sent_on)
  on conflict (id) do nothing;

  if not found then
    if exists (
      select 1 from public.laundry_batches b
      where b.id = p_batch_id and b.household_id = p_household_id and b.created_by = auth.uid()
    ) then
      if exists (
        select 1 from public.laundry_batches b
        where b.id = p_batch_id and b.sent_on = p_sent_on
      ) and (
        select jsonb_agg(jsonb_build_array(i.name, i.owner_key, i.quantity) order by i.position)
        from public.laundry_items i where i.batch_id = p_batch_id
      ) = (
        select jsonb_agg(jsonb_build_array(btrim(entry->>'name'), entry->>'owner_key',
          (entry->>'quantity')::integer) order by position)
        from jsonb_array_elements(p_items) with ordinality as rows(entry, position)
      ) then
        return p_batch_id;
      end if;
      raise exception 'This batch was already saved. Open it from the Laundry page.';
    end if;
    raise exception 'Could not save this batch.' using errcode = '42501';
  end if;

  for v_item in
    select entry, position
    from jsonb_array_elements(p_items) with ordinality as rows(entry, position)
  loop
    case v_item.entry->>'owner_key'
      when 'shared' then v_label := 'Shared';
      else
        v_label := null;
        if v_item.entry->>'owner_key' is not null then
          select owner.label into v_label
          from public.laundry_owners(p_household_id) owner
          where owner.key = v_item.entry->>'owner_key';
          if not found then
            raise exception 'Choose a current household member as the owner.';
          end if;
        end if;
    end case;

    insert into public.laundry_items (batch_id, position, name, owner_key, owner_label, quantity)
    values (
      p_batch_id, v_item.position, btrim(v_item.entry->>'name'),
      v_item.entry->>'owner_key', v_label, (v_item.entry->>'quantity')::integer
    );
  end loop;

  return p_batch_id;
end;
$$;

create function public.set_laundry_return(
  p_batch_id uuid, p_item_id uuid, p_expected_returns jsonb, p_count integer, p_returned_on date
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_batch public.laundry_batches%rowtype;
  v_item public.laundry_items%rowtype;
  v_event record;
  v_count integer;
  v_remove integer;
  v_take integer;
  v_date text;
begin
  select b.* into v_batch
  from public.laundry_batches b
  where b.id = p_batch_id and exists (
    select 1 from public.household_members m
    where m.household_id = b.household_id and m.user_id = auth.uid()
  )
  for update;

  if not found then
    raise exception 'Laundry batch not found.' using errcode = '42501';
  end if;
  if v_batch.closed_at is not null then
    raise exception 'This batch is already closed.';
  end if;

  select * into v_item from public.laundry_items where id = p_item_id and batch_id = p_batch_id;
  if not found then
    raise exception 'Laundry item not found.';
  end if;
  if v_item.returns is distinct from p_expected_returns then
    raise exception 'Someone updated this item. Review the latest count and try again.' using errcode = '40001';
  end if;
  if p_count is null or p_count not between 0 and v_item.quantity then
    raise exception 'Enter a returned count between zero and the quantity sent.';
  end if;
  if p_returned_on is null or p_returned_on < v_batch.sent_on
    or p_returned_on > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Choose a return date between drop-off and today.';
  end if;

  select coalesce(sum(value::integer), 0) into v_count
  from jsonb_each_text(v_item.returns);
  if p_count > v_count then
    v_date := to_char(p_returned_on, 'YYYY-MM-DD');
    v_item.returns := jsonb_set(v_item.returns, array[v_date],
      to_jsonb(coalesce((v_item.returns->>v_date)::integer, 0) + p_count - v_count));
  elsif p_count < v_count then
    -- Correct the most recent return entries first and preserve earlier dates.
    v_remove := v_count - p_count;
    for v_event in select key, value::integer as qty from jsonb_each_text(v_item.returns) order by key desc
    loop
      exit when v_remove = 0;
      v_take := least(v_event.qty, v_remove);
      if v_take = v_event.qty then
        v_item.returns := v_item.returns - v_event.key;
      else
        v_item.returns := jsonb_set(v_item.returns, array[v_event.key], to_jsonb(v_event.qty - v_take));
      end if;
      v_remove := v_remove - v_take;
    end loop;
  end if;

  update public.laundry_items set returns = v_item.returns where id = p_item_id;
  return v_item.returns;
end;
$$;

create function public.close_laundry_batch(p_batch_id uuid, p_expected_returns jsonb, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_batch public.laundry_batches%rowtype;
  v_missing integer;
  v_returns jsonb;
  v_note text := nullif(btrim(p_note), '');
begin
  select b.* into v_batch
  from public.laundry_batches b
  where b.id = p_batch_id and exists (
    select 1 from public.household_members m
    where m.household_id = b.household_id and m.user_id = auth.uid()
  )
  for update;

  if not found then
    raise exception 'Laundry batch not found.' using errcode = '42501';
  end if;
  if v_batch.closed_at is not null then
    if v_batch.discrepancy_note is not distinct from v_note then return; end if;
    raise exception 'This batch is already closed.';
  end if;

  select jsonb_object_agg(i.id, i.returns), coalesce(sum(i.quantity - coalesce((
    select sum(value::integer) from jsonb_each_text(i.returns)
  ), 0)), 0) into v_returns, v_missing
  from public.laundry_items i where i.batch_id = p_batch_id;

  if v_returns is distinct from p_expected_returns then
    raise exception 'The return counts changed. Review the batch before closing.' using errcode = '40001';
  end if;
  if v_missing > 0 and (v_note is null or v_note !~ '[^[:space:]]') then
    raise exception 'Add a note about the missing items.';
  end if;

  update public.laundry_batches
  set closed_at = now(), discrepancy_note = case when v_missing > 0 then v_note end
  where id = p_batch_id;
end;
$$;

revoke execute on function
  public.laundry_owners(uuid),
  public.create_laundry_batch(uuid, uuid, date, jsonb),
  public.set_laundry_return(uuid, uuid, jsonb, integer, date),
  public.close_laundry_batch(uuid, jsonb, text)
from public, anon;

grant execute on function
  public.laundry_owners(uuid),
  public.create_laundry_batch(uuid, uuid, date, jsonb),
  public.set_laundry_return(uuid, uuid, jsonb, integer, date),
  public.close_laundry_batch(uuid, jsonb, text)
to authenticated;

commit;
