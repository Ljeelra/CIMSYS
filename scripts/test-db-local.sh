#!/usr/bin/env bash
# Docker 없이 로컬 PostgreSQL 16 + pgTAP 으로 마이그레이션과 DB 테스트 실행
#   사용법: PGHOST=... PGPORT=... PGUSER=postgres ./scripts/test-db-local.sh
# Docker가 있다면 `supabase start && supabase test db` 를 쓰는 것이 정식 경로다.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${TEST_DB:-issue_desk_test}"

dropdb --if-exists "$DB"
createdb "$DB" --locale=C.UTF-8 --template=template0
PSQL=(psql -v ON_ERROR_STOP=1 -q -d "$DB")

"${PSQL[@]}" -f "$ROOT/scripts/local-supabase-stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -c "create extension if not exists pgtap with schema extensions;"
"${PSQL[@]}" -f "$ROOT/supabase/seed.sql" >/dev/null

echo "→ pgTAP"
for t in "$ROOT"/supabase/tests/database/*.test.sql; do
  psql -X -q -d "$DB" -v ON_ERROR_STOP=1 -c "set search_path = public, extensions;" -f "$t"
done
