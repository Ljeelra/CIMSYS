-- =====================================================================
-- 예약 작업 (pg_cron) — SLA 점검 10분, 삭제 이슈 정리 매일 03:00(KST)
-- pg_cron이 없는 환경(로컬 테스트 등)에서는 건너뜀
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('issue-desk-sla-scan', '*/10 * * * *', 'select public.sla_scan()');
    perform cron.schedule('issue-desk-purge-deleted', '0 18 * * *', 'select public.purge_deleted_issues()');
  else
    raise notice 'pg_cron 미설치: 예약 작업을 등록하지 않았습니다';
  end if;
end $$;

-- 예약 함수는 서버에서만 실행
revoke execute on function public.sla_scan() from public, anon, authenticated;
revoke execute on function public.purge_deleted_issues() from public, anon, authenticated;
