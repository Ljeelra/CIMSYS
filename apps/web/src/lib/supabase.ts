import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** 환경변수가 없으면 화면에 설정 안내를 띄운다 */
export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? "http://localhost:54321", anonKey ?? "missing-anon-key", {
  auth: {
    // 관리자 초대·비밀번호 재설정 메일 링크(#access_token=…)를 그대로 처리하기 위해 implicit 사용
    flowType: "implicit",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Edge Function 호출. 실패 시 서버가 보낸 한국어 메시지로 Error를 던진다 */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const j = await ctx.json();
        message = j?.error?.message ?? message;
      } catch {
        /* 본문 없음 */
      }
    }
    throw new Error(message);
  }
  return data as T;
}
