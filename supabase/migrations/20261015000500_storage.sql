-- =====================================================================
-- Storage 버킷과 접근 정책 (PRD v1.2 §8)
--   issue-attachments : 이슈 첨부 (경로: {issue_id}/{파일명})
--   reports           : 발행한 PDF 보고서
--   imports           : 이관용 원본 파일 (관리자만)
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('issue-attachments', 'issue-attachments', false, 52428800),
  ('reports',           'reports',           false, 20971520),
  ('imports',           'imports',           false, 20971520)
on conflict (id) do nothing;

create policy "첨부: 구성원 조회" on storage.objects for select to authenticated
  using (bucket_id = 'issue-attachments' and (select public.is_member()));
create policy "첨부: 작성자 업로드" on storage.objects for insert to authenticated
  with check (bucket_id = 'issue-attachments' and (select public.is_writer()));
create policy "첨부: 본인·관리자 삭제" on storage.objects for delete to authenticated
  using (bucket_id = 'issue-attachments' and ((select public.is_admin()) or owner = (select auth.uid())));

create policy "보고서: 구성원 조회" on storage.objects for select to authenticated
  using (bucket_id = 'reports' and (select public.is_member()));
create policy "보고서: 발행" on storage.objects for insert to authenticated
  with check (bucket_id = 'reports' and (select public.is_writer()));
create policy "보고서: 관리자 삭제" on storage.objects for delete to authenticated
  using (bucket_id = 'reports' and (select public.is_admin()));

create policy "이관: 관리자" on storage.objects for all to authenticated
  using (bucket_id = 'imports' and (select public.is_admin()))
  with check (bucket_id = 'imports' and (select public.is_admin()));
