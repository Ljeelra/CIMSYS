-- =====================================================================
-- 관리자가 만든 계정(임시 비밀번호)은 첫 로그인 때 비밀번호 변경을 강제
--   profiles.must_change_password = true 이면 웹이 비밀번호 변경 화면만 보여준다.
--   플래그는 Edge Function(change-password)이 비밀번호를 바꾼 뒤에만 해제한다.
-- =====================================================================

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is '첫 로그인(또는 관리자 재설정) 후 비밀번호 변경 필요';

-- 신규 사용자: app_metadata.must_change_password 를 그대로 반영
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

  insert into public.profiles (id, name, email, role, must_change_password)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    v_role,
    coalesce((new.raw_app_meta_data ->> 'must_change_password')::boolean, false)
  );
  return new;
end $$;

-- 본인은 역할·활성 여부·이메일·비밀번호 변경 플래그를 바꿀 수 없음
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.email is distinct from old.email
       or new.must_change_password is distinct from old.must_change_password then
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
