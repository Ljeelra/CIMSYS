# 설치·연결 안내 (GitHub · Supabase · Vercel)

이 문서대로 한 번 설정하면, 이후에는 `main` 브랜치에 반영하는 것만으로
**DB 변경과 서버 함수는 GitHub Actions가, 웹은 Vercel이 자동 배포**합니다.

| 대상 | 주소 |
|---|---|
| GitHub | https://github.com/Ljeelra/CIMSYS |
| Supabase | https://supabase.com/dashboard/project/qrgcauiomsozqoyxrkvo |
| Vercel | https://vercel.com/uni-7b24/cimsys_ |

---

## 1. GitHub에 코드 올리기

전달받은 `CIMSYS` 폴더에서 터미널을 열고 실행합니다. (원격 주소는 이미 설정되어 있습니다.)

```bash
git push -u origin main
```

로그인 창이 뜨면 GitHub 계정으로 로그인합니다.

권장 저장소 설정 (Settings):
- **Branches → Add rule** `main`: Require a pull request before merging, Require status checks (CI) to pass
- **Environments → New environment** `production`: (선택) Required reviewers 에 관리자 지정 → DB 배포 전에 승인 단계가 생김

## 2. Supabase 설정 (대시보드)

### 2-1. 로그인 정책
**Authentication → Sign In / Providers → Email**
- Email provider: **켜기**
- Confirm email: **켜기**
- **Allow new users to sign up: 끄기** ← 관리자 초대로만 계정 생성

**Authentication → URL Configuration**
- Site URL: `https://cimsys.vercel.app`
- Redirect URLs 에 추가:
  - `https://<Vercel 운영 주소>/set-password`
  - `http://localhost:5173/set-password` (로컬 개발용)

**Authentication → Emails → SMTP Settings** (권장)
- 회사 메일 서버(SMTP)를 등록하세요. 기본 발송은 시간당 몇 통으로 제한되어 초대 메일이 막힐 수 있습니다.
- SMTP 설정 전에는 사용자 초대 시 **임시 비밀번호** 방식을 쓰면 됩니다.

### 2-2. DB·서버 함수 배포 (GitHub Actions)

1. Supabase **Account → Access Tokens** 에서 토큰 발급
2. GitHub 저장소 **Settings → Secrets and variables → Actions → New repository secret** 에 등록

   | 이름 | 값 |
   |---|---|
   | `SUPABASE_ACCESS_TOKEN` | 1번에서 발급한 토큰 |
   | `SUPABASE_DB_PASSWORD` | 프로젝트 생성 시 정한 DB 비밀번호 (Project Settings → Database 에서 재설정 가능) |
   | `SUPABASE_PROJECT_REF` | `qrgcauiomsozqoyxrkvo` |
   | `SITE_URL` | Vercel 운영 주소 |

3. **Actions → Deploy Supabase → Run workflow** 실행
   - 마이그레이션 7개 적용 (테이블·권한·트리거·함수·Storage·SLA 점검 예약)
   - Edge Functions `invite-user`, `update-user` 배포
   - 이후에는 `supabase/` 폴더가 바뀐 채로 `main`에 반영될 때마다 자동 실행

> 터미널에서 직접 하려면:
> ```bash
> npx supabase login
> npx supabase link --project-ref qrgcauiomsozqoyxrkvo
> npx supabase db push
> npx supabase functions deploy
> npx supabase secrets set SITE_URL=https://cimsys.vercel.app
> ```

### 2-3. 첫 관리자 만들기
**Authentication → Users → Add user → Create new user**
- 이메일: 본인 회사 메일 (`@ablearn.kr`)
- 비밀번호 입력, **Auto Confirm User 체크**

DB에 관리자가 한 명도 없을 때 처음 생긴 사용자는 자동으로 **관리자**가 됩니다.
이후 사용자는 웹의 **사용자 → 사용자 초대**에서 추가합니다.

## 3. Vercel 설정

1. Vercel 프로젝트 **cimsys_ → Settings → Git** 에서 `Ljeelra/CIMSYS` 연결
2. **Settings → Build and Deployment**
   - Root Directory: 비워두기 (저장소 최상위). 빌드 설정은 `vercel.json`이 지정합니다.
   - Node.js Version: 22.x
3. **Settings → Environment Variables** (Production, Preview 모두)

   | 이름 | 값 |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://qrgcauiomsozqoyxrkvo.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | Supabase **Project Settings → API Keys** 의 `anon` (또는 `publishable`) 키 |

   > `service_role`(또는 `secret`) 키는 절대 넣지 마세요. 웹에는 공개 키만 들어갑니다.
4. **Deployments → Redeploy**
5. 배포된 주소를 Supabase Site URL·Redirect URLs, GitHub `SITE_URL` 에 반영

## 4. 동작 확인

1. Vercel 주소 접속 → 2-3에서 만든 관리자로 로그인
2. **사용자** → 엔지니어 1명 초대 (임시 비밀번호 방식이면 바로 로그인 가능)
3. **고객사 → 고객사 추가** → 계약 SLA 입력
4. **이슈 → 이슈 등록** → 처리 기한이 SLA대로 계산되는지 확인
5. 상태 변경 → **해결 기록하기** → 다른 이슈 등록 시 유사 사례로 추천되는지 확인

## 5. 로컬 개발

```bash
corepack enable            # pnpm 사용
pnpm install
npx supabase start         # Docker 필요. 마이그레이션 + 예시 데이터(seed.sql) 적용
cp apps/web/.env.example apps/web/.env.local
#   VITE_SUPABASE_URL=http://localhost:54321
#   VITE_SUPABASE_ANON_KEY=<supabase start 출력의 anon key>
pnpm dev                   # http://localhost:5173
```

- 예시 계정: `admin@ablearn.kr` / `Passw0rd!` (로컬 seed 전용, 운영에는 들어가지 않음)
- 테스트: `pnpm test`, `npx supabase test db`
- Docker 없이 DB 테스트: PostgreSQL 16 + pgTAP 설치 후 `pnpm db:test:local`

## 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 웹에 "설정이 필요합니다" | Vercel 환경변수 2개 입력 후 Redeploy |
| 로그인 후 "계정을 사용할 수 없습니다" | Authentication → Users 에 있으나 profiles 가 없는 경우: 마이그레이션 적용 **전에** 만든 계정 → 삭제 후 다시 생성 |
| 초대 메일이 안 옴 | SMTP 미설정 시 발송 한도 초과 → 임시 비밀번호 방식 사용 또는 SMTP 등록 |
| 초대 링크가 만료 화면으로 감 | Redirect URLs 에 `/set-password` 주소가 있는지 |
| Deploy Supabase 실패 | Secrets 4개 이름·값, DB 비밀번호 확인 |
