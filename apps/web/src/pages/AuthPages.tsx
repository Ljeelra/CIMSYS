import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { errorMessage } from "../lib/errors";
import { callFunction, supabase } from "../lib/supabase";
import { ErrorBox, Loading } from "../components/ui";

function AuthCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark">CS</div>
          <div>
            <b>고객사 이슈 데스크</b>
            <span>Field Service Desk</span>
          </div>
        </div>
        <div>
          <h1 style={{ fontSize: 20 }}>{title}</h1>
          {sub && (
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              {sub}
            </p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (session) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(errorMessage(error));
  }

  return (
    <AuthCard title="로그인" sub="회사 이메일 계정으로 로그인하세요.">
      <form onSubmit={submit}>
        <div className="fld">
          <label htmlFor="login-email">이메일</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@ablearn.kr"
          />
        </div>
        <div className="fld">
          <label htmlFor="login-pw">비밀번호</label>
          <input
            id="login-pw"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <ErrorBox error={error} />
        <button className="btn primary" disabled={busy} style={{ justifyContent: "center" }}>
          {busy ? "로그인 중…" : "로그인"}
        </button>
      </form>
      <div className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
        <Link to="/forgot-password" className="link-btn">
          비밀번호를 잊으셨나요?
        </Link>
        <span className="faint">계정은 관리자가 초대합니다</span>
      </div>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/set-password`,
    });
    setBusy(false);
    if (error) setError(errorMessage(error));
    else setSent(true);
  }

  return (
    <AuthCard title="비밀번호 재설정" sub="가입한 이메일로 재설정 링크를 보내 드립니다.">
      {sent ? (
        <div className="ok-box">메일을 보냈습니다. 받은 편지함에서 링크를 눌러 새 비밀번호를 설정하세요.</div>
      ) : (
        <form onSubmit={submit}>
          <div className="fld">
            <label htmlFor="fp-email">이메일</label>
            <input id="fp-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <ErrorBox error={error} />
          <button className="btn primary" disabled={busy} style={{ justifyContent: "center" }}>
            재설정 메일 보내기
          </button>
        </form>
      )}
      <Link to="/login" className="link-btn">
        ← 로그인으로
      </Link>
    </AuthCard>
  );
}

/** 초대 메일·재설정 메일의 링크가 도착하는 곳 */
export function SetPasswordPage() {
  const { session, loading } = useAuth();
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading text="링크를 확인하는 중…" />;
  if (!session)
    return (
      <AuthCard title="링크가 만료되었습니다" sub="초대·재설정 링크는 한 번만 사용할 수 있습니다.">
        <Link
          to="/forgot-password"
          className="btn primary"
          style={{ justifyContent: "center", textDecoration: "none" }}
        >
          재설정 메일 다시 받기
        </Link>
      </AuthCard>
    );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setError("비밀번호는 8자 이상이어야 합니다.");
    if (pw !== pw2) return setError("두 비밀번호가 일치하지 않습니다.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setError(errorMessage(error));
    else nav("/", { replace: true });
  }

  return (
    <AuthCard title="비밀번호 설정" sub={`${session.user.email} 계정의 비밀번호를 정하세요.`}>
      <form onSubmit={submit}>
        <div className="fld">
          <label htmlFor="sp-1">새 비밀번호 (8자 이상)</label>
          <input
            id="sp-1"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
          />
        </div>
        <div className="fld">
          <label htmlFor="sp-2">새 비밀번호 확인</label>
          <input
            id="sp-2"
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            required
          />
        </div>
        <ErrorBox error={error} />
        <button className="btn primary" disabled={busy} style={{ justifyContent: "center" }}>
          저장하고 시작하기
        </button>
      </form>
    </AuthCard>
  );
}

export function NotConfiguredPage() {
  return (
    <AuthCard title="설정이 필요합니다" sub="Supabase 연결 정보가 없습니다.">
      <p style={{ margin: 0, fontSize: 13 }}>
        <code>apps/web/.env.local</code> (Vercel은 프로젝트 환경변수)에 <code>VITE_SUPABASE_URL</code>과{" "}
        <code>VITE_SUPABASE_ANON_KEY</code>를 넣고 다시 빌드하세요. 자세한 방법은 <code>docs/SETUP.md</code>를
        참고하세요.
      </p>
    </AuthCard>
  );
}

export function InactivePage() {
  const { signOut } = useAuth();
  return (
    <AuthCard title="계정을 사용할 수 없습니다" sub="비활성화되었거나 프로필이 없는 계정입니다.">
      <p style={{ margin: 0, fontSize: 13 }}>관리자에게 계정 활성화를 요청하세요.</p>
      <button className="btn" onClick={signOut}>
        로그아웃
      </button>
    </AuthCard>
  );
}

export function ConnectionErrorPage({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { signOut } = useAuth();
  return (
    <AuthCard title="서버에 연결할 수 없습니다" sub="잠시 후 다시 시도하세요.">
      <ErrorBox error={errorMessage(error)} />
      <div className="row">
        <button className="btn primary" onClick={onRetry}>
          다시 시도
        </button>
        <button className="btn" onClick={signOut}>
          로그아웃
        </button>
      </div>
    </AuthCard>
  );
}

/** 관리자가 만든 계정(임시 비밀번호)은 첫 로그인 때 비밀번호를 바꿔야 들어갈 수 있다. */
export function ForceChangePasswordPage() {
  const { session, signOut, retryProfile } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError("비밀번호는 8자 이상이어야 합니다.");
    if (pw !== pw2) return setError("두 비밀번호가 일치하지 않습니다.");
    setBusy(true);
    try {
      await callFunction("change-password", { password: pw });
      retryProfile();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="비밀번호 변경"
      sub={`${session?.user.email ?? ""} 계정은 임시 비밀번호로 만들어졌습니다. 새 비밀번호를 정해야 시작할 수 있습니다.`}
    >
      <form onSubmit={submit}>
        <div className="fld">
          <label htmlFor="fc-1">새 비밀번호 (8자 이상)</label>
          <input
            id="fc-1"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="fld">
          <label htmlFor="fc-2">새 비밀번호 확인</label>
          <input
            id="fc-2"
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            required
          />
        </div>
        <ErrorBox error={error} />
        <button className="btn primary" disabled={busy} style={{ justifyContent: "center" }}>
          {busy ? "변경 중…" : "변경하고 시작하기"}
        </button>
        <button type="button" className="btn" onClick={signOut} style={{ justifyContent: "center" }}>
          로그아웃
        </button>
      </form>
    </AuthCard>
  );
}
