// POST /functions/v1/change-password  (로그인한 본인)
// body: { password }
// 본인 비밀번호를 바꾸고 '비밀번호 변경 필요' 플래그를 해제한다.
import { requireRole } from "../_shared/auth.ts";
import { corsHeaders, errorResponse, HttpError, json, readJson } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "POST만 지원합니다.");
    const { admin, caller } = await requireRole(req, ["admin", "engineer", "viewer"]);
    const { password } = await readJson<{ password?: string }>(req);
    if (!password || password.length < 8) throw new HttpError(400, "WEAK_PASSWORD", "비밀번호는 8자 이상이어야 합니다.");

    const { error } = await admin.auth.admin.updateUserById(caller.id, {
      password,
      app_metadata: { must_change_password: false },
    });
    if (error) throw new HttpError(400, "UPDATE_FAILED", error.message);

    const { error: pErr } = await admin.from("profiles").update({ must_change_password: false }).eq("id", caller.id);
    if (pErr) throw new HttpError(500, "PROFILE_FAILED", pErr.message);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
});
