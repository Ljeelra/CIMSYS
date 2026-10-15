-- =====================================================================
-- RLS (Row Level Security) — PRD v1.2 §8
--   admin    : 전체
--   engineer : 이슈·해결·일정·메모·첨부 쓰기
--   viewer   : 조회만
--   비로그인(anon) : 접근 불가
-- =====================================================================

alter table public.app_settings        enable row level security;
alter table public.code_values         enable row level security;
alter table public.profiles            enable row level security;
alter table public.import_batches      enable row level security;
alter table public.customers           enable row level security;
alter table public.customer_contacts   enable row level security;
alter table public.customer_assets     enable row level security;
alter table public.contracts           enable row level security;
alter table public.contract_sla        enable row level security;
alter table public.issue_no_counters   enable row level security;  -- 정책 없음 = 트리거만 접근
alter table public.issues              enable row level security;
alter table public.issue_resolutions   enable row level security;
alter table public.issue_events        enable row level security;
alter table public.issue_schedules     enable row level security;
alter table public.issue_attachments   enable row level security;
alter table public.reports             enable row level security;
alter table public.notifications       enable row level security;
alter table public.kb_feedback         enable row level security;

-- 설정 / 코드 --------------------------------------------------------
create policy "settings: 구성원 조회" on public.app_settings for select to authenticated using ((select public.is_member()));
create policy "settings: 관리자 수정" on public.app_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "codes: 구성원 조회" on public.code_values for select to authenticated using ((select public.is_member()));
create policy "codes: 관리자 관리" on public.code_values for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- 사용자 ------------------------------------------------------------
create policy "profiles: 구성원 조회" on public.profiles for select to authenticated
  using ((select public.is_member()) or id = (select auth.uid()));
create policy "profiles: 본인·관리자 수정" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

-- 이관 --------------------------------------------------------------
create policy "imports: 관리자" on public.import_batches for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- 고객사 마스터 (조회: 구성원 / 쓰기: 관리자) ---------------------------
create policy "customers: 조회" on public.customers for select to authenticated using ((select public.is_member()));
create policy "customers: 관리자 등록" on public.customers for insert to authenticated with check ((select public.is_admin()));
create policy "customers: 관리자 수정" on public.customers for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "customers: 관리자 삭제" on public.customers for delete to authenticated using ((select public.is_admin()));

create policy "contacts: 조회" on public.customer_contacts for select to authenticated using ((select public.is_member()));
create policy "contacts: 관리자 등록" on public.customer_contacts for insert to authenticated with check ((select public.is_admin()));
create policy "contacts: 관리자 수정" on public.customer_contacts for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "contacts: 관리자 삭제" on public.customer_contacts for delete to authenticated using ((select public.is_admin()));

create policy "assets: 조회" on public.customer_assets for select to authenticated using ((select public.is_member()));
create policy "assets: 관리자 등록" on public.customer_assets for insert to authenticated with check ((select public.is_admin()));
create policy "assets: 관리자 수정" on public.customer_assets for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "assets: 관리자 삭제" on public.customer_assets for delete to authenticated using ((select public.is_admin()));

create policy "contracts: 조회" on public.contracts for select to authenticated using ((select public.is_member()));
create policy "contracts: 관리자 등록" on public.contracts for insert to authenticated with check ((select public.is_admin()));
create policy "contracts: 관리자 수정" on public.contracts for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "contracts: 관리자 삭제" on public.contracts for delete to authenticated using ((select public.is_admin()));

create policy "sla: 조회" on public.contract_sla for select to authenticated using ((select public.is_member()));
create policy "sla: 관리자 등록" on public.contract_sla for insert to authenticated with check ((select public.is_admin()));
create policy "sla: 관리자 수정" on public.contract_sla for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "sla: 관리자 삭제" on public.contract_sla for delete to authenticated using ((select public.is_admin()));

-- 이슈 ---------------------------------------------------------------
create policy "issues: 조회 (삭제분은 관리자만)" on public.issues for select to authenticated
  using ((select public.is_member()) and (deleted_at is null or (select public.is_admin())));
create policy "issues: 등록" on public.issues for insert to authenticated with check ((select public.is_writer()));
create policy "issues: 수정" on public.issues for update to authenticated
  using ((select public.is_writer()) and (deleted_at is null or (select public.is_admin())))
  with check ((select public.is_writer()));
create policy "issues: 관리자 영구 삭제" on public.issues for delete to authenticated using ((select public.is_admin()));

create policy "resolutions: 조회" on public.issue_resolutions for select to authenticated using ((select public.is_member()));
create policy "resolutions: 작성" on public.issue_resolutions for insert to authenticated with check ((select public.is_writer()));
create policy "resolutions: 수정" on public.issue_resolutions for update to authenticated using ((select public.is_writer())) with check ((select public.is_writer()));
create policy "resolutions: 관리자 삭제" on public.issue_resolutions for delete to authenticated using ((select public.is_admin()));

-- 처리 이력: 사용자가 직접 쓰는 것은 본인 명의 메모뿐. 수정·삭제 불가
create policy "events: 조회" on public.issue_events for select to authenticated using ((select public.is_member()));
create policy "events: 메모 작성" on public.issue_events for insert to authenticated
  with check ((select public.is_writer()) and type = 'note' and actor_id = (select auth.uid()));

create policy "schedules: 조회" on public.issue_schedules for select to authenticated using ((select public.is_member()));
create policy "schedules: 등록" on public.issue_schedules for insert to authenticated
  with check ((select public.is_writer()) and created_by = (select auth.uid()));
create policy "schedules: 수정" on public.issue_schedules for update to authenticated
  using ((select public.is_admin()) or ((select public.is_writer()) and (created_by = (select auth.uid()) or engineer_id = (select auth.uid()))))
  with check ((select public.is_writer()));
create policy "schedules: 삭제" on public.issue_schedules for delete to authenticated
  using ((select public.is_admin()) or ((select public.is_writer()) and created_by = (select auth.uid())));

create policy "attachments: 조회" on public.issue_attachments for select to authenticated using ((select public.is_member()));
create policy "attachments: 등록" on public.issue_attachments for insert to authenticated
  with check ((select public.is_writer()) and uploaded_by = (select auth.uid()));
create policy "attachments: 삭제" on public.issue_attachments for delete to authenticated
  using ((select public.is_admin()) or ((select public.is_writer()) and uploaded_by = (select auth.uid())));

create policy "reports: 조회" on public.reports for select to authenticated using ((select public.is_member()));
create policy "reports: 발행" on public.reports for insert to authenticated with check ((select public.is_writer()));
create policy "reports: 관리자 삭제" on public.reports for delete to authenticated using ((select public.is_admin()));

-- 알림: 본인 것만 --------------------------------------------------------
create policy "notifications: 본인 조회" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications: 본인 읽음 처리" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications: 본인 삭제" on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

create policy "kb_feedback: 관리자 조회" on public.kb_feedback for select to authenticated using ((select public.is_admin()));
create policy "kb_feedback: 기록" on public.kb_feedback for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));

-- anon(비로그인)은 어떤 테이블도 쓰지 못하도록 권한 자체를 회수
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- 외래키 인덱스 (조인·RLS·삭제 성능)
create index if not exists contracts_customer on public.contracts (customer_id);
create index if not exists issues_asset on public.issues (asset_id);
create index if not exists issues_assignee on public.issues (assignee_id);
create index if not exists issue_events_actor on public.issue_events (actor_id);
create index if not exists reports_customer on public.reports (customer_id);
create index if not exists reports_issue on public.reports (issue_id);
create index if not exists notifications_issue on public.notifications (issue_id);
create index if not exists customers_owner on public.customers (owner_engineer_id);
