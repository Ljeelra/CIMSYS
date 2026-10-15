# CIMSYS — 고객사 이슈 데스크

고객사 정보·이슈 접수·엔지니어 배정·SLA·해결 사례 지식베이스를 한 곳에서 관리하는 사내 업무 시스템입니다.
반복 이슈의 해결을 빠르게 하고, 해결 경험을 부서 전체가 공유하는 것이 목표입니다.

- 요구사항: [`docs/prd.md`](docs/prd.md)
- 설치·연결: [`docs/SETUP.md`](docs/SETUP.md)

## 구성

| 영역 | 기술 | 위치 |
|---|---|---|
| 웹 | React 18 · Vite · TypeScript · TanStack Query | `apps/web` (Vercel) |
| DB · 인증 · 파일 | Supabase Postgres · RLS · Auth · Storage · pg_cron | `supabase/migrations` |
| 서버 함수 | Supabase Edge Functions (Deno) | `supabase/functions` |
| 공통 로직 | 상수 · 타입 · SLA 계산 | `packages/shared` |
| CI/CD | GitHub Actions | `.github/workflows` |

## 구현 현황 (PRD 0~2단계)

- 로그인(이메일+비밀번호), 초대·비밀번호 설정/재설정, 회사 도메인 제한, 역할(관리자·엔지니어·조회자)
- 대시보드: KPI, 기한 위험, 내 담당, 최근 접수, 엔지니어 업무량
- 고객사: 목록·검색, 상세(기본정보·담당자·계약/SLA·설치 장비·통계·이슈 이력), 등록·수정·보관
- 이슈: 목록(탭·필터), 등록(유사 해결 사례 실시간 추천), 상세(상태 흐름·담당·메모·처리 이력·반복 경고), 해결 기록, 안내문 복사
- DB 규칙: 월별 채번, SLA 기한 자동 계산·일시정지 연장, 상태 전이 제한, 이력 자동 기록(수정 불가), 유사도 검색, SLA 점검 예약
- 테스트: pgTAP 48개, Vitest 10개

다음 단계: 일정 캘린더·첨부(3), 지식베이스·반복 리포트 화면·PDF(4), 엑셀 이관(5)

## 개발

```bash
pnpm install
npx supabase start
pnpm dev
```

자세한 내용은 [`docs/SETUP.md`](docs/SETUP.md#5-로컬-개발)를 참고하세요.
