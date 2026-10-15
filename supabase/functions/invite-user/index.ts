// POST /functions/v1/invite-user  (관리자 전용, AUTH-02)
// body: { email, name, role, team?, title?, phone?, password?, must_change_password? }
//  - password 없음: 초대 메일 발송 → 사용자가 링크에서 비밀번호 설정
//  - password 있음: 즉시 계정 생성 (기본: 첫 로그인 때 비밀번호 변경 강제)
import { allowedDomains, requireRole } from "../_shared/auth.ts";
import { corsHeaders, errorResponse, HttpError, json, readJson } from "../_shared/http.ts";
import { createWithPassword, type NewUser, translateAuthError, validateNewUser } from "../_shared/users.ts";

interface Body extends NewUser {
  must_change_password?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "POST만 지원합니다.");
    const { admin } = await requireRole(req, ["admin"]);
    const body = await readJson<Body>(req);
    const v = validateNewUser(body, await allowedDomains(admin));

    if (body.password) {
      const profile = await createWithPassword(admin, body, v, body.password, body.must_change_password ?? true);
      return json({ profile, invited: false });
    }

    const siteUrl = Deno.env.get("SITE_URL") ?? "";
    const { data, error } = await admin.auth.admin.inviteUserByEmail(v.email, {
      data: { name: v.name },
      redirectTo: siteUrl ? `${siteUrl.replace(/\/$/, "")}/set-password` : undefined,
    });
    if (error) throw new HttpError(400, "INVITE_FAILED", translateAuthError(error.message));

    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .update({ name: v.name, role: v.role, team: body.team || null, title: body.title || null, phone: body.phone || null })
      .eq("id", data.user.id)
      .select()
      .single();
    if (pErr) throw new HttpError(500, "PROFILE_FAILED", pErr.message);
    return json({ profile, invited: true });
  } catch (e) {
    return errorResponse(e);
  }
});
