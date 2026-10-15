-- =====================================================================
-- DB 규칙·권한 테스트 (pgTAP)
--   supabase test db   또는   scripts/test-db-local.sh
-- =====================================================================
begin;
select plan(41);

-- ---------------------------------------------------------------------
-- 테스트용 사용자 (트랜잭션 끝에서 롤백)
-- ---------------------------------------------------------------------
create or replace function pg_temp.login(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_id::text, true);
end $$;
create or replace function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- 시드 데이터와 겹치지 않도록 테스트 전용 사용자 생성
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('aaaaaaaa-0000-4000-a000-000000000002', 't.eng@ablearn.kr',    '{"name":"테스트엔지니어"}', '{"role":"engineer"}'),
  ('aaaaaaaa-0000-4000-a000-000000000003', 't.viewer@ablearn.kr', '{"name":"테스트조회자"}',   '{}');

select is((select role::text from public.profiles where email = 't.eng@ablearn.kr'), 'engineer',
          'app_metadata.role 로 엔지니어 프로필 생성');
select is((select role::text from public.profiles where email = 't.viewer@ablearn.kr'), 'viewer',
          '역할 지정이 없으면 viewer');
select throws_ok(
  $$ insert into auth.users (id, email) values (gen_random_uuid(), 'outsider@gmail.com') $$,
  '23514', null, '회사 도메인이 아닌 이메일은 가입 불가');

-- 관리자: 시드의 admin (없으면 생성)
insert into auth.users (id, email, raw_app_meta_data)
select 'aaaaaaaa-0000-4000-a000-000000000001', 't.admin@ablearn.kr', '{"role":"admin"}'
 where not exists (select 1 from public.profiles where role = 'admin');
create temporary table t_ids as
select (select id from public.profiles where role = 'admin' and is_active order by created_at limit 1) as admin_id,
       'aaaaaaaa-0000-4000-a000-000000000002'::uuid as eng_id,
       'aaaaaaaa-0000-4000-a000-000000000003'::uuid as viewer_id;
grant select on t_ids to authenticated;

-- ---------------------------------------------------------------------
-- 고객사: 관리자만 쓰기
-- ---------------------------------------------------------------------
select pg_temp.login((select admin_id from t_ids));
insert into public.customers (id, name) values ('cccccccc-0000-4000-a000-000000000001', '테스트고객');
insert into public.contracts (id, customer_id, tier) values ('dddddddd-0000-4000-a000-000000000001', 'cccccccc-0000-4000-a000-000000000001', 'Premium');
insert into public.contract_sla (contract_id, priority, resolve_hours) values ('dddddddd-0000-4000-a000-000000000001', '높음', 8);
select ok(exists (select 1 from public.customers where name = '테스트고객'), '관리자는 고객사 등록 가능');

select pg_temp.login((select eng_id from t_ids));
select throws_ok($$ insert into public.customers (name) values ('엔지니어고객') $$, '42501', null,
                 '엔지니어는 고객사 등록 불가');
update public.customers set memo = '변경 시도' where id = 'cccccccc-0000-4000-a000-000000000001';
select is((select memo from public.customers where id = 'cccccccc-0000-4000-a000-000000000001'), null,
          '엔지니어의 고객사 수정은 반영되지 않음');

-- ---------------------------------------------------------------------
-- 이슈 등록: 채번, SLA 기한, 자동 배정 상태, 이력
-- ---------------------------------------------------------------------
insert into public.issues (id, customer_id, title, symptom, product, priority, assignee_id)
values ('eeeeeeee-0000-4000-a000-000000000001', 'cccccccc-0000-4000-a000-000000000001',
        '야간 백업 실패 저장소 용량 부족', '백업 작업이 저장소 공간 부족으로 실패', '백업 어플라이언스', '높음',
        (select eng_id from t_ids));

select matches((select issue_no from public.issues where id = 'eeeeeeee-0000-4000-a000-000000000001'),
               '^ISS-[0-9]{4}-[0-9]{4}$', '이슈 번호 ISS-YYMM-0001 형식');
select is((select status::text from public.issues where id = 'eeeeeeee-0000-4000-a000-000000000001'), '배정',
          '담당자를 지정해 등록하면 상태가 배정');
select is((select due_at - created_at from public.issues where id = 'eeeeeeee-0000-4000-a000-000000000001'),
          interval '8 hours', '처리 기한 = 접수 + 계약 SLA(높음 8시간)');
select ok((select first_response_at is not null from public.issues where id = 'eeeeeeee-0000-4000-a000-000000000001'),
          '배정 시 첫 응답 시각 기록');
select is((select count(*)::int from public.issue_events where issue_id = 'eeeeeeee-0000-4000-a000-000000000001'), 2,
          '접수·배정 이력 자동 기록');

-- 두 번째 이슈는 번호가 증가
insert into public.issues (id, customer_id, title, priority)
values ('eeeeeeee-0000-4000-a000-000000000002', 'cccccccc-0000-4000-a000-000000000001', '두번째 이슈', '보통');
select cmp_ok((select issue_no from public.issues where id = 'eeeeeeee-0000-4000-a000-000000000002'), '>',
              (select issue_no from public.issues where id = 'eeeeeeee-0000-4000-a000-000000000001'), '이슈 번호 순번 증가');
select is((select due_at - created_at from public.issues where id = 'eeeeeeee-0000-4000-a000-000000000002'),
          interval '72 hours', '계약에 없는 우선순위는 기본 SLA(보통 72시간)');
select is((select status::text from public.issues where id = 'eeeeeeee-0000-4000-a000-000000000002'), '접수',
          '담당자 없이 등록하면 접수');

-- 우선순위 변경 → 기한 재계산
update public.issues set priority = '높음' where id = 'eeeeeeee-0000-4000-a000-000000000002';
select is((select due_at - created_at from public.issues where id = 'eeeeeeee-0000-4000-a000-000000000002'),
          interval '8 hours', '우선순위 변경 시 기한 재계산');
-- 기한 직접 지정 → 수동 플래그, 이후 우선순위 변경해도 유지
update public.issues set due_at = created_at + interval '100 hours' where id = 'eeeeeeee-0000-4000-a000-000000000002';
update public.issues set priority = '낮음' where id = 'eeeeeeee-0000-4000-a000-000000000002';
select is((select due_at - created_at from public.issues where id = 'eeeeeeee-0000-4000-a000-000000000002'),
          interval '100 hours', '수동 지정한 기한은 우선순위 변경에도 유지');

-- ---------------------------------------------------------------------
-- 상태 전이 규칙
-- ---------------------------------------------------------------------
select throws_ok($$ update public.issues set status = '해결' where id = 'eeeeeeee-0000-4000-a000-000000000001' $$,
                 '23514', '해결 기록(원인·조치)을 먼저 작성하세요', '해결 기록 없이 해결 처리 불가');
select throws_ok($$ update public.issues set status = '종료' where id = 'eeeeeeee-0000-4000-a000-000000000001' $$,
                 '42501', '종료는 관리자만 할 수 있습니다', '엔지니어는 종료 불가');

-- SLA 일시정지: 2시간 보류 후 재개하면 기한 2시간 연장
update public.issues set status = '보류' where id = 'eeeeeeee-0000-4000-a000-000000000001';
select ok((select sla_paused_at is not null from public.issues where id = 'eeeeeeee-0000-4000-a000-000000000001'),
          '보류 시 SLA 정지 시각 기록');
select pg_temp.logout();
update public.issues set sla_paused_at = now() - interval '2 hours' where id = 'eeeeeeee-0000-4000-a000-000000000001';
select pg_temp.login((select eng_id from t_ids));
update public.issues set status = '진행' where id = 'eeeeeeee-0000-4000-a000-000000000001';
select is((select due_at - created_at from public.issues where id = 'eeeeeeee-0000-4000-a000-000000000001'),
          interval '10 hours', '재개 시 정지 시간(2시간)만큼 기한 연장');
select is((select sla_paused_total from public.issues where id = 'eeeeeeee-0000-4000-a000-000000000001'),
          interval '2 hours', '누적 정지 시간 기록');

-- 해결 기록 → 상태 해결
insert into public.issue_resolutions (issue_id, cause, action)
values ('eeeeeeee-0000-4000-a000-000000000001', '보존 정책 기본값 90일로 백업 누적', '보존 기간 30일로 변경 후 재실행');
select is((select status::text from public.issues where id = 'eeeeeeee-0000-4000-a000-000000000001'), '해결',
          '해결 기록 저장 시 상태 해결');
select is((select resolved_by from public.issue_resolutions where issue_id = 'eeeeeeee-0000-4000-a000-000000000001'),
          (select eng_id from t_ids), '해결자 = 작성자');
select ok(exists (select 1 from public.issue_events where issue_id = 'eeeeeeee-0000-4000-a000-000000000001' and type = 'resolve'),
          '해결 이력 기록');

-- ---------------------------------------------------------------------
-- 처리 이력: 메모만 직접 작성, 수정·삭제 불가
-- ---------------------------------------------------------------------
insert into public.issue_events (issue_id, type, actor_id, message)
values ('eeeeeeee-0000-4000-a000-000000000001', 'note', (select eng_id from t_ids), '고객 통화 완료');
select ok(exists (select 1 from public.issue_events where message = '고객 통화 완료'), '엔지니어 메모 작성');
select throws_ok($$ insert into public.issue_events (issue_id, type, actor_id, message)
                    values ('eeeeeeee-0000-4000-a000-000000000001', 'status', auth.uid(), '조작') $$,
                 '42501', null, '메모 외 이력은 직접 작성 불가');
update public.issue_events set message = '변조' where issue_id = 'eeeeeeee-0000-4000-a000-000000000001';
select is((select count(*)::int from public.issue_events where message = '변조'), 0, '이력 수정 불가');
delete from public.issue_events where issue_id = 'eeeeeeee-0000-4000-a000-000000000001';
select cmp_ok((select count(*)::int from public.issue_events where issue_id = 'eeeeeeee-0000-4000-a000-000000000001'), '>', 0,
              '이력 삭제 불가');

-- ---------------------------------------------------------------------
-- 유사 이슈 추천
-- ---------------------------------------------------------------------
select ok(exists (select 1 from public.match_similar_issues('백업 실패 저장소 용량', '백업 어플라이언스')
                   where id = 'eeeeeeee-0000-4000-a000-000000000001'),
          '비슷한 증상으로 해결 사례가 추천됨');
select ok(not exists (select 1 from public.match_similar_issues('백업 실패 저장소 용량', null, null, null,
                                                                'eeeeeeee-0000-4000-a000-000000000001')
                       where id = 'eeeeeeee-0000-4000-a000-000000000001'),
          '현재 이슈는 추천에서 제외');
select ok(not exists (select 1 from public.match_similar_issues('그래픽카드 팬 소음', null)
                       where id = 'eeeeeeee-0000-4000-a000-000000000001'),
          '관련 없는 증상은 추천되지 않음');

-- ---------------------------------------------------------------------
-- 관리자: 종료, 소프트 삭제
-- ---------------------------------------------------------------------
select pg_temp.login((select admin_id from t_ids));
update public.issues set status = '종료' where id = 'eeeeeeee-0000-4000-a000-000000000001';
select is((select status::text from public.issues where id = 'eeeeeeee-0000-4000-a000-000000000001'), '종료',
          '관리자는 종료 가능');
select ok((select closed_at is not null from public.issues where id = 'eeeeeeee-0000-4000-a000-000000000001'),
          '종료 시각 기록');

select pg_temp.login((select eng_id from t_ids));
select throws_ok($$ update public.issues set deleted_at = now() where id = 'eeeeeeee-0000-4000-a000-000000000002' $$,
                 '42501', null, '엔지니어는 이슈 삭제 불가');

-- ---------------------------------------------------------------------
-- 조회자 / 비로그인
-- ---------------------------------------------------------------------
select pg_temp.login((select viewer_id from t_ids));
select ok(exists (select 1 from public.issues where id = 'eeeeeeee-0000-4000-a000-000000000002'), '조회자는 이슈 조회 가능');
select throws_ok($$ insert into public.issues (customer_id, title) values ('cccccccc-0000-4000-a000-000000000001', '조회자 등록') $$,
                 '42501', null, '조회자는 이슈 등록 불가');
select throws_ok($$ update public.profiles set role = 'admin' where id = auth.uid() $$,
                 '42501', null, '본인 역할 변경 불가');

select pg_temp.logout();
set local role anon;
select throws_ok($$ select count(*) from public.issues $$, '42501', null, '비로그인은 이슈 접근 불가');
reset role;

-- ---------------------------------------------------------------------
-- 마지막 관리자 보호
-- ---------------------------------------------------------------------
select pg_temp.logout();
update public.profiles set role = 'engineer' where role = 'admin' and id <> (select admin_id from t_ids);
select throws_ok(format($$ update public.profiles set role = 'engineer' where id = %L $$, (select admin_id from t_ids)),
                 '23514', null, '마지막 관리자는 역할 변경 불가');

-- RPC 기본 동작
select pg_temp.login((select admin_id from t_ids));
select ok((public.dashboard_summary() ->> 'open')::int >= 1, 'dashboard_summary 동작');
select is((public.customer_stats('cccccccc-0000-4000-a000-000000000001') ->> 'total')::int, 2, 'customer_stats 동작');

select * from finish();
rollback;
