-- =====================================================================
-- 함수·트리거 — 업무 규칙은 어느 경로(웹·Edge Function·SQL)로 쓰든 DB에서 강제
-- PRD v1.2 §7.5
-- =====================================================================

-- ---------------------------------------------------------------------
-- 권한 헬퍼
-- ---------------------------------------------------------------------
create or replace function public.app_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.app_role() = 'admin', false) $$;

create or replace function public.is_writer()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.app_role() in ('admin', 'engineer'), false) $$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.app_role() is not null $$;

create or replace function public.profile_name(p_id uuid)
returns text language sql stable security definer set search_path = ''
as $$ select coalesce((select name from public.profiles where id = p_id), '미배정') $$;

create or replace function public.kst(ts timestamptz)
returns text language sql immutable set search_path = ''
as $$ select to_char(ts at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') $$;

-- ---------------------------------------------------------------------
-- 공통: updated_at / updated_by
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.touch_updated_by()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger customers_touch before update on public.customers
  for each row execute function public.touch_updated_by();
create trigger contracts_touch before update on public.contracts
  for each row execute function public.touch_updated_at();
create trigger resolutions_touch before update on public.issue_resolutions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 신규 사용자 → profiles (회사 도메인만 허용, 첫 사용자는 관리자)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_domains text[];
  v_domain  text := lower(split_part(new.email, '@', 2));
  v_role    public.user_role;
begin
  select array_remove(string_to_array(replace(lower(value), ' ', ''), ','), '')
    into v_domains
    from public.app_settings where key = 'allowed_email_domains';

  if coalesce(array_length(v_domains, 1), 0) > 0 and not (v_domain = any (v_domains)) then
    raise exception '허용되지 않은 이메일 도메인입니다: %', v_domain using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.profiles where role = 'admin') then
    v_role := 'admin';                                   -- 최초 사용자 = 관리자
  else
    v_role := coalesce((new.raw_app_meta_data ->> 'role')::public.user_role, 'viewer');
  end if;

  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    v_role
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- 본인은 역할·활성 여부·이메일을 바꿀 수 없고, 마지막 관리자는 없앨 수 없음
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.email is distinct from old.email then
      raise exception '역할·활성 여부는 관리자만 변경할 수 있습니다' using errcode = '42501';
    end if;
  end if;

  if old.role = 'admin' and old.is_active and (new.role <> 'admin' or not new.is_active)
     and not exists (select 1 from public.profiles
                     where role = 'admin' and is_active and id <> old.id) then
    raise exception '마지막 관리자는 역할을 바꾸거나 비활성화할 수 없습니다' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------
-- 계약: 고객사당 현재 계약 1건 유지
-- ---------------------------------------------------------------------
create or replace function public.contracts_single_current()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.is_current then
    update public.contracts set is_current = false
     where customer_id = new.customer_id and id <> new.id and is_current;
  end if;
  return new;
end $$;

create trigger contracts_single_current before insert or update of is_current on public.contracts
  for each row execute function public.contracts_single_current();

-- 이슈가 있는 고객사는 삭제 대신 보관
create or replace function public.guard_customer_delete()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.issues where customer_id = old.id) then
    raise exception '이슈 이력이 있는 고객사는 삭제할 수 없습니다. 보관 처리하세요.' using errcode = 'foreign_key_violation';
  end if;
  return old;
end $$;

create trigger customers_guard_delete before delete on public.customers
  for each row execute function public.guard_customer_delete();

-- ---------------------------------------------------------------------
-- SLA
-- ---------------------------------------------------------------------
-- 고객사 현재 계약의 우선순위별 해결 시간 (없으면 기본값)
create or replace function public.sla_hours(p_customer uuid, p_priority public.issue_priority)
returns int language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select s.resolve_hours
       from public.contracts c
       join public.contract_sla s on s.contract_id = c.id
      where c.customer_id = p_customer and c.is_current and s.priority = p_priority),
    (select (value::jsonb ->> p_priority::text)::int
       from public.app_settings where key = 'default_sla_hours'),
    72)
$$;

create or replace function public.issue_search_text(p_title text, p_symptom text, p_product text, p_tags text[])
returns text language sql immutable set search_path = ''
as $$
  select lower(concat_ws(' ', p_title, p_symptom, p_product, array_to_string(p_tags, ' ')))
$$;

-- ---------------------------------------------------------------------
-- 이슈 BEFORE INSERT: 채번, SLA 기한, 자동 배정 상태, 검색 텍스트
-- ---------------------------------------------------------------------
create or replace function public.issues_before_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_period text;
  v_no     int;
begin
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := new.created_at;

  if new.issue_no is null then
    v_period := to_char(new.created_at at time zone 'Asia/Seoul', 'YYMM');
    insert into public.issue_no_counters as c (period, last_no) values (v_period, 1)
      on conflict (period) do update set last_no = c.last_no + 1
      returning last_no into v_no;
    new.issue_no := 'ISS-' || v_period || '-' || lpad(v_no::text, 4, '0');
  end if;

  if new.asset_id is not null and coalesce(new.product, '') = '' then
    select product into new.product from public.customer_assets where id = new.asset_id;
  end if;
  if new.reporter_contact_id is not null and coalesce(new.reporter_name, '') = '' then
    select name into new.reporter_name from public.customer_contacts where id = new.reporter_contact_id;
  end if;

  if new.assignee_id is not null then
    if new.status = '접수' then new.status := '배정'; end if;
    new.first_response_at := coalesce(new.first_response_at, now());
  end if;

  if new.due_at is not null then
    new.due_manual := true;
  else
    new.due_manual := false;
    new.due_at := new.created_at + make_interval(hours => public.sla_hours(new.customer_id, new.priority));
  end if;

  if new.status in ('보류', '고객확인대기') then new.sla_paused_at := now(); end if;
  if new.status in ('해결', '종료') then new.resolved_at := coalesce(new.resolved_at, now()); end if;
  if new.status = '종료' then new.closed_at := coalesce(new.closed_at, now()); end if;

  new.search_text := public.issue_search_text(new.title, new.symptom, new.product, new.tags);
  return new;
end $$;

create trigger issues_before_insert before insert on public.issues
  for each row execute function public.issues_before_insert();

-- ---------------------------------------------------------------------
-- 이슈 BEFORE UPDATE: 상태 전이 규칙, SLA 일시정지, 기한 재계산
-- ---------------------------------------------------------------------
create or replace function public.issues_before_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_paused   constant public.issue_status[] := array['보류', '고객확인대기']::public.issue_status[];
  v_done     constant public.issue_status[] := array['해결', '종료']::public.issue_status[];
  v_user_due boolean := new.due_at is distinct from old.due_at;
  v_delta    interval;
begin
  -- 변경 불가 컬럼
  new.issue_no   := old.issue_no;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);

  -- 삭제(soft delete)·복구는 관리자만
  if new.deleted_at is distinct from old.deleted_at and auth.uid() is not null and not public.is_admin() then
    raise exception '이슈 삭제는 관리자만 할 수 있습니다' using errcode = '42501';
  end if;

  -- 담당자 변경에 따른 상태 자동 전환
  if new.assignee_id is distinct from old.assignee_id and new.status = old.status then
    if new.assignee_id is not null and new.status = '접수' then new.status := '배정'; end if;
    if new.assignee_id is null and new.status = '배정' then new.status := '접수'; end if;
  end if;

  if new.first_response_at is null and (new.assignee_id is not null or new.status <> '접수') then
    new.first_response_at := now();
  end if;

  -- 상태 전이
  if new.status is distinct from old.status then
    if new.status = '종료' and auth.uid() is not null and not public.is_admin() then
      raise exception '종료는 관리자만 할 수 있습니다' using errcode = '42501';
    end if;
    if new.status = '해결' and not exists (select 1 from public.issue_resolutions where issue_id = new.id) then
      raise exception '해결 기록(원인·조치)을 먼저 작성하세요' using errcode = 'check_violation';
    end if;

    -- SLA 일시정지 / 재개
    if new.status = any (v_paused) and not (old.status = any (v_paused)) then
      new.sla_paused_at := now();
    elsif old.status = any (v_paused) and not (new.status = any (v_paused)) and old.sla_paused_at is not null then
      v_delta := now() - old.sla_paused_at;
      new.sla_paused_total := old.sla_paused_total + v_delta;
      new.due_at := new.due_at + v_delta;
      new.sla_paused_at := null;
    end if;

    -- 해결·종료 시각, 재오픈
    if new.status = '해결' then
      new.resolved_at := coalesce(new.resolved_at, now());
      new.closed_at := null;
    elsif new.status = '종료' then
      new.resolved_at := coalesce(new.resolved_at, now());
      new.closed_at := now();
    elsif old.status = any (v_done) then
      new.resolved_at := null;
      new.closed_at := null;
    end if;
  end if;

  -- 처리 기한: 직접 바꾸면 수동 지정, 아니면 우선순위·고객사 변경 시 재계산
  if v_user_due then
    new.due_manual := true;
  elsif (new.priority is distinct from old.priority or new.customer_id is distinct from old.customer_id
         or (old.due_manual and not new.due_manual))
        and not new.due_manual then
    new.due_at := old.created_at
                  + make_interval(hours => public.sla_hours(new.customer_id, new.priority))
                  + new.sla_paused_total;
  end if;

  new.search_text := public.issue_search_text(new.title, new.symptom, new.product, new.tags);
  return new;
end $$;

create trigger issues_before_update before update on public.issues
  for each row execute function public.issues_before_update();

-- ---------------------------------------------------------------------
-- 이슈 AFTER INSERT/UPDATE: 처리 이력 자동 기록 + 배정 알림
-- ---------------------------------------------------------------------
create or replace function public.issues_log_events()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_msg   text;
begin
  if tg_op = 'INSERT' then
    insert into public.issue_events (issue_id, type, actor_id, message, payload)
    values (new.id, 'create', v_actor, '이슈 접수 (' || new.channel || ')',
            jsonb_build_object('status', new.status, 'priority', new.priority));
    if new.assignee_id is not null then
      insert into public.issue_events (issue_id, type, actor_id, message, payload)
      values (new.id, 'assign', v_actor, public.profile_name(new.assignee_id) || ' 배정',
              jsonb_build_object('to', new.assignee_id));
    end if;
  else
    if new.status is distinct from old.status then
      v_msg := '상태 변경: ' || old.status || ' → ' || new.status;
      if old.status in ('해결', '종료') and new.status not in ('해결', '종료') then
        v_msg := v_msg || ' (재오픈)';
      end if;
      insert into public.issue_events (issue_id, type, actor_id, message, payload)
      values (new.id, 'status', v_actor, v_msg, jsonb_build_object('from', old.status, 'to', new.status));
    end if;

    if new.assignee_id is distinct from old.assignee_id then
      insert into public.issue_events (issue_id, type, actor_id, message, payload)
      values (new.id, 'assign', v_actor,
              '담당 ' || public.profile_name(old.assignee_id) || ' → ' || public.profile_name(new.assignee_id),
              jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id));
    end if;

    if new.priority is distinct from old.priority then
      insert into public.issue_events (issue_id, type, actor_id, message, payload)
      values (new.id, 'edit', v_actor, '우선순위 ' || old.priority || ' → ' || new.priority,
              jsonb_build_object('from', old.priority, 'to', new.priority));
    end if;

    if new.due_at is distinct from old.due_at and new.due_manual and not (old.status in ('보류', '고객확인대기')) then
      insert into public.issue_events (issue_id, type, actor_id, message, payload)
      values (new.id, 'edit', v_actor, '처리 기한 변경: ' || public.kst(new.due_at),
              jsonb_build_object('from', old.due_at, 'to', new.due_at));
    end if;

    if (new.title, new.symptom, new.product, new.category, new.tags, new.customer_id, new.channel)
       is distinct from (old.title, old.symptom, old.product, old.category, old.tags, old.customer_id, old.channel) then
      insert into public.issue_events (issue_id, type, actor_id, message)
      values (new.id, 'edit', v_actor, '이슈 내용 수정');
    end if;

    if new.deleted_at is distinct from old.deleted_at then
      insert into public.issue_events (issue_id, type, actor_id, message)
      values (new.id, 'edit', v_actor, case when new.deleted_at is null then '삭제 취소' else '이슈 삭제' end);
    end if;
  end if;

  -- 배정 알림 (본인이 스스로 맡은 경우 제외)
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and new.assignee_id is distinct from v_actor then
    insert into public.notifications (user_id, issue_id, kind, message)
    values (new.assignee_id, new.id, 'assigned', new.issue_no || ' ' || new.title || ' 이슈가 배정되었습니다');
  end if;
  return null;
end $$;

create trigger issues_log_events after insert or update on public.issues
  for each row execute function public.issues_log_events();

-- ---------------------------------------------------------------------
-- 해결 기록 → 이슈 상태 '해결' + 이력
-- ---------------------------------------------------------------------
create or replace function public.resolutions_before_write()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.issue_id    := old.issue_id;
    new.resolved_at := old.resolved_at;
    new.resolved_by := old.resolved_by;
  else
    new.resolved_by := coalesce(new.resolved_by, auth.uid());
  end if;
  return new;
end $$;

create trigger resolutions_before_write before insert or update on public.issue_resolutions
  for each row execute function public.resolutions_before_write();

create or replace function public.resolutions_after_write()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.issues
       set status = '해결', resolved_at = new.resolved_at
     where id = new.issue_id and status not in ('해결', '종료');
    insert into public.issue_events (issue_id, type, actor_id, message)
    values (new.issue_id, 'resolve', auth.uid(), '해결 기록 · 원인: ' || new.cause);
  else
    insert into public.issue_events (issue_id, type, actor_id, message)
    values (new.issue_id, 'edit', auth.uid(), '해결 내용 수정');
  end if;
  return null;
end $$;

create trigger resolutions_after_write after insert or update on public.issue_resolutions
  for each row execute function public.resolutions_after_write();

-- ---------------------------------------------------------------------
-- 일정 → 이력, 첫 일정이면 '진행' 전환 (SCH-04)
-- ---------------------------------------------------------------------
create or replace function public.schedules_after_write()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if r.issue_id is null then return null; end if;

  if tg_op = 'INSERT' then
    insert into public.issue_events (issue_id, type, actor_id, message, payload)
    values (r.issue_id, 'schedule', auth.uid(),
            '일정 등록: ' || r.date || coalesce(' ' || to_char(r.start_time, 'HH24:MI'), '') || ' ' || r.type
              || ' (' || public.profile_name(r.engineer_id) || ')',
            jsonb_build_object('schedule_id', r.id));
    if r.engineer_id is not null then
      update public.issues
         set status = '진행', assignee_id = coalesce(assignee_id, r.engineer_id)
       where id = r.issue_id and status in ('접수', '배정');
    end if;
  elsif tg_op = 'DELETE' then
    insert into public.issue_events (issue_id, type, actor_id, message)
    values (r.issue_id, 'schedule', auth.uid(), '일정 삭제: ' || r.date || ' ' || r.type);
  end if;
  return null;
end $$;

create trigger schedules_after_write after insert or delete on public.issue_schedules
  for each row execute function public.schedules_after_write();

-- 첨부·보고서 → 이력
create or replace function public.attachments_after_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.issue_events (issue_id, type, actor_id, message)
  values (new.issue_id, 'attachment', auth.uid(), '첨부: ' || new.file_name);
  return null;
end $$;

create trigger attachments_after_insert after insert on public.issue_attachments
  for each row execute function public.attachments_after_insert();

create or replace function public.reports_after_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.issue_id is not null then
    insert into public.issue_events (issue_id, type, actor_id, message)
    values (new.issue_id, 'report', auth.uid(), '해결 보고서 발행');
  end if;
  return null;
end $$;

create trigger reports_after_insert after insert on public.reports
  for each row execute function public.reports_after_insert();

-- ---------------------------------------------------------------------
-- SLA 점검 (pg_cron 10분 주기, SLA-05) — 임박·초과 알림 1회씩
-- ---------------------------------------------------------------------
create or replace function public.sla_scan()
returns int language plpgsql security definer set search_path = ''
as $$
declare
  v_count int := 0;
  v_n     int;
begin
  -- 초과: 담당자 + 활성 관리자
  insert into public.notifications (user_id, issue_id, kind, message)
  select u.user_id, i.id, 'sla_over', i.issue_no || ' 처리 기한 초과: ' || i.title
    from public.issues i
    cross join lateral (
      select i.assignee_id as user_id where i.assignee_id is not null
      union
      select p.id from public.profiles p where p.role = 'admin' and p.is_active
    ) u
   where i.deleted_at is null
     and i.status in ('접수', '배정', '진행')
     and i.due_at < now()
  on conflict do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- 임박: 잔여 25% 미만 또는 2시간 미만 → 담당자(없으면 관리자)
  insert into public.notifications (user_id, issue_id, kind, message)
  select u.user_id, i.id, 'sla_soon', i.issue_no || ' 처리 기한 임박: ' || i.title
    from public.issues i
    cross join lateral (
      select i.assignee_id as user_id where i.assignee_id is not null
      union
      select p.id from public.profiles p where i.assignee_id is null and p.role = 'admin' and p.is_active
    ) u
   where i.deleted_at is null
     and i.status in ('접수', '배정', '진행')
     and i.due_at >= now()
     and i.due_at - now() < greatest(interval '2 hours', (i.due_at - i.created_at) * 0.25)
  on conflict do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  return v_count;
end $$;

-- 소프트 삭제 30일 경과분 영구 삭제 (ISS-13)
create or replace function public.purge_deleted_issues()
returns int language plpgsql security definer set search_path = ''
as $$
declare v_n int;
begin
  delete from public.issues where deleted_at < now() - interval '30 days';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
