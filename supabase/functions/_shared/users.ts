// 계정 생성 공통 로직 (invite-user, bulk-create-users)
import { adminClient, type Role } from "./auth.ts";
import { HttpError } from "./http.ts";

export const ROLES: Role[] = ["admin", "engineer", "viewer"];
type Admin = ReturnType<typeof adminClient>;

export interface NewUser {
  email?: string;
  name?: string;
  role?: Role;
  team?: string | null;
  title?: string | null;
  phone?: string | null;
  password?: string;
}

/** 읽기 쉬운 임시 비밀번호 (헷갈리는 0/O/1/l 제외, 영문 대·소문자+숫자+기호 포함) */
export function generatePassword(length = 12): string {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%*"];
  const all = sets.join("");
  const rnd = new Uint32Array(length);
  crypto.getRandomValues(rnd);
  const chars = Array.from(rnd, (n, i) => (i < sets.length ? sets[i][n % sets[i].length] : all[n % all.length]));
  // 앞자리에 몰린 필수 문자 섞기
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function validateNewUser(u: NewUser, domains: string[]) {
  const email = u.email?.trim().toLowerCase() ?? "";
  const name = u.name?.trim() ?? "";
  const role = (u.role ?? "engineer") as Role;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "INVALID_EMAIL", "이메일 형식이 올바르지 않습니다.");
  if (!name) throw new HttpError(400, "INVALID_NAME", "이름을 입력하세요.");
  if (!ROLES.includes(role)) throw new HttpError(400, "INVALID_ROLE", "역할이 올바르지 않습니다.");
  if (u.password !== undefined && u.password !== "" && u.password.length < 8) {
    throw new HttpError(400, "WEAK_PASSWORD", "비밀번호는 8자 이상이어야 합니다.");
  }
  const domain = email.split("@")[1];
  if (domains.length && !domains.includes(domain)) {
    throw new HttpError(400, "DOMAIN_NOT_ALLOWED", `회사 이메일(@${domains.join(", @")})만 등록할 수 있습니다.`);
  }
  return { email, name, role };
}

/** 비밀번호로 즉시 계정 생성 + 부가정보 저장 */
export async function createWithPassword(
  admin: Admin,
  u: NewUser,
  v: { email: string; name: string; role: Role },
  password: string,
  mustChange: boolean,
) {
  const { data, error } = await admin.auth.admin.createUser({
    email: v.email,
    password,
    email_confirm: true,
    user_metadata: { name: v.name },
    app_metadata: { role: v.role, must_change_password: mustChange },
  });
  if (error) throw new HttpError(400, "CREATE_FAILED", translateAuthError(error.message));
  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .update({
      name: v.name,
      role: v.role,
      team: u.team || null,
      title: u.title || null,
      phone: u.phone || null,
      must_change_password: mustChange,
    })
    .eq("id", data.user.id)
    .select()
    .single();
  if (pErr) throw new HttpError(500, "PROFILE_FAILED", pErr.message);
  return profile;
}

export function translateAuthError(message: string): string {
  if (/already been registered|already exists|duplicate/i.test(message)) return "이미 등록된 이메일입니다.";
  if (/rate limit/i.test(message)) return "메일 발송 한도를 초과했습니다. 잠시 후 다시 시도하거나 SMTP 설정을 확인하세요.";
  if (/Database error/i.test(message)) return "계정을 만들 수 없습니다. 이메일 도메인을 확인하세요.";
  if (/Password should/i.test(message)) return "비밀번호가 보안 기준에 맞지 않습니다. (8자 이상)";
  return message;
}
