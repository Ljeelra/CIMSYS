-- =====================================================================
-- RPC — 클라이언트가 supabase.rpc()로 호출 (PRD v1.2 §7.6)
-- 모두 SECURITY INVOKER: 호출한 사용자의 RLS가 그대로 적용된다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 유사 해결 사례 추천 (KB-03)
-- score = 텍스트 유사도(pg_trgm) + 같은 제품 0.12 + 같은 유형 0.06 + 같은 고객사 0.04
-- ---------------------------------------------------------------------
create or replace function public.match_similar_issues(
  p_query    text,
  p_product  text default null,
  p_category text default null,
  p_customer uuid default null,
  p_exclude  uuid default null,
  p_limit    int  default 5
)
returns table (
  id uuid, issue_no text, title text, product text, category text,
  customer_id uuid, customer_name text, cause text, action text,
  resolved_at timestamptz, resolver_name text, score real
)
language sql stable set search_path = public, extensions
as $$
  with q as (select lower(trim(coalesce(p_query, ''))) as t)
  select i.id, i.issue_no, i.title, i.product, i.category,
         i.customer_id, c.name, r.cause, r.action, r.resolved_at, p.name,
         (b.base
           + case when p_product  is not null and i.product  = p_product  then 0.12 else 0 end
           + case when p_category is not null and i.category = p_category then 0.06 else 0 end
           + case when p_customer is not null and i.customer_id = p_customer then 0.04 else 0 end)::real
    from public.issues i
    join public.issue_resolutions r on r.issue_id = i.id
    join public.customers c on c.id = i.customer_id
    left join public.profiles p on p.id = r.resolved_by
    cross join q
    cross join lateral (
      select greatest(
        similarity(i.search_text, q.t),
        word_similarity(q.t, i.search_text) * 0.9,
        similarity(lower(r.cause || ' ' || r.action), q.t) * 0.8
      ) as base
    ) b
   where i.deleted_at is null
     and i.kb_published
     and i.id is distinct from p_exclude
     and length(q.t) >= 2
     and b.base > 0.12
   order by 12 desc, r.resolved_at desc
   limit greatest(1, least(coalesce(p_limit, 5), 20))
$$;

-- ---------------------------------------------------------------------
-- 지식베이스 검색 (KB-02) — 검색어가 없으면 최근 해결 순
-- ---------------------------------------------------------------------
create or replace function public.search_kb(
  p_query    text default null,
  p_product  text default null,
  p_category text default null,
  p_limit    int  default 50
)
returns table (
  id uuid, issue_no text, title text, symptom text, product text, category text,
  customer_id uuid, customer_name text, cause text, action text, prevention text,
  customer_guide text, resolved_at timestamptz, resolver_name text, score real
)
language sql stable set search_path = public, extensions
as $$
  with q as (select lower(trim(coalesce(p_query, ''))) as t)
  select * from (
    select i.id, i.issue_no, i.title, i.symptom, i.product, i.category,
           i.customer_id, c.name as customer_name, r.cause, r.action, r.prevention,
           r.customer_guide, r.resolved_at, p.name as resolver_name,
           case when q.t = '' then null else (
             greatest(similarity(i.search_text, q.t),
                      word_similarity(q.t, i.search_text),
                      word_similarity(q.t, lower(r.cause || ' ' || r.action)))
             + case when (i.search_text || ' ' || lower(r.cause || ' ' || r.action)) like '%' || q.t || '%' then 0.5 else 0 end
           )::real end as score
      from public.issues i
      join public.issue_resolutions r on r.issue_id = i.id
      join public.customers c on c.id = i.customer_id
      left join public.profiles p on p.id = r.resolved_by
      cross join q
     where i.deleted_at is null and i.kb_published
       and (p_product  is null or i.product  = p_product)
       and (p_category is null or i.category = p_category)
  ) s
  where s.score is null or s.score > 0.25
  order by s.score desc nulls last, s.resolved_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
$$;

-- ---------------------------------------------------------------------
-- 대시보드 KPI (DASH-01)
-- ---------------------------------------------------------------------
create or replace function public.dashboard_summary()
returns jsonb language sql stable set search_path = public
as $$
  select jsonb_build_object(
    'open',        count(*) filter (where status in ('접수','배정','진행','보류','고객확인대기')),
    'paused',      count(*) filter (where status in ('보류','고객확인대기')),
    'unassigned',  count(*) filter (where status in ('접수','배정','진행','보류','고객확인대기') and assignee_id is null),
    'overdue',     count(*) filter (where status in ('접수','배정','진행') and due_at < now()),
    'due_soon',    count(*) filter (where status in ('접수','배정','진행') and due_at >= now()
                                    and due_at - now() < greatest(interval '2 hours', (due_at - created_at) * 0.25)),
    'resolved_7d', count(*) filter (where resolved_at >= now() - interval '7 days'),
    'avg_resolve_hours_30d', round((avg(extract(epoch from resolved_at - created_at) / 3600)
                                     filter (where resolved_at >= now() - interval '30 days'))::numeric, 1)
  )
  from public.issues
  where deleted_at is null
$$;

-- ---------------------------------------------------------------------
-- 엔지니어 업무량 (DASH-04)
-- ---------------------------------------------------------------------
create or replace function public.engineer_workload(p_week_start date default null)
returns table (
  engineer_id uuid, name text, color smallint,
  open_total int, urgent int, high int, normal int, low int,
  at_risk int, week_schedules int
)
language sql stable set search_path = public
as $$
  with wk as (
    select coalesce(p_week_start, date_trunc('week', (now() at time zone 'Asia/Seoul'))::date) as s
  )
  select p.id, p.name, p.color,
         count(i.id) filter (where true)::int,
         count(i.id) filter (where i.priority = '긴급')::int,
         count(i.id) filter (where i.priority = '높음')::int,
         count(i.id) filter (where i.priority = '보통')::int,
         count(i.id) filter (where i.priority = '낮음')::int,
         count(i.id) filter (where i.status in ('접수','배정','진행')
                              and i.due_at - now() < greatest(interval '2 hours', (i.due_at - i.created_at) * 0.25))::int,
         (select count(*) from public.issue_schedules s, wk
           where s.engineer_id = p.id and s.date between wk.s and wk.s + 6)::int
    from public.profiles p
    left join public.issues i
      on i.assignee_id = p.id and i.deleted_at is null
     and i.status in ('접수','배정','진행','보류','고객확인대기')
   where p.is_active and p.role in ('admin', 'engineer')
   group by p.id, p.name, p.color
   order by p.name
$$;

-- ---------------------------------------------------------------------
-- 고객사 통계 (CUST-06)
-- ---------------------------------------------------------------------
create or replace function public.customer_stats(p_customer uuid)
returns jsonb language sql stable set search_path = public
as $$
  with iss as (
    select * from public.issues where customer_id = p_customer and deleted_at is null
  )
  select jsonb_build_object(
    'total',  (select count(*) from iss),
    'open',   (select count(*) from iss where status in ('접수','배정','진행','보류','고객확인대기')),
    'overdue',(select count(*) from iss where status in ('접수','배정','진행') and due_at < now()),
    'avg_resolve_hours', (select round((avg(extract(epoch from resolved_at - created_at) / 3600))::numeric, 1)
                            from iss where resolved_at is not null),
    'sla_met_rate', (select round(100.0 * count(*) filter (where resolved_at <= due_at) / nullif(count(*), 0))
                       from iss where status in ('해결','종료') and resolved_at is not null),
    'top_types', coalesce((
       select jsonb_agg(jsonb_build_object('product', product, 'category', category, 'count', n) order by n desc)
         from (select coalesce(product, '기타') as product, category, count(*) as n
                 from iss group by 1, 2 order by n desc limit 5) t), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------
-- 반복 이슈: 같은 고객사·제품·유형 (REP-03)
-- ---------------------------------------------------------------------
create or replace function public.repeat_issue_groups(p_days int default 90, p_min int default 2)
returns table (
  customer_id uuid, customer_name text, product text, category text,
  issue_count int, open_count int, last_created_at timestamptz, last_issue_id uuid
)
language sql stable set search_path = public
as $$
  select i.customer_id, c.name, coalesce(i.product, '기타'), i.category,
         count(*)::int,
         count(*) filter (where i.status in ('접수','배정','진행','보류','고객확인대기'))::int,
         max(i.created_at),
         (array_agg(i.id order by i.created_at desc))[1]
    from public.issues i
    join public.customers c on c.id = i.customer_id
   where i.deleted_at is null and i.created_at >= now() - make_interval(days => p_days)
   group by i.customer_id, c.name, coalesce(i.product, '기타'), i.category
  having count(*) >= p_min
   order by count(*) desc, max(i.created_at) desc
$$;

-- ---------------------------------------------------------------------
-- 유사 증상 묶음 (REP-02) — 같은 제품 안에서 텍스트 유사도로 탐욕적 그룹화
-- ---------------------------------------------------------------------
create or replace function public.similar_issue_clusters(p_days int default 90, p_threshold real default 0.15)
returns table (
  cluster_no int, product text, issue_count int, issue_ids uuid[], titles text[],
  customer_names text[], latest_cause text, latest_resolved_issue_id uuid
)
language plpgsql stable set search_path = public, extensions
as $$
declare
  r      record;
  best   int;
  best_s real;
  s      real;
  k      int;
  c_rep  text[]    := '{}';   -- 묶음 대표 텍스트
  c_prod text[]    := '{}';
  c_members jsonb  := '[]';
begin
  for r in
    select i.id, coalesce(i.product, '기타') as product,
           i.search_text || ' ' || coalesce(lower(res.cause), '') as txt
      from public.issues i
      left join public.issue_resolutions res on res.issue_id = i.id
     where i.deleted_at is null and i.created_at >= now() - make_interval(days => p_days)
     order by i.created_at
  loop
    best := null; best_s := 0;
    for k in 1 .. coalesce(array_length(c_rep, 1), 0) loop
      if c_prod[k] = r.product then
        s := similarity(c_rep[k], r.txt);
        if s > best_s then best_s := s; best := k; end if;
      end if;
    end loop;

    if best is not null and best_s >= p_threshold then
      c_members := jsonb_set(c_members, array[(best - 1)::text],
                             (c_members -> (best - 1)) || to_jsonb(r.id::text));
    else
      c_rep  := c_rep  || r.txt;
      c_prod := c_prod || r.product;
      c_members := c_members || jsonb_build_array(jsonb_build_array(r.id::text));
    end if;
  end loop;

  return query
  with m as (
    select (ord)::int as no, c_prod[ord] as product,
           array(select (jsonb_array_elements_text(val))::uuid) as ids
      from jsonb_array_elements(c_members) with ordinality as t(val, ord)
  )
  select row_number() over (order by cardinality(m.ids) desc)::int,
         m.product,
         cardinality(m.ids)::int,
         m.ids,
         array(select i.title from public.issues i where i.id = any (m.ids) order by i.created_at),
         array(select distinct c.name from public.issues i join public.customers c on c.id = i.customer_id
                where i.id = any (m.ids)),
         (select res.cause from public.issue_resolutions res where res.issue_id = any (m.ids)
           order by res.resolved_at desc limit 1),
         (select res.issue_id from public.issue_resolutions res where res.issue_id = any (m.ids)
           order by res.resolved_at desc limit 1)
    from m
   where cardinality(m.ids) >= 2
   order by cardinality(m.ids) desc;
end $$;

-- ---------------------------------------------------------------------
-- 엔지니어 처리 현황 (REP-05)
-- ---------------------------------------------------------------------
create or replace function public.engineer_performance(p_days int default 90)
returns table (
  engineer_id uuid, name text, assigned int, resolved int, open int,
  avg_resolve_hours numeric, sla_met_rate numeric
)
language sql stable set search_path = public
as $$
  select p.id, p.name,
         count(i.id)::int,
         count(i.id) filter (where i.resolved_at is not null)::int,
         count(i.id) filter (where i.status in ('접수','배정','진행','보류','고객확인대기'))::int,
         round((avg(extract(epoch from i.resolved_at - i.created_at) / 3600)
                filter (where i.resolved_at is not null))::numeric, 1),
         round(100.0 * count(i.id) filter (where i.resolved_at is not null and i.resolved_at <= i.due_at)
               / nullif(count(i.id) filter (where i.resolved_at is not null), 0))
    from public.profiles p
    left join public.issues i
      on i.assignee_id = p.id and i.deleted_at is null
     and i.created_at >= now() - make_interval(days => p_days)
   where p.role in ('admin', 'engineer') and p.is_active
   group by p.id, p.name
   order by p.name
$$;

grant execute on function
  public.match_similar_issues(text, text, text, uuid, uuid, int),
  public.search_kb(text, text, text, int),
  public.dashboard_summary(),
  public.engineer_workload(date),
  public.customer_stats(uuid),
  public.repeat_issue_groups(int, int),
  public.similar_issue_clusters(int, real),
  public.engineer_performance(int)
to authenticated;

revoke execute on function
  public.match_similar_issues(text, text, text, uuid, uuid, int),
  public.search_kb(text, text, text, int),
  public.dashboard_summary(),
  public.engineer_workload(date),
  public.customer_stats(uuid),
  public.repeat_issue_groups(int, int),
  public.similar_issue_clusters(int, real),
  public.engineer_performance(int)
from public, anon;
