-- Run against a local database with the main schema and 004_laundry.sql applied.
-- Every fixture and change is rolled back.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id) values
  ('a0000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000002'),
  ('a0000000-0000-4000-8000-000000000003');
insert into public.households (id, name) values
  ('b0000000-0000-4000-8000-000000000001', 'Laundry test household'),
  ('b0000000-0000-4000-8000-000000000002', 'Other test household');
insert into public.household_members (household_id, user_id) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003');
insert into public.profiles (id, display_name) values
  ('a0000000-0000-4000-8000-000000000002', 'Laundry test partner');

set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000001';

do $$
declare
  household constant uuid := 'b0000000-0000-4000-8000-000000000001';
  batch constant uuid := 'c0000000-0000-4000-8000-000000000001';
  today constant date := (now() at time zone 'Asia/Jakarta')::date;
  payload constant jsonb := '[{"name":"Work shirts","owner_key":"a0000000-0000-4000-8000-000000000002","quantity":3},
    {"name":"Towels","owner_key":"shared","quantity":2},{"name":"Bath mat","quantity":1}]';
begin
  assert (select count(*) from public.laundry_owners(household)) = 2;
  assert public.create_laundry_batch(batch, household, today - 5, payload) = batch;
  assert public.create_laundry_batch(batch, household, today - 5, payload) = batch;
  begin
    perform public.create_laundry_batch(batch, household, today - 4, payload);
    raise sqlstate 'P0004' using message = 'changed retry was silently accepted';
  exception when raise_exception then
    assert sqlerrm = 'This batch was already saved. Open it from the Laundry page.';
  end;
  assert (select count(*) from public.laundry_items where batch_id = batch) = 3, 'retry duplicated items';
  assert (select owner_label from public.laundry_items where batch_id = batch and position = 1) = 'Laundry test partner';
  assert (select owner_label from public.laundry_items where batch_id = batch and position = 2) = 'Shared';
  assert (select owner_label from public.laundry_items where batch_id = batch and position = 3) is null;
  begin
    perform public.create_laundry_batch('c0000000-0000-4000-8000-000000000002', household, today - 5,
      '[{"name":"Towels","quantity":2},{"name":"Jacket","owner_key":"a0000000-0000-4000-8000-000000000003","quantity":1}]');
    raise sqlstate 'P0004' using message = 'out-of-household owner accepted';
  exception when raise_exception then
    assert sqlerrm = 'Choose a current household member as the owner.';
  end;
  assert not exists (select 1 from public.laundry_batches where id = 'c0000000-0000-4000-8000-000000000002'),
    'failed insert left a partial batch';
end;
$$;

set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000002';

do $$
declare
  batch constant uuid := 'c0000000-0000-4000-8000-000000000001';
  today constant date := (now() at time zone 'Asia/Jakarta')::date;
  shirt uuid;
  returns_snapshot jsonb;
  first_return jsonb := jsonb_build_object(to_char(today - 2, 'YYYY-MM-DD'), 1);
  second_return jsonb := first_return || jsonb_build_object(to_char(today - 1, 'YYYY-MM-DD'), 2);
begin
  select id into strict shirt from public.laundry_items where batch_id = batch and position = 1;
  assert public.set_laundry_return(batch, shirt, '{}', 1, today - 2) = first_return;
  begin
    perform public.set_laundry_return(batch, shirt, '{}', 2, today);
    raise sqlstate 'P0004' using message = 'stale return was accepted';
  exception when serialization_failure then null;
  end;
  assert public.set_laundry_return(batch, shirt, first_return, 3, today - 1) = second_return;
  assert public.set_laundry_return(batch, shirt, second_return, 1, today) = first_return, 'correction erased old return date';
  select jsonb_object_agg(id, returns) into returns_snapshot
  from public.laundry_items where batch_id = batch;
  begin
    perform public.close_laundry_batch(batch,
      jsonb_set(returns_snapshot, array[shirt::text], jsonb_build_object(to_char(today - 1, 'YYYY-MM-DD'), 1)),
      'Item missing');
    raise sqlstate 'P0004' using message = 'stale closing count was accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.close_laundry_batch(batch, returns_snapshot, null);
    raise sqlstate 'P0004' using message = 'batch closed without a discrepancy note';
  exception when raise_exception then
    assert sqlerrm = 'Add a note about the missing items.';
  end;
  perform public.close_laundry_batch(batch, returns_snapshot, 'Laundry is following up.');
  assert (select discrepancy_note from public.laundry_batches where id = batch) = 'Laundry is following up.';
  begin
    perform public.set_laundry_return(batch, shirt, first_return, 3, today);
    raise sqlstate 'P0004' using message = 'closed batch was changed';
  exception when raise_exception then
    assert sqlerrm = 'This batch is already closed.';
  end;
end;
$$;

do $$
declare
  household constant uuid := 'b0000000-0000-4000-8000-000000000001';
  batch constant uuid := 'c0000000-0000-4000-8000-000000000003';
  today constant date := (now() at time zone 'Asia/Jakarta')::date;
  towel uuid;
  snapshot jsonb;
begin
  perform public.create_laundry_batch(batch, household, today - 1, '[{"name":"Towel","quantity":1}]');
  select id into strict towel from public.laundry_items where batch_id = batch;
  begin
    perform public.set_laundry_return(batch, towel, '{}', 1, today - 2);
    raise sqlstate 'P0004' using message = 'return before drop-off was accepted';
  exception when raise_exception then
    assert sqlerrm = 'Choose a return date between drop-off and today.';
  end;
  snapshot := jsonb_build_object(towel, public.set_laundry_return(batch, towel, '{}', 1, today));
  perform public.close_laundry_batch(batch, snapshot, null);
  perform public.close_laundry_batch(batch, snapshot, null);
  assert (select closed_at is not null and discrepancy_note is null
    from public.laundry_batches where id = batch), 'complete batch did not close';
end;
$$;

set local request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000003';

do $$
declare
  batch constant uuid := 'c0000000-0000-4000-8000-000000000001';
begin
  assert not exists (select 1 from public.laundry_batches where id = batch);
  assert not exists (select 1 from public.laundry_items where batch_id = batch);
  assert (select count(*) from public.laundry_owners('b0000000-0000-4000-8000-000000000001')) = 0;
  begin
    perform public.close_laundry_batch(batch, '{}', 'Outsider');
    raise sqlstate 'P0004' using message = 'non-member modified batch';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
