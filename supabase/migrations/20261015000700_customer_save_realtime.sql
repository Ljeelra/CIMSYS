-- =====================================================================
-- 고객사 저장 RPC (기본정보·담당자·장비·현재 계약·SLA를 한 트랜잭션으로)
-- + Realtime 게시 대상 등록
-- =====================================================================

-- p 형식:
-- {
--   "id": uuid|null, "name": "...", "code": "...", "industry": "...", "address": "...",
--   "account_manager": "...", "owner_engineer_id": uuid|null, "memo": "...", "is_archived": false,
--   "contacts": [{"id": uuid|null, "name": "...", "role": "...", "phone": "...", "email": "...", "is_primary": bool}],
--   "assets":   [{"id": uuid|null, "product": "...", "model_version": "...", "qty": 1, "license_serial": "...",
--                 "installed_at": "YYYY-MM-DD", "environment": "...", "note": "..."}],
--   "contract": {"tier": "...", "start_date": "...", "end_date": "...", "response_hours": 4,
--                "inspection_cycle": "...", "notes": "...", "sla": {"긴급": 4, "높음": 24, "보통": 72, "낮음": 168}} | null
-- }
create or replace function public.save_customer(p jsonb)
returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_id       uuid := nullif(p ->> 'id', '')::uuid;
  v_contract uuid;
  v_keep     uuid[];
  c          jsonb := p -> 'contract';
  k          text;
begin
  if not public.is_admin() then
    raise exception '고객사 정보는 관리자만 수정할 수 있습니다' using errcode = '42501';
  end if;
  if coalesce(trim(p ->> 'name'), '') = '' then
    raise exception '고객사명을 입력하세요' using errcode = 'check_violation';
  end if;

  if v_id is null then
    insert into public.customers (name, code, industry, address, account_manager, owner_engineer_id, memo, is_archived)
    values (trim(p ->> 'name'), p ->> 'code', p ->> 'industry', p ->> 'address', p ->> 'account_manager',
            nullif(p ->> 'owner_engineer_id', '')::uuid, p ->> 'memo', coalesce((p ->> 'is_archived')::boolean, false))
    returning id into v_id;
  else
    update public.customers
       set name = trim(p ->> 'name'), code = p ->> 'code', industry = p ->> 'industry', address = p ->> 'address',
           account_manager = p ->> 'account_manager', owner_engineer_id = nullif(p ->> 'owner_engineer_id', '')::uuid,
           memo = p ->> 'memo', is_archived = coalesce((p ->> 'is_archived')::boolean, false)
     where id = v_id;
    if not found then raise exception '고객사를 찾을 수 없습니다' using errcode = 'no_data_found'; end if;
  end if;

  -- 담당자: 목록에 없는 것은 삭제, 있는 것은 수정, id 없는 것은 추가
  if p ? 'contacts' then
    select coalesce(array_agg((x ->> 'id')::uuid), '{}') into v_keep
      from jsonb_array_elements(p -> 'contacts') x where nullif(x ->> 'id', '') is not null;
    delete from public.customer_contacts where customer_id = v_id and not (id = any (v_keep));
    insert into public.customer_contacts (id, customer_id, name, role, phone, email, is_primary)
    select coalesce(nullif(x ->> 'id', '')::uuid, gen_random_uuid()), v_id, trim(x ->> 'name'), x ->> 'role',
           x ->> 'phone', x ->> 'email', coalesce((x ->> 'is_primary')::boolean, false)
      from jsonb_array_elements(p -> 'contacts') x
     where coalesce(trim(x ->> 'name'), '') <> ''
    on conflict (id) do update
       set name = excluded.name, role = excluded.role, phone = excluded.phone,
           email = excluded.email, is_primary = excluded.is_primary;
  end if;

  -- 장비
  if p ? 'assets' then
    select coalesce(array_agg((x ->> 'id')::uuid), '{}') into v_keep
      from jsonb_array_elements(p -> 'assets') x where nullif(x ->> 'id', '') is not null;
    delete from public.customer_assets where customer_id = v_id and not (id = any (v_keep));
    insert into public.customer_assets (id, customer_id, product, model_version, qty, license_serial, installed_at, environment, note)
    select coalesce(nullif(x ->> 'id', '')::uuid, gen_random_uuid()), v_id, trim(x ->> 'product'), x ->> 'model_version',
           nullif(x ->> 'qty', '')::int, x ->> 'license_serial', nullif(x ->> 'installed_at', '')::date,
           x ->> 'environment', x ->> 'note'
      from jsonb_array_elements(p -> 'assets') x
     where coalesce(trim(x ->> 'product'), '') <> ''
    on conflict (id) do update
       set product = excluded.product, model_version = excluded.model_version, qty = excluded.qty,
           license_serial = excluded.license_serial, installed_at = excluded.installed_at,
           environment = excluded.environment, note = excluded.note;
  end if;

  -- 현재 계약 + SLA
  if c is not null and jsonb_typeof(c) = 'object' then
    select id into v_contract from public.contracts where customer_id = v_id and is_current;
    if v_contract is null then
      insert into public.contracts (customer_id, tier, start_date, end_date, response_hours, inspection_cycle, notes, is_current)
      values (v_id, c ->> 'tier', nullif(c ->> 'start_date', '')::date, nullif(c ->> 'end_date', '')::date,
              nullif(c ->> 'response_hours', '')::int, c ->> 'inspection_cycle', c ->> 'notes', true)
      returning id into v_contract;
    else
      update public.contracts
         set tier = c ->> 'tier', start_date = nullif(c ->> 'start_date', '')::date,
             end_date = nullif(c ->> 'end_date', '')::date, response_hours = nullif(c ->> 'response_hours', '')::int,
             inspection_cycle = c ->> 'inspection_cycle', notes = c ->> 'notes'
       where id = v_contract;
    end if;

    if c ? 'sla' then
      for k in select jsonb_object_keys(c -> 'sla') loop
        if nullif(c -> 'sla' ->> k, '') is null then
          delete from public.contract_sla where contract_id = v_contract and priority = k::public.issue_priority;
        else
          insert into public.contract_sla (contract_id, priority, resolve_hours)
          values (v_contract, k::public.issue_priority, (c -> 'sla' ->> k)::int)
          on conflict (contract_id, priority) do update set resolve_hours = excluded.resolve_hours;
        end if;
      end loop;
    end if;
  end if;

  return v_id;
end $$;

grant execute on function public.save_customer(jsonb) to authenticated;
revoke execute on function public.save_customer(jsonb) from public, anon;

-- Realtime: 이슈·이력·해결·일정 변경을 화면에 즉시 반영 (DASH-05)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.issues, public.issue_events,
      public.issue_resolutions, public.issue_schedules, public.notifications;
  end if;
end $$;
