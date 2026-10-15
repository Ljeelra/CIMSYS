// POST /functions/v1/bulk-create-users  (관리자 전용)
// body: { users: [{ email, name, role?, team?, title?, phone?, password? }], must_change_password?: boolean }
// 비밀번호를 비우면 임시 비밀번호를 생성해 결과로 돌려준다 (이 응답에서만 확인 가능).
import { allowedDomains, requireRole } from "../_shared/auth.ts";
import { corsHeaders, errorResponse, HttpError, json, readJson } from "../_shared/http.ts";
import { createWithPassword, generatePassword, type NewUser, validateNewUser } from "../_shared/users.ts";

interface Body {
  users?: NewUser[];
  must_change_password?: boolean;
}

interface RowResult {
  row: number;
  email: string;
  name: string;
  ok: boolean;
  password?: string;
  error?: string;
}

const MAX_ROWS = 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "POST만 지원합니다.");
    const { admin } = await requireRole(req, ["admin"]);
    const body = await readJson<Body>(req);
    const users = body.users ?? [];
    if (!Array.isArray(users) || users.length === 0) throw new HttpError(400, "BAD_REQUEST", "추가할 사용자가 없습니다.");
    if (users.length > MAX_ROWS) throw new HttpError(400, "TOO_MANY", `한 번에 ${MAX_ROWS}명까지 추가할 수 있습니다.`);

    const domains = await allowedDomains(admin);
    const mustChange = body.must_change_password ?? true;
    const seen = new Set<string>();
    const results: RowResult[] = [];

    for (const [i, u] of users.entries()) {
      const base = { row: i + 1, email: (u.email ?? "").trim().toLowerCase(), name: (u.name ?? "").trim() };
      try {
        const v = validateNewUser(u, domains);
        if (seen.has(v.email)) throw new HttpError(400, "DUPLICATE", "목록에 같은 이메일이 두 번 있습니다.");
        seen.add(v.email);
        const password = u.password || generatePassword();
        await createWithPassword(admin, u, v, password, mustChange);
        results.push({ ...base, ok: true, password });
      } catch (e) {
        results.push({ ...base, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return json({ results, created: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
  } catch (e) {
    return errorResponse(e);
  }
});
