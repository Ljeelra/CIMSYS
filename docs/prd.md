# PRD — 고객사 이슈 데스크 (CIMSYS)

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.2 (2026-10-15) — Edge Functions + Vercel 구성 확정, 0~2단계 구현 반영 |
| 작성 | 유니포인트 |
| 상태 | 0~2단계 구현 완료, 3단계 착수 전 |
| 기술 기반 | Supabase(DB·Auth·Storage·Edge Functions) + React 웹(Vercel), GitHub `Ljeelra/CIMSYS` + Actions CI/CD |
| 참고 | 프로토타입: claude.ai 아티팩트 「고객사 이슈 데스크」 (UI·흐름 레퍼런스로 사용) |

---

## 1. 배경과 목표

### 1.1 문제
- **반복 이슈 해결 지연**: 같은 고객사·같은 제품에서 같은 원인의 이슈가 반복되지만, 과거 해결 방법을 찾지 못해 매번 처음부터 분석한다.
- **케이스·지식 공유 부족**: 해결 내용이 개인 메일·메신저·엑셀에 흩어져 있어 부서 내 공유가 되지 않는다.
- **현황 파악 어려움**: 고객사별 계약·장비·이슈 이력, 엔지니어 일정과 업무량을 한눈에 볼 수 없다.

### 1.2 목표
1. 고객사별 정보(기본·계약/SLA·설치 장비·이슈 이력)를 한 화면에서 본다.
2. 이슈 접수 → 배정 → 처리 → 해결 → 종료 전 과정을 시스템에서 관리한다.
3. 해결 시 원인·조치·재발 방지를 정해진 양식으로 남기고, 다음 이슈 등록 시 유사 사례를 자동 추천한다.
4. 반복 이슈를 집계해 근본 대책이 필요한 항목을 드러낸다.
5. 고객사 요청 시 해결 보고서를 PDF로 바로 전달한다.

### 1.3 성공 지표 (운영 3개월 후)
| 지표 | 목표 |
|---|---|
| 해결 기록(원인·조치) 작성률 | 종료 이슈의 95% 이상 |
| 유사 사례 추천 클릭률 | 신규 이슈의 40% 이상 |
| 반복 이슈 평균 처리 시간 | 도입 전 대비 30% 단축 |
| SLA 준수율 | 90% 이상 |
| 엑셀·메신저 기반 이슈 관리 | 0건 (시스템 일원화) |

---

## 2. 사용자와 권한

| 역할 | 대상 | 주요 권한 |
|---|---|---|
| `admin` 관리자 | 팀장, 운영 담당 | 전체 기능. 고객사·계약·장비·사용자 관리, 이슈 배정·종료·삭제, 예시/이관 데이터 관리 |
| `engineer` 엔지니어 | 기술지원 엔지니어 | 이슈 등록·수정, 상태 변경(종료 제외), 일정 등록, 해결 기록, 보고서 내보내기 |
| `viewer` 조회자 | 영업·CS 등 | 전체 조회, 보고서 내보내기. 쓰기 불가 |

- 규모: 초기 10명 내외, 향후 여러 부서 확장 가능하도록 설계
- 권한은 Supabase **RLS(Row Level Security)** 로 DB 레벨에서 강제한다. 화면에서 버튼을 숨기는 것은 보조 수단이다.

---

## 3. 범위

### 3.1 MVP (1차 오픈)
- 로그인 / 사용자·역할 관리
- 대시보드
- 고객사 관리 (기본정보, 담당자, 계약·SLA, 설치 장비, 이슈 통계)
- 이슈 관리 (등록, 배정, 상태 흐름, 처리 이력, 첨부파일, 일정)
- SLA 자동 계산 · 초과/임박 표시 · 일시정지
- 일정 캘린더 (월/주) · 엔지니어 업무량
- 해결 기록 양식 → 지식베이스
- 유사 이슈 추천 (텍스트 유사도)
- 반복 이슈 리포트
- PDF 보고서 (이슈 해결 보고서, 고객사 이력 보고서)
- 엑셀(CSV) 데이터 이관

### 3.2 2차 이후
- 의미 기반 유사 검색 (pgvector 임베딩)
- 알림 채널 연동 (이메일 / 사내 메신저)
- 고객사 포털 (고객이 직접 이슈 접수·조회)
- 정기 점검 일정 자동 생성 (계약의 점검 주기 기반)
- AI 요약·조치 초안 제안

### 3.3 범위 외
- 계약·견적·청구 관리 (영업 시스템 영역)
- 재고·부품 관리

---

## 4. 기능 요구사항

> 우선순위: **P0** = MVP 필수, **P1** = MVP 권장, **P2** = 2차

### 4.1 인증·사용자 (AUTH)
| ID | 요구사항 | 우선 |
|---|---|---|
| AUTH-01 | 회사 이메일로 로그인 (Supabase Auth, 이메일+비밀번호) | P0 |
| AUTH-02 | 관리자가 사용자를 초대하고 역할(admin/engineer/viewer)을 지정 | P0 |
| AUTH-03 | 사용자 프로필: 이름, 팀, 직책, 전문 분야, 연락처, 캘린더 색상, 활성 여부 | P0 |
| AUTH-04 | 비활성 사용자는 로그인 불가, 배정 대상에서 제외되지만 과거 이력은 유지 | P0 |
| AUTH-05 | 회사 도메인 외 이메일 가입 차단 | P0 |

### 4.2 대시보드 (DASH)
| ID | 요구사항 | 우선 |
|---|---|---|
| DASH-01 | KPI: 진행 중, 기한 초과, 기한 임박, 최근 7일 해결, 30일 평균 처리 시간. 클릭 시 해당 필터의 이슈 목록으로 이동 | P0 |
| DASH-02 | 기한 위험 이슈 목록 (초과 → 임박, 기한 순) | P0 |
| DASH-03 | 내 담당 이슈 | P0 |
| DASH-04 | 7일 일정, 엔지니어별 업무량(우선순위별 진행 건수, 이번 주 일정 수, 기한 위험 수) | P0 |
| DASH-05 | 다른 사용자가 변경한 내용이 새로고침 없이 반영 (Realtime) | P1 |

### 4.3 고객사 (CUST)
| ID | 요구사항 | 우선 |
|---|---|---|
| CUST-01 | 고객사 목록: 검색(이름·업종·제품), 계약 등급 필터, 카드에 진행/초과/누적 이슈 수, 계약 만료 D-day(60일 이내 강조) | P0 |
| CUST-02 | 기본정보: 고객사명, 약칭, 업종, 주소, 사내 영업 담당, 담당 엔지니어, 메모 | P0 |
| CUST-03 | 고객 담당자 다수: 이름, 부서/직책, 전화, 이메일, 주 담당 여부 | P0 |
| CUST-04 | 계약·SLA: 등급, 기간, 초기 응답 시간, 점검 주기, **우선순위별 해결 기한(시간)**, 비고. 계약 이력 보관 | P0 |
| CUST-05 | 설치 장비·시스템 구성: 제품, 모델/버전, 수량, 라이선스/시리얼, 설치일, 환경·비고, 장비별 이슈 수 | P0 |
| CUST-06 | 고객사 상세 통계: 진행/누적 이슈, 평균 처리 시간, SLA 준수율, 자주 발생하는 유형 Top 5 (3회 이상 강조) | P0 |
| CUST-07 | 고객사 이슈 이력 전체 + 고객사 이력 보고서 PDF | P0 |
| CUST-08 | 고객사 등록·수정·삭제는 admin만. 이슈가 있는 고객사는 삭제 대신 보관(archive) | P0 |

### 4.4 이슈 (ISS)
| ID | 요구사항 | 우선 |
|---|---|---|
| ISS-01 | 이슈 번호 자동 채번: `ISS-YYMM-0001` (월별 순번, DB 시퀀스로 중복 없이) | P0 |
| ISS-02 | 등록 항목: 고객사*, 제목*, 제품/시스템(고객사 장비 목록에서 선택 또는 직접 입력), 유형, 우선순위, 접수 경로, 고객 요청자(담당자 목록), 증상, 담당자, 처리 기한, 태그, 첨부파일 | P0 |
| ISS-03 | 등록 화면에서 제목·증상·제품 입력에 따라 **유사 해결 사례를 실시간 추천** (4.7 참조) | P0 |
| ISS-04 | 상태 흐름: `접수 → 배정 → 진행 → (보류 / 고객확인대기) → 해결 → 종료`. 재오픈 허용(해결/종료 → 진행) | P0 |
| ISS-05 | `해결` 전환 시 해결 기록 양식을 반드시 작성 (원인·조치 필수) | P0 |
| ISS-06 | `종료`는 admin만. 해결 기록 없는 종료 시 경고 | P0 |
| ISS-07 | 담당자 배정: admin은 누구에게나, engineer는 미배정 이슈를 "내가 맡기" | P0 |
| ISS-08 | 처리 이력(타임라인): 접수, 상태 변경, 배정 변경, 우선순위·기한 변경, 메모, 일정 등록, 해결이 자동 기록. 작성자·시각 포함. 수정·삭제 불가 | P0 |
| ISS-09 | 메모 작성 (고객 통화 내용, 진행 상황) | P0 |
| ISS-10 | 첨부파일: 로그, 스크린샷, 설정 파일 (파일당 최대 50MB, Supabase Storage) | P1 |
| ISS-11 | 목록: 탭(진행 중 / 내 담당 / 기한 위험 / 미배정 / 해결됨 / 전체), 검색, 고객사·우선순위·담당자 필터. 기본 정렬: 기한 위험 → 우선순위 → 기한 | P0 |
| ISS-12 | 이슈 상세에 "이 고객사 동일 제품·유형 N회째" 경고 및 과거 이슈 링크 | P0 |
| ISS-13 | 이슈 삭제는 admin만 (soft delete, 30일 후 영구 삭제) | P1 |

### 4.5 SLA (SLA)
| ID | 요구사항 | 우선 |
|---|---|---|
| SLA-01 | 처리 기한 = 접수 시각 + 고객사 계약의 우선순위별 해결 시간. 계약이 없으면 기본값(긴급 4h / 높음 24h / 보통 72h / 낮음 168h) | P0 |
| SLA-02 | 우선순위 변경 시 기한 재계산 (수동 지정한 기한은 유지) | P0 |
| SLA-03 | `보류`·`고객확인대기` 동안 SLA 시계 정지, 재개 시 정지 시간만큼 기한 연장 | P0 |
| SLA-04 | 상태 표시: 정상 / 임박(잔여 25% 미만 또는 2시간 미만) / 초과 / 일시정지 / 준수 / 초과 해결 | P0 |
| SLA-05 | 10분마다 기한 점검, 임박·초과 전환 시 담당자·관리자에게 인앱 알림 | P1 |
| SLA-06 | 영업시간 기준 계산(평일 09–18시, 공휴일 제외) 옵션 | P2 |
| SLA-07 | 초기 응답 SLA (접수 → 첫 배정/메모까지 시간) 측정 | P1 |

### 4.6 일정 (SCH)
| ID | 요구사항 | 우선 |
|---|---|---|
| SCH-01 | 이슈별 작업 일정 등록: 날짜, 시작/종료 시간, 구분(현장 방문 / 원격 지원 / 내부 작업 / 고객 미팅), 엔지니어, 메모 | P0 |
| SCH-02 | 월간·주간 캘린더, 엔지니어 필터, 엔지니어별 색상 | P0 |
| SCH-03 | 같은 엔지니어의 일정 시간 겹침 경고 | P1 |
| SCH-04 | 첫 일정 등록 시 상태를 자동으로 `진행`으로 전환 | P0 |
| SCH-05 | 이슈와 무관한 일정(정기 점검, 교육 등) 등록 | P1 |

### 4.7 지식베이스·유사 이슈 추천 (KB)
| ID | 요구사항 | 우선 |
|---|---|---|
| KB-01 | 해결 기록 양식: 원인*, 조치 내용*, 재발 방지 대책, 고객 안내용 해결 가이드, 태그, 지식베이스 공개 여부(기본 공개) | P0 |
| KB-02 | 지식베이스 화면: 해결 사례 검색(증상·에러 메시지), 제품·유형 필터, 관련도 순 정렬 | P0 |
| KB-03 | 유사 이슈 추천: 제목+증상+태그+원인 텍스트 유사도 + 같은 제품(+가중) + 같은 유형(+가중) + 같은 고객사(+가중). 상위 5건, 관련도 % 표시 | P0 |
| KB-04 | 추천 사례를 클릭해 참고했는지 기록 (추천 품질 지표) | P1 |
| KB-05 | 의미 기반 검색: 임베딩(pgvector)으로 표현이 달라도 같은 문제를 찾음 | P2 |

### 4.8 반복 이슈 리포트 (REP)
| ID | 요구사항 | 우선 |
|---|---|---|
| REP-01 | 기간 선택: 30일 / 90일 / 180일 / 1년 | P0 |
| REP-02 | 유사 증상 묶음: 같은 제품 안에서 텍스트 유사도가 높은 이슈를 자동 그룹화, 2회 이상만 표시, 3회 이상 강조 | P0 |
| REP-03 | 같은 고객사·제품·유형 반복 그룹과 조치 제안(3회 이상: 근본 원인 분석·정기 점검 항목 추가) | P0 |
| REP-04 | 제품·유형별, 고객사별 발생 건수 | P0 |
| REP-05 | 엔지니어별 배정/해결/진행/평균 처리 시간/SLA 준수율 | P0 |
| REP-06 | 해결 기록 누락 건수 (원인 없이 종료된 이슈) | P0 |
| REP-07 | 리포트 CSV 내보내기 | P1 |

### 4.9 보고서·공유 (DOC)
| ID | 요구사항 | 우선 |
|---|---|---|
| DOC-01 | 이슈 해결 보고서 PDF: 이슈 정보, 문의 내용, 원인, 조치, 재발 방지, 해결 가이드, 담당 엔지니어 | P0 |
| DOC-02 | 고객사 이슈 이력 보고서 PDF: 요약 통계, 설치 장비, 기간 내 이슈 목록(원인·조치 요약) | P0 |
| DOC-03 | 고객 안내문 텍스트 복사 (메일 붙여넣기용) | P0 |
| DOC-04 | 보고서에 회사 로고·문서 양식 적용 | P1 |
| DOC-05 | 발행한 보고서를 Storage에 보관하고 이슈 이력에 "보고서 발행" 기록 | P1 |
| DOC-06 | 내부 메모는 보고서에 포함되지 않음 | P0 |

### 4.10 데이터 이관·관리 (DATA)
| ID | 요구사항 | 우선 |
|---|---|---|
| DATA-01 | 엑셀(CSV) 업로드로 고객사·담당자·장비·과거 이슈 일괄 등록, 미리보기와 오류 행 표시 | P0 |
| DATA-02 | 이관 데이터는 `source = 'import'` 로 구분, 일괄 롤백 가능 | P1 |
| DATA-03 | 일일 자동 백업 (Supabase PITR 또는 일일 백업) | P0 |

---

## 5. 비기능 요구사항

| 구분 | 요구사항 |
|---|---|
| 보안 | 모든 테이블 RLS 활성화. `service_role` 키는 Edge Functions에서만 사용(웹 번들·GitHub 저장소에 절대 포함 금지). 클라이언트는 `anon` 키 + 사용자 JWT |
| 감사 | 이슈 이벤트 테이블은 INSERT만 허용(수정·삭제 불가). 주요 마스터 변경은 `updated_by`, `updated_at` 기록 |
| 성능 | 목록·대시보드 1초 이내 (이슈 5만 건 기준), 유사 이슈 추천 500ms 이내 |
| 동시성 | 같은 이슈 동시 수정 시 `updated_at` 기반 낙관적 잠금, 충돌 시 안내 |
| 가용성 | Supabase Pro 플랜 이상 (일일 백업, 프로젝트 일시정지 없음) |
| 개인정보 | 고객 담당자 연락처는 로그인 사용자만 조회. 퇴사자 계정 즉시 비활성화 |
| 접근성·반응형 | 데스크톱 우선, 모바일(현장 엔지니어) 조회·상태 변경·메모·사진 첨부 가능. 라이트/다크 테마 |
| 시간대 | DB는 `timestamptz`(UTC) 저장, 화면은 Asia/Seoul 표시 |

---

## 6. 시스템 아키텍처

> v1.2 결정: 별도 Node.js 서버를 두지 않고 **Supabase Edge Functions**가 서버 로직을 맡는다. 웹은 **Vercel**, 코드·CI/CD는 **GitHub**. Node.js 22는 개발·빌드·테스트 런타임으로 사용한다.

### 6.1 구성도
```
[브라우저 / 모바일 웹]
   apps/web — React 18 + TypeScript (Vite) + supabase-js      ← Vercel (GitHub main 자동 배포)
        │                                │
        │ ① 조회·입력 (사용자 JWT, RLS)    │ ② 관리 기능 (사용자 JWT)
        ▼                                ▼
[Supabase  qrgcauiomsozqoyxrkvo]
   ├─ Auth .............. 이메일+비밀번호, 관리자 초대, 회원가입 차단, ablearn.kr 도메인만
   ├─ Postgres .......... 업무 데이터 + RLS + 트리거 + RPC
   │    ├─ pg_trgm ...... 유사 이슈·검색
   │    ├─ pg_cron ...... SLA 점검(10분), 삭제 이슈 정리(매일)
   │    └─ pgvector ..... (2차) 의미 기반 검색
   ├─ Realtime .......... 이슈·이력 변경 실시간 반영
   ├─ Storage ........... issue-attachments / reports / imports
   └─ Edge Functions .... invite-user, update-user (service_role 사용)
                          (4~5단계) generate-report(PDF), import-data(엑셀 이관)
        ▲
[GitHub  Ljeelra/CIMSYS] — PR마다 CI, main 반영 시 DB 마이그레이션·함수 자동 배포
```

### 6.2 역할 분담 원칙
| 처리 | 담당 | 이유 |
|---|---|---|
| 목록·상세 조회, 이슈 등록·수정, 메모, 해결 기록, 일정 | 웹 → Supabase 직접 (supabase-js) | RLS로 권한이 DB에서 강제됨, Realtime 구독이 쉬움 |
| 상태 전이 규칙, SLA 계산·일시정지, 이력 기록, 채번 | Postgres 트리거·함수 | 어느 경로로 쓰든 규칙이 항상 적용 |
| 유사 이슈·집계, 고객사 일괄 저장 | Postgres RPC | 데이터 가까이에서 계산, 한 트랜잭션 |
| 사용자 초대·역할 변경·로그인 차단, (이후) PDF·이관 | **Edge Functions** | `service_role` 키가 필요한 작업 |
| SLA 점검 | pg_cron → `notifications` | 서버 없이 DB에서 주기 실행 |

### 6.3 기술 스택
| 영역 | 선택 | 비고 |
|---|---|---|
| 런타임(개발) | Node.js 22 LTS, pnpm 9 워크스페이스 | `.nvmrc` |
| 언어 | TypeScript (strict) | 웹·공통 타입 공유 |
| 프론트엔드 | React 18 + Vite 5 + React Router 6 + TanStack Query 5 | 프로토타입 디자인(CSS 토큰) 이식 |
| 서버 함수 | Supabase Edge Functions (Deno, TypeScript) | `supabase/functions` |
| DB | Supabase Postgres + RLS, 마이그레이션은 Supabase CLI | `supabase/migrations` |
| 테스트 | pgTAP(RLS·트리거·RPC), Vitest(공통 로직), (이후) Playwright E2E | |
| 품질 | ESLint 9, Prettier, TypeScript | CI에서 검사 |
| 배포 | Vercel(웹), GitHub Actions(DB·함수) | |

### 6.4 Edge Functions 명세
모든 요청은 `Authorization: Bearer <사용자 JWT>` 필수. 함수가 JWT를 검증하고 `profiles.role`을 확인한다. 오류 형식은 `{ "error": { "code": "...", "message": "한국어 설명" } }`.

| 함수 | 권한 | 단계 | 설명 |
|---|---|---|---|
| `invite-user` | admin | ✅ 구현 | 회사 도메인 확인 → 초대 메일 발송 또는 임시 비밀번호로 즉시 생성 → 역할·팀 저장 |
| `update-user` | admin | ✅ 구현 | 역할·정보 변경, 비활성화 시 로그인 차단(ban), 마지막 관리자 보호 |
| `generate-report` | admin, engineer | 4단계 | 이슈 해결 보고서 / 고객사 이력 보고서 PDF → Storage 저장 → 서명 URL |
| `import-data` | admin | 5단계 | 엑셀/CSV 검증·미리보기·반영·롤백 |

---

## 7. 데이터 모델

### 7.1 ERD 요약
```
profiles ─┬─< issues (assignee_id)
          └─< issue_schedules (engineer_id)
customers ─┬─< customer_contacts
           ├─< customer_assets ─< issues (asset_id, 선택)
           ├─< contracts ─< contract_sla
           └─< issues ─┬─< issue_events      (처리 이력, append-only)
                       ├─< issue_schedules
                       ├─< issue_attachments
                       ├── issue_resolutions (1:1)
                       └─< reports
notifications >─ profiles
```

### 7.2 Enum
```sql
create type user_role      as enum ('admin','engineer','viewer');
create type issue_status   as enum ('접수','배정','진행','보류','고객확인대기','해결','종료');
create type issue_priority as enum ('긴급','높음','보통','낮음');
create type issue_category as enum ('장애','성능 저하','설치/구축','설정 변경','라이선스','기술 문의','기타');
create type issue_channel  as enum ('전화','이메일','메신저','방문','원격 모니터링','기타');
create type schedule_type  as enum ('현장 방문','원격 지원','내부 작업','고객 미팅','정기 점검');
create type event_type     as enum ('create','status','assign','edit','note','schedule','resolve','report','attachment');
```
> 유형·접수 경로처럼 운영 중 추가될 수 있는 값은 enum 대신 코드 테이블(`code_values`)로 관리하는 방안도 검토 (13장).

### 7.3 테이블

**profiles** — 사용자(엔지니어 포함). `auth.users` 1:1
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK, FK auth.users | |
| name | text not null | |
| email | text unique | |
| role | user_role default 'engineer' | |
| team, title, phone | text | |
| skills | text[] | 전문 분야 |
| color | smallint | 캘린더 색상 인덱스 |
| is_active | bool default true | |
| created_at, updated_at | timestamptz | |

**customers**
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| name | text not null unique | |
| code | text | 약칭 |
| industry, address, account_manager, memo | text | |
| owner_engineer_id | uuid FK profiles | 담당 엔지니어 |
| is_archived | bool default false | |
| source | text default 'manual' | 'manual' / 'import' |
| created_by, updated_by | uuid FK profiles | |
| created_at, updated_at | timestamptz | |

**customer_contacts** — id, customer_id FK, name, role, phone, email, is_primary, created_at

**customer_assets** — id, customer_id FK, product, model_version, qty int, license_serial, installed_at date, environment, note, is_active

**contracts** — id, customer_id FK, tier text, start_date, end_date, response_hours int, inspection_cycle text, notes, is_current bool (고객사당 현재 계약 1건: partial unique index)

**contract_sla** — contract_id FK, priority issue_priority, resolve_hours int — PK(contract_id, priority)

**issues**
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| issue_no | text unique | `ISS-YYMM-0001`, 트리거로 채번 |
| customer_id | uuid FK not null | |
| asset_id | uuid FK customer_assets null | 장비 선택 시 |
| product | text | 장비 미선택 시 직접 입력 |
| title | text not null | |
| symptom | text | |
| category | issue_category | |
| priority | issue_priority | |
| channel | issue_channel | |
| reporter_contact_id | uuid FK customer_contacts null | |
| reporter_name | text | 담당자 목록에 없을 때 |
| status | issue_status default '접수' | |
| assignee_id | uuid FK profiles null | |
| tags | text[] | |
| due_at | timestamptz | SLA 기한 (트리거 계산) |
| due_manual | bool default false | 수동 지정 여부 |
| sla_paused_at | timestamptz null | 일시정지 시작 |
| sla_paused_total | interval default '0' | 누적 정지 시간 |
| first_response_at | timestamptz | 초기 응답 SLA |
| resolved_at, closed_at | timestamptz | |
| kb_published | bool default true | |
| search_text | text generated | title‖symptom‖tags‖product (검색·유사도용) |
| deleted_at | timestamptz null | soft delete |
| source | text default 'manual' | |
| created_by, updated_by | uuid FK profiles | |
| created_at, updated_at | timestamptz | |

**issue_resolutions** — issue_id PK/FK, cause text not null, action text not null, prevention, customer_guide, resolved_by FK profiles, resolved_at, updated_at

**issue_events** (append-only) — id bigserial, issue_id FK, type event_type, actor_id FK profiles, message text, payload jsonb (변경 전/후 값), created_at

**issue_schedules** — id, issue_id FK null(이슈 무관 일정 허용), customer_id FK null, engineer_id FK, date date, start_time time, end_time time, type schedule_type, note, created_by, created_at

**issue_attachments** — id, issue_id FK, storage_path text, file_name, size_bytes, mime_type, uploaded_by, created_at

**reports** — id, issue_id FK null, customer_id FK, kind ('issue_resolution' / 'customer_history'), storage_path, issued_by, created_at

**notifications** — id, user_id FK, issue_id FK, kind ('sla_soon','sla_over','assigned','mention'), message, read_at, created_at

**kb_feedback** (P1) — id, source_issue_id, suggested_issue_id, user_id, action ('viewed','helpful'), created_at

**import_batches** — id, kind ('customers','contacts','assets','contracts','issues'), file_path, total_rows, ok_rows, error_rows, errors jsonb, status ('validated','committed','rolled_back'), created_by, created_at — 이관 대상 테이블은 `import_batch_id` 컬럼으로 연결해 롤백

### 7.4 주요 인덱스
```sql
create extension if not exists pg_trgm;
create index on issues using gin (search_text gin_trgm_ops);
create index on issue_resolutions using gin ((cause || ' ' || action) gin_trgm_ops);
create index on issues (status, due_at) where deleted_at is null;
create index on issues (customer_id, created_at desc);
create index on issues (assignee_id) where status not in ('해결','종료');
create index on issue_schedules (date, engineer_id);
```

### 7.5 트리거·함수
| 이름 | 시점 | 동작 |
|---|---|---|
| `set_issue_no()` | issues BEFORE INSERT | 월별 시퀀스로 `ISS-YYMM-0001` 채번 |
| `calc_due_at()` | issues BEFORE INSERT/UPDATE(priority) | `due_manual = false`이면 현재 계약 SLA(없으면 기본값)로 due_at 계산 |
| `sla_pause_resume()` | issues BEFORE UPDATE(status) | 보류·고객확인대기 진입 시 `sla_paused_at` 기록, 이탈 시 정지 시간만큼 `due_at`·`sla_paused_total` 증가 |
| `log_issue_event()` | issues AFTER INSERT/UPDATE | 상태·담당·우선순위·기한 변경을 issue_events에 자동 기록 |
| `on_resolution_upsert()` | issue_resolutions AFTER INSERT | 이슈 상태 `해결`, `resolved_at` 기록 |
| `set_first_response()` | issues/issue_events | 첫 배정 또는 첫 메모 시 `first_response_at` 기록 |
| `guard_status_transition()` | issues BEFORE UPDATE | `종료`는 admin만, `해결`은 resolution 존재 시만 허용 |
| `handle_new_user()` | auth.users AFTER INSERT | profiles 생성, 회사 도메인 검사 |

### 7.6 RPC (클라이언트 호출 함수)
| 함수 | 반환 | 용도 |
|---|---|---|
| `match_similar_issues(q text, product text, category, customer_id uuid, exclude uuid, limit int)` | 이슈 + score | 유사 해결 사례 추천 (KB-03) |
| `search_kb(q text, product text, category)` | 해결 사례 목록 | 지식베이스 검색 |
| `dashboard_summary()` | KPI json | 대시보드 |
| `engineer_workload(week_start date)` | 엔지니어별 집계 | 업무량 |
| `repeat_issue_groups(days int)` | 고객사·제품·유형 반복 그룹 | REP-03 |
| `similar_issue_clusters(days int, threshold real)` | 유사 증상 묶음 | REP-02 |
| `customer_stats(customer_id)` | 고객사 통계 | CUST-06 |

**유사도 점수 (MVP)**
```
score = similarity(search_text, q)            -- pg_trgm, 0~1
      + 0.12 (같은 제품) + 0.06 (같은 유형) + 0.04 (같은 고객사)
조건: 해결 기록 있음 AND kb_published AND base similarity > 0.08
```
- 한글은 Postgres 기본 전문검색 사전이 없으므로 MVP는 pg_trgm(문자 n-gram)을 사용한다.
- 2차: Edge Function이 해결 시점에 임베딩을 생성해 `issue_embeddings(vector)`에 저장하고, `pgvector` 코사인 유사도와 trgm 점수를 혼합한다.

---

## 8. 권한 (RLS 정책)

헬퍼: `auth_role()` = 현재 사용자의 `profiles.role` (JWT custom claim으로 캐싱), 비활성 사용자는 null.

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| profiles | 로그인 사용자 전체 | 트리거만 | 본인(연락처·전문분야·색상) / admin(전체) | 불가 (비활성화로 대체) |
| customers · contacts · assets · contracts · contract_sla | 로그인 사용자 | admin | admin | admin |
| issues | 로그인 사용자 (`deleted_at is null`, admin은 삭제분 포함) | admin, engineer | admin, engineer (종료 전환은 트리거에서 admin만) | admin (soft delete) |
| issue_resolutions | 로그인 사용자 | admin, engineer | admin, engineer | admin |
| issue_events | 로그인 사용자 | admin, engineer (트리거 포함) | **불가** | **불가** |
| issue_schedules | 로그인 사용자 | admin, engineer | admin, 작성자 본인, 해당 엔지니어 | admin, 작성자 본인 |
| issue_attachments | 로그인 사용자 | admin, engineer | 불가 | admin, 업로더 본인 |
| reports | 로그인 사용자 | admin, engineer | 불가 | admin |
| notifications | 본인 | 서버(트리거/cron) | 본인(read_at) | 본인 |

Storage 버킷
| 버킷 | 공개 | 정책 |
|---|---|---|
| `issue-attachments` | 비공개 | 로그인 사용자 읽기, engineer 이상 업로드, 경로 `{issue_id}/{file}` |
| `reports` | 비공개 | 로그인 사용자 읽기, 고객 전달은 서명 URL(7일 만료) |
| `imports` | 비공개 | admin만 |

---

## 9. 화면 목록

| 화면 | 경로 | 주요 요소 | 권한 |
|---|---|---|---|
| 로그인 | `/login` | 이메일 로그인 | 전체 |
| 대시보드 | `/` | KPI, 기한 위험, 내 담당, 7일 일정, 업무량 | 전체 |
| 고객사 목록 | `/customers` | 카드, 검색, 등급 필터 | 전체 |
| 고객사 상세 | `/customers/[id]` | 통계, 기본·담당자, 계약/SLA, 장비, 유형 Top5, 이슈 이력, PDF | 전체 (수정 admin) |
| 이슈 목록 | `/issues` | 탭, 검색, 필터 | 전체 |
| 이슈 등록/수정 | 모달 | 입력 폼 + 유사 사례 실시간 패널 | admin, engineer |
| 이슈 상세 | `/issues/[no]` | 상태 트랙, 증상, 해결 내용, 이력·메모, 담당·일정, 유사 사례, 반복 경고, 첨부, PDF | 전체 (쓰기 admin, engineer) |
| 해결 기록 | 모달 | 원인·조치·재발방지·고객 가이드 + 참고 사례 | admin, engineer |
| 일정 | `/calendar` | 월/주, 엔지니어 필터, 업무량 | 전체 |
| 지식베이스 | `/kb` | 검색, 제품·유형 필터, 사례 카드 | 전체 |
| 반복 이슈 리포트 | `/reports` | 기간, 유사 묶음, 반복 그룹, 제품/고객사별, 엔지니어 현황 | 전체 |
| 설정 – 사용자 | `/settings/users` | 초대, 역할, 활성화 | admin |
| 설정 – 데이터 이관 | `/settings/import` | CSV 업로드, 미리보기, 결과, 롤백 | admin |
| 알림 | 헤더 드롭다운 | SLA·배정 알림 | 전체 |

> UI 디자인·화면 흐름은 프로토타입(claude.ai 아티팩트)을 기준으로 하며, 사용자 피드백으로 보완한다.

---

## 10. 데이터 이관 계획

1. **템플릿 제공**: 고객사 / 담당자 / 장비 / 계약 / 과거 이슈 5종 CSV 템플릿
2. **매핑**
   - 고객사명으로 customers 매칭 (없으면 생성)
   - 담당 엔지니어 이름 → profiles 매칭 (사전 등록 필요)
   - 과거 이슈의 원인·조치가 있으면 issue_resolutions 생성 → **이관 즉시 지식베이스에 반영**
   - 과거 이슈 상태는 기본 `종료`, 이슈 번호는 `ISS-IMP-0001` 형식으로 구분
3. **검증**: 미리보기에서 필수값 누락·중복·날짜 형식 오류 행 표시 → 오류 행 제외 후 반영
4. **롤백**: `source = 'import'` + import 배치 ID로 일괄 삭제
5. **프로토타입 데이터**: 프로토타입에는 예시 데이터만 있으므로 이관하지 않는다.

---

## 11. 개발·배포 (GitHub · Supabase · Vercel)

### 11.1 저장소 구조 (GitHub `Ljeelra/CIMSYS`)
```
CIMSYS/
├─ apps/web/                  # React + Vite 웹 (Vercel 배포)
│  └─ src/{pages,components,lib}
├─ packages/shared/           # 공통 상수·타입·SLA 계산·날짜 포맷 (+ Vitest)
├─ supabase/
│  ├─ migrations/             # 스키마·트리거·RLS·RPC·Storage·cron (SQL)
│  ├─ functions/              # Edge Functions (invite-user, update-user)
│  ├─ tests/database/         # pgTAP 테스트
│  ├─ seed.sql                # 로컬 개발용 예시 데이터 (운영 미적용)
│  └─ config.toml
├─ scripts/                   # Docker 없이 DB 테스트하는 보조 스크립트
├─ .github/workflows/         # ci.yml, deploy-supabase.yml
├─ docs/                      # prd.md, SETUP.md
└─ vercel.json
```

### 11.2 브랜치·협업 규칙
| 항목 | 규칙 |
|---|---|
| 브랜치 | `main`(운영) ← `develop`(통합) ← `feature/ISS-03-설명`, `fix/...` |
| 커밋 메시지 | Conventional Commits (`feat:`, `fix:`, `db:`, `docs:`, `chore:`) |
| PR | 리뷰 1명 이상 + CI 통과 필수, Squash merge |
| 보호 규칙 | `main` 직접 push·강제 push 금지 (저장소 설정) |
| 작업 관리 | GitHub Issues(기능·버그 템플릿) + Projects 보드. PRD 요구사항 ID를 제목·라벨에 표기 |
| DB 변경 | `supabase/migrations`의 **새 파일**로만. 대시보드에서 직접 스키마 수정 금지 |

### 11.3 GitHub Actions
| 워크플로 | 트리거 | 단계 |
|---|---|---|
| `ci.yml` | PR, `main`·`develop` push | 린트·타입체크·단위 테스트·웹 빌드 / 로컬 Supabase에 마이그레이션 적용 후 pgTAP / Edge Functions 타입 검사 |
| `deploy-supabase.yml` | `main` push (migrations·functions 변경 시), 수동 실행 | 운영 프로젝트 연결 → `supabase db push` → 함수 비밀값 → `supabase functions deploy` |
| Vercel (GitHub 연동) | `main` push → 운영, PR → 미리보기 | 웹 빌드·배포 |
| Dependabot | 주 1회 | npm·Actions 의존성 업데이트 PR |

### 11.4 환경과 비밀값
| 위치 | 이름 | 값 |
|---|---|---|
| GitHub Secrets | `SUPABASE_ACCESS_TOKEN` | Supabase 계정 Access Token |
| GitHub Secrets | `SUPABASE_DB_PASSWORD` | 프로젝트 DB 비밀번호 |
| GitHub Secrets | `SUPABASE_PROJECT_REF` | `qrgcauiomsozqoyxrkvo` |
| GitHub Secrets | `SITE_URL` | Vercel 운영 주소 |
| Vercel 환경변수 | `VITE_SUPABASE_URL` | `https://qrgcauiomsozqoyxrkvo.supabase.co` |
| Vercel 환경변수 | `VITE_SUPABASE_ANON_KEY` | 프로젝트 anon(public) 키 |

- `service_role` 키는 Supabase가 Edge Functions에 자동 주입한다. 저장소·Vercel 어디에도 넣지 않는다.
- 설정 절차는 `docs/SETUP.md` 참고.

### 11.5 테스트 기준
| 대상 | 도구 | 현황 |
|---|---|---|
| RLS·트리거·RPC | pgTAP | ✅ 48개 (역할별 허용·거부, 채번, SLA 기한·일시정지, 상태 전이, 이력 불변, 유사 추천, 고객사 저장) |
| 공통 로직 | Vitest | ✅ 10개 (SLA 상태, 시간 표시, KST 변환, 태그) |
| Edge Functions | deno check | ✅ 타입 검사 |
| E2E | Playwright | 3단계에서 추가 |

---

## 12. 일정 및 진행 현황

| 단계 | 기간 | 산출물 | 상태 |
|---|---|---|---|
| 0. 준비 | 1주 | 저장소·CI·모노레포 골격, Supabase·Vercel 프로젝트 | ✅ 코드 완료 / 연결 설정 필요 |
| 1. DB | 1주 | 스키마·트리거·RLS·RPC·Storage·cron, pgTAP | ✅ 완료 |
| 2. 핵심 화면 | 2주 | 로그인·비밀번호 설정, 대시보드(기본), 고객사, 이슈 등록·상세·목록, 상태 흐름, 해결 기록, 사용자 관리 | ✅ 완료 |
| 3. 운영 기능 | 1.5주 | 일정 캘린더, SLA 알림 화면, 첨부파일, E2E | 예정 |
| 4. 지식·리포트 | 1.5주 | 지식베이스 화면, 반복 리포트 화면, PDF(generate-report) | 예정 (DB RPC는 완료) |
| 5. 이관·테스트 | 1주 | import-data, 실데이터 검증, 사용자 테스트 | 예정 |
| 6. 오픈 | — | 운영 전환, 안정화 | 예정 |

---

## 13. 결정 사항

| # | 항목 | 결정 |
|---|---|---|
| 1 | 로그인 방식 | ✅ 이메일 + 비밀번호, 관리자 초대(초대 메일 또는 임시 비밀번호), `ablearn.kr` 도메인만 |
| 2 | 서버·호스팅 | ✅ Supabase Edge Functions + Vercel(웹) |
| 2-1 | 저장소 | ✅ GitHub `Ljeelra/CIMSYS` |
| 3 | Supabase 프로젝트 | ✅ `qrgcauiomsozqoyxrkvo` (리전·플랜은 대시보드에서 확인) |
| 4 | 알림 채널 | MVP 인앱, 2차 메신저 (미정) |
| 5 | SLA 시간 기준 | MVP 24시간 기준 |
| 6 | 유형·접수 경로 | ✅ 관리자 편집 가능한 코드 테이블(`code_values`) |
| 7 | 보고서 양식 | 로고·문서번호 필요 여부 확인 필요 (4단계 전) |
| 8 | 고객사 포털 | 2차 이후 |
| 9 | 메일 발송 | 초대·비밀번호 재설정 메일을 위해 Supabase에 회사 SMTP 등록 권장 (기본 발송은 시간당 몇 통으로 제한) |

---

## 부록 A. 프로토타입 대비 변경점

| 항목 | 프로토타입 (아티팩트) | 운영판 (Supabase) |
|---|---|---|
| 저장소 | 문서형 공유 DB (이슈 1건 = 문서 1개, 이력·일정 배열 포함) | 정규화된 Postgres 테이블 |
| 권한 | 아티팩트 공유 등급 (편집자/기여자) | Supabase Auth + RLS, 역할 3종 |
| 이슈 번호 | 날짜 + 랜덤 4자리 | 월별 순번 (중복 없음) |
| 처리 이력 | 배열에 덧붙임 (동시 수정 시 유실 가능) | append-only 테이블 + 트리거 자동 기록 |
| SLA 일시정지 | 표시만 | 정지 시간만큼 기한 자동 연장 |
| 유사 추천 | 브라우저에서 단어/2-gram 계산 | DB의 pg_trgm RPC (2차 pgvector) |
| 집계 | 브라우저에서 전체 데이터 계산 | View/RPC로 서버 집계 |
| PDF | 화면 캡처 이미지 방식 | Edge Function에서 PDF 생성 (4단계) |
| 코드 관리 | 단일 HTML 파일 | GitHub 모노레포 + PR 리뷰 + Actions 자동 테스트·배포 |
| 첨부파일 | 없음 | Supabase Storage |
| 알림 | 없음 | 인앱 알림 + pg_cron SLA 점검 |
| 이관 | Claude가 직접 입력 | CSV 업로드 화면 |
