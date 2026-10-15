-- =====================================================================
-- 고객사 이슈 데스크 — 기본 스키마
-- PRD v1.2 §7 데이터 모델
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------
create type public.user_role      as enum ('admin', 'engineer', 'viewer');
create type public.issue_status   as enum ('접수', '배정', '진행', '보류', '고객확인대기', '해결', '종료');
create type public.issue_priority as enum ('긴급', '높음', '보통', '낮음');
create type public.schedule_type  as enum ('현장 방문', '원격 지원', '내부 작업', '고객 미팅', '정기 점검');
create type public.event_type     as enum ('create', 'status', 'assign', 'edit', 'note', 'schedule', 'resolve', 'report', 'attachment');

-- ---------------------------------------------------------------------
-- 설정 / 코드 테이블
-- ---------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);
comment on table public.app_settings is '시스템 설정 (허용 이메일 도메인, 기본 SLA 등)';

insert into public.app_settings (key, value) values
  ('allowed_email_domains', 'ablearn.kr'),
  ('default_sla_hours', '{"긴급":4,"높음":24,"보통":72,"낮음":168}');

-- 이슈 유형·접수 경로처럼 운영 중 관리자가 바꿀 수 있는 값
create table public.code_values (
  group_key   text not null check (group_key in ('category', 'channel')),
  code        text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  primary key (group_key, code)
);

insert into public.code_values (group_key, code, sort_order) values
  ('category', '장애', 10), ('category', '성능 저하', 20), ('category', '설치/구축', 30),
  ('category', '설정 변경', 40), ('category', '라이선스', 50), ('category', '기술 문의', 60), ('category', '기타', 99),
  ('channel', '전화', 10), ('channel', '이메일', 20), ('channel', '메신저', 30),
  ('channel', '방문', 40), ('channel', '원격 모니터링', 50), ('channel', '기타', 99);

-- ---------------------------------------------------------------------
-- 사용자
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null,
  email       text unique,
  role        public.user_role not null default 'viewer',
  team        text,
  title       text,
  phone       text,
  skills      text[] not null default '{}',
  color       smallint not null default 0 check (color between 0 and 7),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is '사용자(엔지니어 포함). auth.users 1:1';

-- ---------------------------------------------------------------------
-- 이관 배치 (이관 데이터 롤백용)
-- ---------------------------------------------------------------------
create table public.import_batches (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('customers', 'contacts', 'assets', 'contracts', 'issues')),
  file_path   text,
  total_rows  int not null default 0,
  ok_rows     int not null default 0,
  error_rows  int not null default 0,
  errors      jsonb not null default '[]',
  status      text not null default 'validated' check (status in ('validated', 'committed', 'rolled_back')),
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 고객사
-- ---------------------------------------------------------------------
create table public.customers (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null unique,
  code               text,
  industry           text,
  address            text,
  account_manager    text,
  owner_engineer_id  uuid references public.profiles (id) on delete set null,
  memo               text,
  is_archived        boolean not null default false,
  source             text not null default 'manual' check (source in ('manual', 'import', 'sample')),
  import_batch_id    uuid references public.import_batches (id) on delete set null,
  created_by         uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by         uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.customer_contacts (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers (id) on delete cascade,
  name         text not null,
  role         text,
  phone        text,
  email        text,
  is_primary   boolean not null default false,
  import_batch_id uuid references public.import_batches (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index on public.customer_contacts (customer_id);

create table public.customer_assets (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers (id) on delete cascade,
  product         text not null,
  model_version   text,
  qty             int check (qty is null or qty >= 0),
  license_serial  text,
  installed_at    date,
  environment     text,
  note            text,
  is_active       boolean not null default true,
  import_batch_id uuid references public.import_batches (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index on public.customer_assets (customer_id);

create table public.contracts (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references public.customers (id) on delete cascade,
  tier              text,
  start_date        date,
  end_date          date,
  response_hours    int check (response_hours is null or response_hours >= 0),
  inspection_cycle  text,
  notes             text,
  is_current        boolean not null default true,
  import_batch_id   uuid references public.import_batches (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
-- 고객사당 현재 계약은 1건
create unique index contracts_one_current on public.contracts (customer_id) where is_current;

create table public.contract_sla (
  contract_id    uuid not null references public.contracts (id) on delete cascade,
  priority       public.issue_priority not null,
  resolve_hours  int not null check (resolve_hours > 0),
  primary key (contract_id, priority)
);

-- ---------------------------------------------------------------------
-- 이슈
-- ---------------------------------------------------------------------
create table public.issue_no_counters (
  period  text primary key,          -- 'YYMM'
  last_no int  not null default 0
);

create table public.issues (
  id                   uuid primary key default gen_random_uuid(),
  issue_no             text unique,                       -- 트리거 채번: ISS-YYMM-0001
  customer_id          uuid not null references public.customers (id) on delete restrict,
  asset_id             uuid references public.customer_assets (id) on delete set null,
  product              text,
  title                text not null check (length(trim(title)) > 0),
  symptom              text,
  category             text not null default '장애',
  priority             public.issue_priority not null default '보통',
  channel              text not null default '전화',
  reporter_contact_id  uuid references public.customer_contacts (id) on delete set null,
  reporter_name        text,
  status               public.issue_status not null default '접수',
  assignee_id          uuid references public.profiles (id) on delete set null,
  tags                 text[] not null default '{}',
  due_at               timestamptz,
  due_manual           boolean not null default false,
  sla_paused_at        timestamptz,
  sla_paused_total     interval not null default '0',
  first_response_at    timestamptz,
  resolved_at          timestamptz,
  closed_at            timestamptz,
  kb_published         boolean not null default true,
  search_text          text,                              -- 트리거로 유지 (유사도 검색용)
  deleted_at           timestamptz,
  source               text not null default 'manual' check (source in ('manual', 'import', 'sample')),
  import_batch_id      uuid references public.import_batches (id) on delete set null,
  created_by           uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by           uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.issue_resolutions (
  issue_id        uuid primary key references public.issues (id) on delete cascade,
  cause           text not null check (length(trim(cause)) > 0),
  action          text not null check (length(trim(action)) > 0),
  prevention      text,
  customer_guide  text,
  resolved_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  resolved_at     timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.issue_events (
  id          bigint generated always as identity primary key,
  issue_id    uuid not null references public.issues (id) on delete cascade,
  type        public.event_type not null,
  actor_id    uuid references public.profiles (id) on delete set null default auth.uid(),
  message     text not null,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index on public.issue_events (issue_id, created_at);

create table public.issue_schedules (
  id           uuid primary key default gen_random_uuid(),
  issue_id     uuid references public.issues (id) on delete cascade,
  customer_id  uuid references public.customers (id) on delete cascade,
  engineer_id  uuid references public.profiles (id) on delete set null,
  date         date not null,
  start_time   time,
  end_time     time,
  type         public.schedule_type not null default '현장 방문',
  note         text,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  check (end_time is null or start_time is null or end_time > start_time)
);

create table public.issue_attachments (
  id            uuid primary key default gen_random_uuid(),
  issue_id      uuid not null references public.issues (id) on delete cascade,
  storage_path  text not null unique,
  file_name     text not null,
  size_bytes    bigint,
  mime_type     text,
  uploaded_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);
create index on public.issue_attachments (issue_id);

create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  issue_id      uuid references public.issues (id) on delete set null,
  customer_id   uuid not null references public.customers (id) on delete cascade,
  kind          text not null check (kind in ('issue_resolution', 'customer_history')),
  storage_path  text not null,
  issued_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);

create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  issue_id    uuid references public.issues (id) on delete cascade,
  kind        text not null check (kind in ('sla_soon', 'sla_over', 'assigned', 'mention')),
  message     text not null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.notifications (user_id, read_at);
-- SLA 알림은 이슈·사용자·종류별 1회만
create unique index notifications_sla_once on public.notifications (user_id, issue_id, kind)
  where kind in ('sla_soon', 'sla_over');

create table public.kb_feedback (
  id                  bigint generated always as identity primary key,
  source_issue_id     uuid references public.issues (id) on delete cascade,
  suggested_issue_id  uuid not null references public.issues (id) on delete cascade,
  user_id             uuid references public.profiles (id) on delete set null default auth.uid(),
  action              text not null check (action in ('viewed', 'helpful')),
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 인덱스 (PRD §7.4)
-- ---------------------------------------------------------------------
create index issues_search_trgm on public.issues using gin (search_text extensions.gin_trgm_ops);
create index issue_resolutions_trgm on public.issue_resolutions using gin ((cause || ' ' || action) extensions.gin_trgm_ops);
create index issues_status_due on public.issues (status, due_at) where deleted_at is null;
create index issues_customer_created on public.issues (customer_id, created_at desc);
create index issues_open_assignee on public.issues (assignee_id) where status not in ('해결', '종료');
create index issue_schedules_date_engineer on public.issue_schedules (date, engineer_id);
create index issue_schedules_issue on public.issue_schedules (issue_id);
