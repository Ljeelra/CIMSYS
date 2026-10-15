-- save_customer RPC 테스트
begin;
select plan(7);

create or replace function pg_temp.login(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_id)::text, true);
  perform set_config('request.jwt.claim.sub', p_id::text, true);
end $$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('bbbbbbbb-0000-4000-a000-000000000002', 's.eng@ablearn.kr', '{"role":"engineer"}');
create temporary table t_admin as
  select id from public.profiles where role = 'admin' and is_active order by created_at limit 1;
grant select on t_admin to authenticated;

select pg_temp.login((select id from t_admin));
create temporary table t_c as select public.save_customer('{
  "name": "저장테스트",
  "contacts": [{"name": "홍길동", "phone": "010"}, {"name": ""}],
  "assets": [{"product": "백업", "qty": "2"}],
  "contract": {"tier": "Premium", "sla": {"긴급": 2, "높음": 8}}
}'::jsonb) as id;
grant select on t_c to authenticated;

select is((select count(*)::int from public.customer_contacts where customer_id = (select id from t_c)), 1, '빈 담당자 행은 무시');
select is((select qty from public.customer_assets where customer_id = (select id from t_c)), 2, '장비 저장');
select is(public.sla_hours((select id from t_c), '높음'), 8, '계약 SLA 저장');

-- 수정: 담당자 교체, SLA 일부 삭제
select public.save_customer(jsonb_build_object(
  'id', (select id from t_c), 'name', '저장테스트2',
  'contacts', jsonb_build_array(jsonb_build_object('name', '김철수')),
  'assets', '[]'::jsonb,
  'contract', jsonb_build_object('tier', 'Standard', 'sla', jsonb_build_object('높음', null))));
select is((select string_agg(name, ',') from public.customer_contacts where customer_id = (select id from t_c)), '김철수', '담당자 목록 교체');
select is((select count(*)::int from public.customer_assets where customer_id = (select id from t_c)), 0, '장비 삭제 반영');
select is(public.sla_hours((select id from t_c), '높음'), 24, 'SLA 삭제 시 기본값');

select pg_temp.login('bbbbbbbb-0000-4000-a000-000000000002');
select throws_ok($$ select public.save_customer('{"name":"엔지니어저장"}') $$, '42501', null, '엔지니어는 저장 불가');

select * from finish();
rollback;
