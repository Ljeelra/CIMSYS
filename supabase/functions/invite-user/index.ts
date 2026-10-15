// POST /functions/v1/invite-user  (관리자 전용, AUTH-02)
// body: { email, name, role, team?, title?, phone?, password? }
//  - password 없음: 초대 메일 발송 → 사용자가 링크에서 비밀번호 설정
//  - password 있음: 임시 비밀번호로 즉시 계정 생성 (SMTP 미설정 환경용)
import { allowedDomains, requireRole, type Role } from "../_shared/auth.ts";
import { corsHeaders, errorResponse, HttpError, json, readJson } from "../_shared/http.ts";

interface Body {
  email?: string;
  name?: string;
  role?: Role;
  team?: string;
  title?: string;
  phone?: string;
  password?: string;
}

const ROLES: Role[] = ["admin", "engineer", "viewer"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "POST만 지원합니다.");
    const { admin } = await requireRole(req, ["admin"]);
    const body = await readJson<Body>(req);

    const email = body.email?.trim().toLowerCase() ?? "";
    const name = body.name?.trim() ?? "";
    const role = body.role ?? "engineer";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      throw new HttpError(400, "INVALID_EMAIL", "이메일 형식이 올바르지 않습니다.");
    if (!name) throw new HttpError(400, "INVALID_NAME", "이름을 입력하세요.");
    if (!ROLES.includes(role)) throw new HttpError(400, "INVALID_ROLE", "역할이 올바르지 않습니다.");
    if (body.password !== undefined && body.password.length < 8) {
      throw new HttpError(400, "WEAK_PASSWORD", "임시 비밀번호는 8자 이상이어야 합니다.");
    }

    const domains = await allowedDomains(admin);
    const domain = email.split("@")[1];
    if (domains.length && !domains.includes(domain)) {
      throw new HttpError(400, "DOMAIN_NOT_ALLOWED", `회사 이메일(@${domains.join(", @")})만 초대할 수 있습니다.`);
    }

    let userId: string;
    if (body.password) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: { name },
        app_metadata: { role },
      });
      if (error) throw new HttpError(400, "CREATE_FAILED", translate(error.message));
      userId = data.user.id;
    } else {
      const siteUrl = Deno.env.get("SITE_URL") ?? "";
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { name },
        redirectTo: siteUrl ? `${siteUrl.replace(/\/$/, "")}/set-password` : undefined,
      });
      if (error) throw new HttpError(400, "INVITE_FAILED", translate(error.message));
      userId = data.user.id;
    }

    // 역할·부가정보 반영 (service role → RLS·본인 제한 트리거 우회)
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .update({ name, role, team: body.team ?? null, title: body.title ?? null, phone: body.phone ?? null })
      .eq("id", userId)
      .select()
      .single();
    if (pErr) throw new HttpError(500, "PROFILE_FAILED", pErr.message);

    return json({ profile, invited: !body.password });
  } catch (e) {
    return errorResponse(e);
  }
});

function translate(message: string): string {
  if (/already been registered|already exists/i.test(message)) return "이미 등록된 이메일입니다.";
  if (/rate limit/i.test(message))
    return "메일 발송 한도를 초과했습니다. 잠시 후 다시 시도하거나 SMTP 설정을 확인하세요.";
  return message;
}
