-- =====================================================================
-- 개발용 예시 데이터 (로컬 `supabase db reset` 시 자동 실행)
-- 운영(prod) DB에는 적용하지 않는다. 모든 데이터는 source = 'sample'
-- 로컬 로그인: admin@ablearn.kr / engineer1@ablearn.kr … 비밀번호 Passw0rd!
-- =====================================================================

-- ---------------------------------------------------------------------
-- 사용자 (실제 Supabase auth.users 스키마와 테스트용 스텁 모두 지원)
-- ---------------------------------------------------------------------
do $$
declare
  u record;
  has_pw boolean := exists (select 1 from information_schema.columns
                            where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password');
begin
  for u in
    select * from (values
      ('00000000-0000-4000-a000-000000000001'::uuid, 'admin@ablearn.kr',     '관리자',  'admin'),
      ('00000000-0000-4000-a000-000000000011'::uuid, 'engineer1@ablearn.kr', '김도현',  'engineer'),
      ('00000000-0000-4000-a000-000000000012'::uuid, 'engineer2@ablearn.kr', '이서윤',  'engineer'),
      ('00000000-0000-4000-a000-000000000013'::uuid, 'engineer3@ablearn.kr', '박준호',  'engineer'),
      ('00000000-0000-4000-a000-000000000014'::uuid, 'engineer4@ablearn.kr', '최하은',  'engineer'),
      ('00000000-0000-4000-a000-000000000021'::uuid, 'viewer@ablearn.kr',    '정민수',  'viewer')
    ) as t(id, email, name, role)
  loop
    if exists (select 1 from auth.users where id = u.id) then continue; end if;
    if has_pw then
      execute $q$
        insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                                raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                                confirmation_token, recovery_token, email_change_token_new, email_change)
        values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
                extensions.crypt('Passw0rd!', extensions.gen_salt('bf')), now(),
                jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', $4),
                jsonb_build_object('name', $3), now(), now(), '', '', '', '')
      $q$ using u.id, u.email, u.name, u.role;
      execute $q$
        insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (gen_random_uuid(), $1, $1::text, jsonb_build_object('sub', $1::text, 'email', $2), 'email', now(), now(), now())
      $q$ using u.id, u.email;
    else
      insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
      values (u.id, u.email, jsonb_build_object('role', u.role), jsonb_build_object('name', u.name));
    end if;
  end loop;
end $$;

update public.profiles set team = '기술지원1팀', title = '선임 엔지니어', skills = '{스토리지,백업}', color = 0, phone = '010-0000-1101' where id = '00000000-0000-4000-a000-000000000011';
update public.profiles set team = '기술지원1팀', title = '엔지니어',     skills = '{네트워크,VPN}', color = 1, phone = '010-0000-1102' where id = '00000000-0000-4000-a000-000000000012';
update public.profiles set team = '기술지원2팀', title = '엔지니어',     skills = '{DB,WAS}',      color = 2, phone = '010-0000-1103' where id = '00000000-0000-4000-a000-000000000013';
update public.profiles set team = '기술지원2팀', title = '팀장',         skills = '{서버,라이선스}', color = 3, phone = '010-0000-1104' where id = '00000000-0000-4000-a000-000000000014';
update public.profiles set team = '기술지원팀',  title = '운영 관리자', color = 4 where id = '00000000-0000-4000-a000-000000000001';

-- ---------------------------------------------------------------------
-- 고객사 · 담당자 · 장비 · 계약
-- ---------------------------------------------------------------------
insert into public.customers (id, name, code, industry, address, account_manager, owner_engineer_id, memo, source) values
  ('10000000-0000-4000-a000-000000000001', '한빛정밀(예시)',     'HBJ', '제조', '경기도 안산시 단원구 예시로 12',    '정민수', '00000000-0000-4000-a000-000000000011', '예시 데이터', 'sample'),
  ('10000000-0000-4000-a000-000000000002', '서강물류(예시)',     'SGL', '물류', '인천광역시 중구 예시대로 88',      '정민수', '00000000-0000-4000-a000-000000000012', '예시 데이터', 'sample'),
  ('10000000-0000-4000-a000-000000000003', '청연의료재단(예시)', 'CYM', '의료', '서울특별시 종로구 예시길 5',       '박가람', '00000000-0000-4000-a000-000000000013', '예시 데이터', 'sample'),
  ('10000000-0000-4000-a000-000000000004', '누리교육청(예시)',   'NRE', '공공', '세종특별자치시 예시로 200',        '박가람', '00000000-0000-4000-a000-000000000014', '예시 데이터', 'sample'),
  ('10000000-0000-4000-a000-000000000005', '다온푸드(예시)',     'DON', '유통', '부산광역시 해운대구 예시로 31',    '정민수', '00000000-0000-4000-a000-000000000011', '예시 데이터', 'sample');

insert into public.customer_contacts (customer_id, name, role, phone, email, is_primary) values
  ('10000000-0000-4000-a000-000000000001', '오세진', '전산팀 과장',     '031-000-1201', 'it@example-hbj.kr',   true),
  ('10000000-0000-4000-a000-000000000001', '한지민', '생산관리 대리',   '031-000-1202', 'prod@example-hbj.kr', false),
  ('10000000-0000-4000-a000-000000000002', '윤태경', '정보보안팀 차장', '032-000-3301', 'sec@example-sgl.kr',  true),
  ('10000000-0000-4000-a000-000000000003', '강민아', '의료정보팀 팀장', '02-000-4401',  'emr@example-cym.kr',  true),
  ('10000000-0000-4000-a000-000000000003', '조현우', '인프라 담당',     '02-000-4402',  'infra@example-cym.kr', false),
  ('10000000-0000-4000-a000-000000000004', '임수빈', '전산 주무관',     '044-000-5501', 'edu@example-nre.kr',  true),
  ('10000000-0000-4000-a000-000000000005', '배하람', '경영지원 과장',   '051-000-6601', 'ga@example-don.kr',   true);

insert into public.customer_assets (customer_id, product, model_version, qty, license_serial, installed_at, environment) values
  ('10000000-0000-4000-a000-000000000001', '백업 어플라이언스', 'BX-500 / 7.2', 2,  'BX5-0001-A', '2024-03-10', '본사 전산실'),
  ('10000000-0000-4000-a000-000000000001', 'SSL VPN',           'GW-2 / 5.1',   1,  'VPN-2201',   '2024-03-10', 'DMZ'),
  ('10000000-0000-4000-a000-000000000001', '그룹웨어 WAS',      'WAS 9.0',      2,  'WAS-77',     '2023-11-02', 'VM 이중화'),
  ('10000000-0000-4000-a000-000000000002', 'SSL VPN',           'GW-4 / 5.0',   2,  'VPN-4410',   '2025-07-15', 'HA 구성'),
  ('10000000-0000-4000-a000-000000000002', '백업 어플라이언스', 'BX-300 / 7.0', 1,  'BX3-1102',   '2025-07-20', '물류센터'),
  ('10000000-0000-4000-a000-000000000003', 'DB 서버',           'DBMS 19c',     2,  'DB-9001',    '2026-03-05', 'EMR 운영 DB'),
  ('10000000-0000-4000-a000-000000000003', '그룹웨어 WAS',      'WAS 9.1',      3,  'WAS-91',     '2026-03-05', 'EMR 웹'),
  ('10000000-0000-4000-a000-000000000004', '서버 라이선스',     'OS Enterprise', 20, 'LIC-NRE-20', '2025-11-10', '교육 포털'),
  ('10000000-0000-4000-a000-000000000004', 'SSL VPN',           'GW-2 / 5.1',   1,  'VPN-5501',   '2025-11-10', '원격 근무'),
  ('10000000-0000-4000-a000-000000000005', '백업 어플라이언스', 'BX-300 / 7.2', 1,  'BX3-2210',   '2026-06-12', '본사');

with c as (
  insert into public.contracts (customer_id, tier, start_date, end_date, response_hours, inspection_cycle)
  values
    ('10000000-0000-4000-a000-000000000001', 'Premium',   '2026-01-01', '2026-12-31', 1, '월 1회'),
    ('10000000-0000-4000-a000-000000000002', 'Standard',  '2025-07-01', '2026-11-30', 4, '분기 1회'),
    ('10000000-0000-4000-a000-000000000003', 'Premium',   '2026-03-01', '2027-02-28', 1, '월 1회'),
    ('10000000-0000-4000-a000-000000000004', 'Basic',     '2025-11-01', '2026-10-31', 8, '반기 1회'),
    ('10000000-0000-4000-a000-000000000005', '무상 보증', '2026-06-01', '2027-05-31', 8, null)
  returning id, tier
)
insert into public.contract_sla (contract_id, priority, resolve_hours)
select c.id, p.priority, case when c.tier = 'Premium' then p.premium else p.standard end
  from c cross join (values ('긴급'::public.issue_priority, 2, 4), ('높음', 8, 24), ('보통', 24, 72), ('낮음', 72, 168))
       as p(priority, premium, standard);

-- ---------------------------------------------------------------------
-- 이슈 (생성 시각은 현재 기준 상대값)
-- ---------------------------------------------------------------------
create temporary table _seed_issue (
  k text, cust int, title text, product text, category text, priority public.issue_priority,
  eng int, days_ago numeric, status public.issue_status, symptom text, tags text[],
  cause text, action text, prevention text, guide text, resolve_hours int, reporter text
);

insert into _seed_issue values
 ('A',1,'야간 백업 작업 실패 - 저장소 용량 부족','백업 어플라이언스','장애','높음',11,105,'종료',
  '매일 02:00 전체 백업이 "Repository full" 오류로 실패. 저장소 사용률 98%.','{백업,디스크,용량}',
  '보존 정책이 기본값(90일)으로 남아 있어 증분 백업이 계속 누적됨',
  '보존 기간을 30일로 변경하고 만료 백업 수동 정리(약 4.1TB 확보). 실패 작업 재실행 후 정상 완료 확인.',
  '저장소 사용률 85% 임계치 알림 추가, 월간 점검 항목에 보존 정책 확인 추가',
  '1) 관리 콘솔 > 저장소 > 보존 정책에서 보존 기간을 확인합니다.\n2) 저장소 사용률 85% 초과 시 담당 엔지니어에게 알림이 갑니다.',6,'오세진'),
 ('B',2,'백업 실패 - 저장소 공간 부족 경고','백업 어플라이언스','장애','높음',11,61,'종료',
  '주간 전체 백업 실패. 콘솔에 저장소 공간 부족 경고 표시.','{백업,디스크}',
  '신규 파일서버 추가 후 백업 대상이 늘었으나 보존 정책은 그대로여서 용량 초과',
  '보존 기간 60일→30일 조정, 중복 제거 옵션 활성화. 재백업 정상 완료.',
  '백업 대상 추가 시 용량 산정 체크리스트 적용', null,20,'윤태경'),
 ('C',5,'백업 작업 실패 알림 반복 - 저장소 용량','백업 어플라이언스','장애','보통',11,13,'해결',
  '설치 후 4개월째 백업 실패 알림. 저장소 사용률 92%.','{백업,용량}',
  '설치 시 보존 정책 기본값(90일) 미변경','보존 30일로 변경, 오래된 백업 정리.',
  '설치 체크리스트에 보존 정책 항목 추가', null,30,'배하람'),
 ('D',1,'백업 용량 경고 재발 - 저장소 사용률 88%','백업 어플라이언스','성능 저하','보통',11,2,'진행',
  '저장소 사용률 88% 알림 수신. 생산 데이터 증가로 추정.','{백업,용량}',null,null,null,null,null,'오세진'),
 ('E',4,'SSL VPN 접속이 1시간마다 끊김','SSL VPN','장애','높음',12,87,'종료',
  '원격 근무자 VPN 접속이 약 60분마다 끊기고 재로그인 필요.','{VPN,세션}',
  '세션 타임아웃이 idle 기준이 아닌 절대시간 60분으로 설정됨',
  '세션 정책을 idle 30분 / 최대 10시간으로 변경. 클라이언트 5.1.3 배포.',
  'VPN 설치 시 세션 정책 표준값 적용','VPN 접속이 1시간마다 끊기면 클라이언트 5.1.3 이상을 설치해 주세요.',9,'임수빈'),
 ('F',1,'VPN 연결 끊김 - 재접속 필요','SSL VPN','장애','높음',12,35,'종료',
  '외근 직원 VPN이 1시간 단위로 끊긴다는 문의. 세션 만료 메시지.','{VPN,세션}',
  '펌웨어 업그레이드 후 세션 정책 초기화','세션 정책 재설정(idle 30분, 최대 10시간).',
  '펌웨어 업그레이드 후 정책 비교 점검 절차 추가',null,5,'오세진'),
 ('G',2,'VPN 이중화 장비 failover 후 접속 불가','SSL VPN','장애','긴급',12,5,'고객확인대기',
  'HA 구성 중 Active 장비 재부팅 후 Standby로 전환되었으나 사용자 접속 불가.','{VPN,HA}',null,null,null,null,null,'윤태경'),
 ('H',4,'VPN 사용자 인증 실패 (LDAP)','SSL VPN','장애','높음',null,1,'접수',
  '오늘 아침부터 일부 사용자 VPN 로그인 시 인증 실패. LDAP 연동 계정만 해당.','{VPN,LDAP,인증}',null,null,null,null,null,'임수빈'),
 ('J',3,'EMR 로그인 지연 (20초 이상)','DB 서버','성능 저하','긴급',13,75,'종료',
  '오전 9시 진료 시작 시간대 EMR 로그인 20초 이상 지연. DB 세션 수 급증.','{DB,세션,로그인}',
  '커넥션 풀 최대값(200) 초과로 대기 발생, 미반환 세션 누적',
  'WAS 커넥션 풀 400으로 상향, 유휴 세션 타임아웃 설정.',
  '세션 수 모니터링 등록, 9시대 임계치 알림',null,3,'강민아'),
 ('L',3,'EMR DB 세션 급증 알림','DB 서버','성능 저하','높음',13,3,'진행',
  '모니터링에서 오전 9시 DB 세션 380개 경고. 로그인 지연 재발 우려.','{DB,세션}',null,null,null,null,null,'강민아'),
 ('N',1,'그룹웨어 첨부파일 업로드 실패','그룹웨어 WAS','설정 변경','보통',13,7,'보류',
  '10MB 이상 첨부파일 업로드 시 오류. 고객 측 보안 장비 정책 확인 중.','{WAS,업로드}',null,null,null,null,null,'한지민'),
 ('R',3,'WAS 인증서 만료 예정 (D-10)','그룹웨어 WAS','설정 변경','높음',14,1,'배정',
  'EMR 웹 SSL 인증서 10일 후 만료. 갱신 및 교체 작업 일정 필요.','{인증서,SSL}',null,null,null,null,null,'조현우');

do $$
declare
  s record;
  v_id uuid;
  v_created timestamptz;
begin
  for s in select * from _seed_issue order by days_ago desc loop
    v_created := now() - make_interval(secs => (s.days_ago * 86400)::int);
    insert into public.issues (customer_id, title, product, category, priority, channel, reporter_name,
                               symptom, tags, assignee_id, created_at, source)
    values (('10000000-0000-4000-a000-00000000000' || s.cust)::uuid, s.title, s.product, s.category, s.priority, '전화',
            s.reporter, s.symptom, s.tags,
            case when s.eng is null then null else ('00000000-0000-4000-a000-0000000000' || s.eng)::uuid end,
            v_created, 'sample')
    returning id into v_id;

    if s.cause is not null then
      insert into public.issue_resolutions (issue_id, cause, action, prevention, customer_guide, resolved_by, resolved_at)
      values (v_id, s.cause, s.action, s.prevention, replace(s.guide, '\n', E'\n'),
              ('00000000-0000-4000-a000-0000000000' || s.eng)::uuid,
              v_created + make_interval(hours => s.resolve_hours));
    end if;
    if s.status not in ('접수', '배정', '해결') then
      update public.issues set status = s.status where id = v_id;
    end if;
  end loop;
end $$;

-- 일정 예시
insert into public.issue_schedules (issue_id, engineer_id, date, start_time, end_time, type, note)
select i.id, i.assignee_id, (now() at time zone 'Asia/Seoul')::date + x.d, x.st, x.en, x.t::public.schedule_type, x.note
  from (values ('백업 용량 경고 재발 - 저장소 사용률 88%', 1, time '14:00', time '16:00', '현장 방문', '저장소 증설 범위 산정'),
               ('EMR DB 세션 급증 알림',                    0, time '08:30', time '10:30', '원격 지원', '피크 시간 세션 모니터링'),
               ('WAS 인증서 만료 예정 (D-10)',             5, time '19:00', time '21:00', '원격 지원', '야간 교체 작업'))
       as x(title, d, st, en, t, note)
  join public.issues i on i.title = x.title;
drop table if exists _seed_issue;
