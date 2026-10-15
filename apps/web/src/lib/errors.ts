// Supabase/PostgREST 오류 → 사용자에게 보여줄 문장
interface PgLikeError {
  code?: string;
  message?: string;
  details?: string;
}

export function errorMessage(e: unknown): string {
  const err = (e ?? {}) as PgLikeError;
  const msg = err.message ?? String(e);
  switch (err.code) {
    case "42501":
      // 트리거가 보낸 한국어 메시지는 그대로, RLS 거부는 일반 문장으로
      return /[가-힣]/.test(msg) ? msg : "이 작업을 할 권한이 없습니다.";
    case "23505":
      return "이미 같은 값이 등록되어 있습니다. (예: 같은 고객사명)";
    case "23503":
      return /[가-힣]/.test(msg) ? msg : "연결된 데이터가 있어 처리할 수 없습니다.";
    case "23514":
    case "P0002":
      return msg;
    case "PGRST116":
      return "데이터를 찾을 수 없습니다.";
  }
  if (/Invalid login credentials/i.test(msg)) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (/Email not confirmed/i.test(msg))
    return "이메일 인증이 완료되지 않았습니다. 초대 메일의 링크를 먼저 눌러 주세요.";
  if (/User is banned/i.test(msg)) return "비활성화된 계정입니다. 관리자에게 문의하세요.";
  if (/Password should be at least/i.test(msg)) return "비밀번호는 8자 이상이어야 합니다.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "서버에 연결할 수 없습니다. 네트워크를 확인하세요.";
  return msg || "알 수 없는 오류가 발생했습니다.";
}
