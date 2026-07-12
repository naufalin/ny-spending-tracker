create index if not exists transfers_household_transferred_at_idx
  on public.transfers (household_id, transferred_at desc, created_at desc);

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
