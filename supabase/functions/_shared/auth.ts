// 호출자 확인: 사용자 JWT 검증 → profiles.role 조회
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { HttpError } from "./http.ts";

export type Role = "admin" | "engineer" | "viewer";

export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new HttpError(500, "CONFIG", "서버 환경변수가 설정되지 않았습니다.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function requireRole(req: Request, allowed: Role[]) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "UNAUTHORIZED", "로그인이 필요합니다.");

  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "UNAUTHORIZED", "로그인 정보가 만료되었습니다. 다시 로그인하세요.");

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, is_active, name")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile?.is_active || !allowed.includes(profile.role as Role)) {
    throw new HttpError(403, "FORBIDDEN", "이 작업을 할 권한이 없습니다.");
  }
  return { admin, caller: profile as { id: string; role: Role; name: string } };
}

export async function allowedDomains(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "allowed_email_domains").maybeSingle();
  return (data?.value ?? "")
    .toLowerCase()
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
}
