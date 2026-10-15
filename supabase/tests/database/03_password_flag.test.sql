-- 비밀번호 변경 강제 플래그 테스트
begin;
select plan(4);

create or replace function pg_temp.login(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_id)::text, true);
  perform set_config('request.jwt.claim.sub', p_id::text, true);
end $$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('cccccccc-1111-4000-a000-000000000001', 'p.temp@unipoint.co.kr', '{"role":"engineer","must_change_password":true}'),
  ('cccccccc-1111-4000-a000-000000000002', 'p.normal@ablearn.kr',   '{"role":"engineer"}');

select is((select must_change_password from public.profiles where id = 'cccccccc-1111-4000-a000-000000000001'), true,
          '임시 비밀번호 계정은 변경 필요 플래그가 켜짐');
select is((select must_change_password from public.profiles where id = 'cccccccc-1111-4000-a000-000000000002'), false,
          '일반 계정은 플래그 꺼짐');

select pg_temp.login('cccccccc-1111-4000-a000-000000000001');
select throws_ok($$ update public.profiles set must_change_password = false where id = auth.uid() $$,
                 '42501', null, '본인이 플래그를 직접 해제할 수 없음');
update public.profiles set phone = '010-1111-2222' where id = auth.uid();
select is((select phone from public.profiles where id = 'cccccccc-1111-4000-a000-000000000001'), '010-1111-2222',
          '본인 연락처 수정은 가능');

select * from finish();
rollback;
