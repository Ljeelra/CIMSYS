// POST /functions/v1/update-user  (관리자 전용)
// body: { user_id, role?, is_active?, name?, team?, title?, phone?, skills?, color? }
//  - is_active=false: 로그인 차단(ban) + 배정 대상 제외. 과거 이력은 유지 (AUTH-04)
import { requireRole } from "../_shared/auth.ts";
import { corsHeaders, errorResponse, HttpError, json, readJson } from "../_shared/http.ts";

interface Body {
  user_id?: string;
  role?: "admin" | "engineer" | "viewer";
  is_active?: boolean;
  name?: string;
  team?: string | null;
  title?: string | null;
  phone?: string | null;
  skills?: string[];
  color?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "POST만 지원합니다.");
    const { admin, caller } = await requireRole(req, ["admin"]);
    const body = await readJson<Body>(req);
    if (!body.user_id) throw new HttpError(400, "BAD_REQUEST", "user_id가 필요합니다.");
    if (body.user_id === caller.id && body.is_active === false) {
      throw new HttpError(400, "SELF_DEACTIVATE", "본인 계정은 비활성화할 수 없습니다.");
    }

    const patch: Record<string, unknown> = {};
    for (const k of ["role", "is_active", "name", "team", "title", "phone", "skills", "color"] as const) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (Object.keys(patch).length === 0) throw new HttpError(400, "BAD_REQUEST", "변경할 항목이 없습니다.");

    const { data: profile, error } = await admin
      .from("profiles")
      .update(patch)
      .eq("id", body.user_id)
      .select()
      .single();
    if (error) {
      // 트리거 메시지(예: 마지막 관리자 보호)를 그대로 전달
      throw new HttpError(400, "UPDATE_FAILED", error.message);
    }

    if (body.is_active !== undefined) {
      const { error: banErr } = await admin.auth.admin.updateUserById(body.user_id, {
        ban_duration: body.is_active ? "none" : "876000h",
      });
      if (banErr) throw new HttpError(500, "BAN_FAILED", banErr.message);
    }
    return json({ profile });
  } catch (e) {
    return errorResponse(e);
  }
});
