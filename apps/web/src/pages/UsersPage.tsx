import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ENGINEER_COLORS, ROLE_LABEL, ROLES, type Profile, type Role } from "@issue-desk/shared";
import { useAuth } from "../lib/auth";
import { useProfiles } from "../lib/data";
import { errorMessage } from "../lib/errors";
import { callFunction, supabase } from "../lib/supabase";
import { Empty, ErrorBox, Loading, Modal, Pill, useToast, Who } from "../components/ui";

export function UsersPage() {
  const { isAdmin, profile: me } = useAuth();
  const profiles = useProfiles();
  const [modal, setModal] = useState<"add" | "invite" | "bulk" | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);

  if (profiles.isLoading) return <Loading />;
  const list = profiles.data ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>사용자</h1>
          <div className="sub">관리자 · 엔지니어 · 조회자 계정 관리</div>
        </div>
        {isAdmin && (
          <div className="row">
            <button className="btn" onClick={() => setModal("bulk")}>
              일괄 추가
            </button>
            <button className="btn" onClick={() => setModal("invite")}>
              초대 메일
            </button>
            <button className="btn primary" onClick={() => setModal("add")}>
              + 사용자 추가
            </button>
          </div>
        )}
      </div>
      <section className="panel">
        {list.length ? (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>이름</th>
                  <th>이메일</th>
                  <th>역할</th>
                  <th>팀 · 직책</th>
                  <th>전문 분야</th>
                  <th>연락처</th>
                  <th>상태</th>
                  {isAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className={p.is_active ? "" : "deleted"}>
                    <td>
                      <Who profile={p} />
                      {p.id === me?.id && <span className="faint"> (나)</span>}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {p.email}
                    </td>
                    <td>
                      <Pill tone={p.role === "admin" ? "acc" : p.role === "engineer" ? "info" : "mute"} plain>
                        {ROLE_LABEL[p.role]}
                      </Pill>
                    </td>
                    <td>{[p.team, p.title].filter(Boolean).join(" · ")}</td>
                    <td>
                      <span className="tags">
                        {p.skills.map((s) => (
                          <span key={s} className="tag">
                            {s}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {p.phone}
                    </td>
                    <td>
                      {p.is_active ? <Pill tone="ok">활성</Pill> : <Pill tone="mute">비활성</Pill>}
                      {p.is_active && p.must_change_password && (
                        <>
                          {" "}
                          <Pill tone="warn" plain>
                            비밀번호 변경 전
                          </Pill>
                        </>
                      )}
                    </td>
                    {isAdmin && (
                      <td>
                        <button className="btn sm" onClick={() => setEditing(p)}>
                          수정
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>등록된 사용자가 없습니다.</Empty>
        )}
      </section>
      <div className="grid g-2">
        <section className="panel">
          <header>
            <h2>권한 안내</h2>
          </header>
          <div className="body">
            <dl className="dl">
              <dt>관리자</dt>
              <dd>고객사·계약·장비 관리, 사용자 추가·권한 변경, 이슈 배정·종료·삭제</dd>
              <dt>엔지니어</dt>
              <dd>이슈 등록·수정, 상태 변경(종료 제외), 해결 기록, 메모</dd>
              <dt>조회자</dt>
              <dd>모든 정보 조회 (영업·CS 등)</dd>
            </dl>
          </div>
        </section>
        <section className="panel">
          <header>
            <h2>계정 만드는 방법</h2>
          </header>
          <div className="body" style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={{ margin: 0 }}>
              <b>사용자 추가</b>: 메일 없이 바로 계정을 만들고 임시 비밀번호를 전달합니다.
            </p>
            <p style={{ margin: 0 }}>
              <b>일괄 추가</b>: 엑셀에서 복사한 표(이메일·이름·역할·팀·직책·연락처)로 여러 명을 한 번에 만듭니다.
            </p>
            <p style={{ margin: 0 }}>
              <b>초대 메일</b>: 사용자가 메일의 링크를 눌러 직접 비밀번호를 정합니다.
            </p>
            <p className="faint" style={{ margin: 0 }}>
              임시 비밀번호로 만든 계정은 첫 로그인 때 비밀번호를 바꿔야 시작할 수 있습니다. 회사 도메인 이메일만
              등록할 수 있습니다.
            </p>
          </div>
        </section>
      </div>
      {modal === "add" && <AddUserModal onClose={() => setModal(null)} />}
      {modal === "invite" && <InviteModal onClose={() => setModal(null)} />}
      {modal === "bulk" && <BulkAddModal onClose={() => setModal(null)} />}
      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

const ROLE_BY_LABEL: Record<string, Role> = {
  관리자: "admin",
  admin: "admin",
  엔지니어: "engineer",
  engineer: "engineer",
  조회자: "viewer",
  viewer: "viewer",
};

interface CreatedAccount {
  email: string;
  name: string;
  password: string;
}

/** 만든 계정의 임시 비밀번호를 한 번만 보여주고 복사할 수 있게 한다. */
function CredentialList({ items }: { items: CreatedAccount[] }) {
  const toast = useToast();
  const loginUrl = window.location.origin;
  const text = items
    .map((a) => `${a.name} / 아이디: ${a.email} / 임시 비밀번호: ${a.password}`)
    .concat(`접속 주소: ${loginUrl} (첫 로그인 때 비밀번호를 바꿔야 합니다)`)
    .join("\n");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast("복사했습니다.");
    } catch {
      toast("복사하지 못했습니다. 직접 선택해 복사하세요.");
    }
  }
  return (
    <div className="full" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ margin: 0, fontSize: 13 }}>
        임시 비밀번호는 <b>지금만</b> 확인할 수 있습니다. 복사해서 각 사용자에게 전달하세요.
      </p>
      <textarea readOnly value={text} rows={Math.min(10, items.length + 2)} className="mono" style={{ fontSize: 12 }} />
      <div>
        <button type="button" className="btn" onClick={copy}>
          전체 복사
        </button>
      </div>
    </div>
  );
}

function AddUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    email: "",
    name: "",
    role: "engineer" as Role,
    team: "",
    title: "",
    phone: "",
    password: "",
    mustChange: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedAccount | null>(null);
  const set = (k: "email" | "name" | "role" | "team" | "title" | "phone" | "password") =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // 비밀번호를 비우면 서버가 만든 임시 비밀번호를 결과로 받는다 (bulk 함수 재사용)
      const res = await callFunction<{ results: { ok: boolean; password?: string; error?: string }[] }>(
        "bulk-create-users",
        {
          users: [
            {
              email: f.email,
              name: f.name,
              role: f.role,
              team: f.team || undefined,
              title: f.title || undefined,
              phone: f.phone || undefined,
              password: f.password || undefined,
            },
          ],
          must_change_password: f.mustChange,
        },
      );
      const r = res.results[0];
      if (!r?.ok) throw new Error(r?.error ?? "계정을 만들지 못했습니다.");
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      toast("계정을 만들었습니다.");
      setCreated({ email: f.email.trim().toLowerCase(), name: f.name.trim(), password: r.password ?? f.password });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (created)
    return (
      <Modal title="계정을 만들었습니다" onClose={onClose}>
        <div className="form">
          <CredentialList items={[created]} />
          <div className="form-actions">
            <button className="btn primary" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </Modal>
    );

  return (
    <Modal title="사용자 추가" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="fld">
          <label htmlFor="a-email">회사 이메일 *</label>
          <input id="a-email" type="email" required value={f.email} onChange={set("email")} autoFocus />
        </div>
        <div className="fld">
          <label htmlFor="a-name">이름 *</label>
          <input id="a-name" required value={f.name} onChange={set("name")} />
        </div>
        <div className="fld">
          <label htmlFor="a-role">역할</label>
          <select id="a-role" value={f.role} onChange={set("role")}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="a-team">팀</label>
          <input id="a-team" value={f.team} onChange={set("team")} />
        </div>
        <div className="fld">
          <label htmlFor="a-title">직책</label>
          <input id="a-title" value={f.title} onChange={set("title")} />
        </div>
        <div className="fld">
          <label htmlFor="a-phone">연락처</label>
          <input id="a-phone" value={f.phone} onChange={set("phone")} />
        </div>
        <div className="fld full">
          <label htmlFor="a-pw">임시 비밀번호 (비우면 자동 생성, 직접 입력 시 8자 이상)</label>
          <input
            id="a-pw"
            type="text"
            minLength={8}
            value={f.password}
            onChange={set("password")}
            autoComplete="off"
            placeholder="자동 생성"
          />
        </div>
        <div className="fld full">
          <label className="check">
            <input
              type="checkbox"
              checked={f.mustChange}
              onChange={(e) => setF((x) => ({ ...x, mustChange: e.target.checked }))}
            />{" "}
            첫 로그인 때 비밀번호 변경 요구
          </label>
        </div>
        <div className="full">
          <ErrorBox error={error} />
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "처리 중…" : "계정 만들기"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ email: "", name: "", role: "engineer" as Role, team: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await callFunction("invite-user", { email: f.email, name: f.name, role: f.role, team: f.team || undefined });
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      toast("초대 메일을 보냈습니다.");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="초대 메일 보내기" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="fld">
          <label htmlFor="u-email">회사 이메일 *</label>
          <input id="u-email" type="email" required value={f.email} onChange={set("email")} autoFocus />
        </div>
        <div className="fld">
          <label htmlFor="u-name">이름 *</label>
          <input id="u-name" required value={f.name} onChange={set("name")} />
        </div>
        <div className="fld">
          <label htmlFor="u-role">역할</label>
          <select id="u-role" value={f.role} onChange={set("role")}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="u-team">팀</label>
          <input id="u-team" value={f.team} onChange={set("team")} />
        </div>
        <p className="faint full" style={{ margin: 0, fontSize: 12 }}>
          사용자가 메일의 링크를 눌러 직접 비밀번호를 정합니다. Supabase 기본 메일은 시간당 발송 수가 적으니 여러 명은
          ‘사용자 추가’나 ‘일괄 추가’를 쓰세요.
        </p>
        <div className="full">
          <ErrorBox error={error} />
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "처리 중…" : "초대 메일 보내기"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface BulkRow {
  email: string;
  name: string;
  role: Role;
  team: string;
  title: string;
  phone: string;
  problem?: string;
}

/** 엑셀 복사(탭) 또는 CSV(쉼표) 붙여넣기 → 행 목록. 첫 줄이 머리글이면 건너뛴다. */
function parseBulk(text: string): BulkRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(line.includes("\t") ? "\t" : ",").map((c) => c.trim().replace(/^"|"$/g, "")))
    .filter((cells, i) => !(i === 0 && !cells[0].includes("@")))
    .map(([email = "", name = "", role = "", team = "", title = "", phone = ""]) => {
      const r = role ? ROLE_BY_LABEL[role.toLowerCase()] ?? ROLE_BY_LABEL[role] : "engineer";
      const problem = !email.includes("@") ? "이메일 확인" : !name ? "이름 없음" : !r ? `역할 '${role}' 확인` : undefined;
      return { email: email.toLowerCase(), name, role: r ?? "engineer", team, title, phone, problem };
    });
}

interface BulkResult {
  row: number;
  email: string;
  name: string;
  ok: boolean;
  password?: string;
  error?: string;
}

function BulkAddModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [mustChange, setMustChange] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const rows = parseBulk(text);
  const invalid = rows.filter((r) => r.problem).length;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await callFunction<{ results: BulkResult[] }>("bulk-create-users", {
        users: rows.map((r) => ({
          email: r.email,
          name: r.name,
          role: r.role,
          team: r.team || undefined,
          title: r.title || undefined,
          phone: r.phone || undefined,
        })),
        must_change_password: mustChange,
      });
      setResults(res.results);
      await qc.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (results) {
    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    return (
      <Modal title={`일괄 추가 결과 · 성공 ${ok.length} / 실패 ${failed.length}`} onClose={onClose} wide>
        <div className="form">
          {ok.length > 0 && (
            <CredentialList items={ok.map((r) => ({ email: r.email, name: r.name, password: r.password ?? "" }))} />
          )}
          {failed.length > 0 && (
            <div className="full tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>행</th>
                    <th>이메일</th>
                    <th>이름</th>
                    <th>실패 사유</th>
                  </tr>
                </thead>
                <tbody>
                  {failed.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td className="mono">{r.email}</td>
                      <td>{r.name}</td>
                      <td style={{ color: "var(--crit, #c0392b)" }}>{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="form-actions">
            <button className="btn primary" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="사용자 일괄 추가" onClose={onClose} wide>
      <div className="form">
        <div className="fld full">
          <label htmlFor="b-text">엑셀에서 복사해 붙여넣거나 CSV로 입력 (최대 100명)</label>
          <textarea
            id="b-text"
            rows={7}
            className="mono"
            style={{ fontSize: 12 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"이메일, 이름, 역할, 팀, 직책, 연락처\nhong@unipoint.co.kr, 홍길동, 엔지니어, 기술지원팀, 선임, 010-0000-0000"}
            autoFocus
          />
          <span className="faint" style={{ fontSize: 12 }}>
            열 순서: 이메일 · 이름 · 역할(관리자/엔지니어/조회자, 비우면 엔지니어) · 팀 · 직책 · 연락처. 임시 비밀번호는
            자동으로 만듭니다.
          </span>
        </div>
        {rows.length > 0 && (
          <div className="full tbl-wrap" style={{ maxHeight: 260, overflow: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>이메일</th>
                  <th>이름</th>
                  <th>역할</th>
                  <th>팀 · 직책</th>
                  <th>연락처</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {r.email}
                    </td>
                    <td>{r.name}</td>
                    <td>{ROLE_LABEL[r.role]}</td>
                    <td>{[r.team, r.title].filter(Boolean).join(" · ")}</td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {r.phone}
                    </td>
                    <td>{r.problem ? <Pill tone="crit">{r.problem}</Pill> : <Pill tone="ok">확인</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="fld full">
          <label className="check">
            <input type="checkbox" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} /> 첫 로그인
            때 비밀번호 변경 요구
          </label>
        </div>
        <div className="full">
          <ErrorBox error={error} />
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button
            className="btn primary"
            disabled={busy || rows.length === 0 || invalid > 0 || rows.length > 100}
            onClick={submit}
          >
            {busy
              ? "만드는 중…"
              : invalid > 0
                ? `확인 필요 ${invalid}행`
                : rows.length > 100
                  ? "100명 초과"
                  : `${rows.length}명 추가`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** 관리자: 임시 비밀번호로 재설정 또는 재설정 메일 발송 */
function PasswordResetSection({ user }: { user: Profile }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<"temp" | "mail" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedAccount | null>(null);

  async function resetTemp() {
    if (!window.confirm(`${user.name}님의 비밀번호를 임시 비밀번호로 바꿉니다. 계속할까요?`)) return;
    setBusy("temp");
    setError(null);
    try {
      const res = await callFunction<{ password?: string }>("update-user", {
        user_id: user.id,
        reset_password: { must_change_password: true },
      });
      setCreated({ email: user.email ?? "", name: user.name, password: res.password ?? "" });
      qc.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function sendMail() {
    if (!user.email) return;
    setBusy("mail");
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/set-password`,
    });
    setBusy(null);
    if (error) setError(errorMessage(error));
    else toast("재설정 메일을 보냈습니다.");
  }

  return (
    <div className="fld full" style={{ borderTop: "1px solid var(--line, #e5e5e5)", paddingTop: 10 }}>
      <span className="lab">비밀번호</span>
      {created ? (
        <CredentialList items={[created]} />
      ) : (
        <div className="row">
          <button type="button" className="btn sm" onClick={resetTemp} disabled={!!busy || !user.is_active}>
            {busy === "temp" ? "처리 중…" : "임시 비밀번호로 재설정"}
          </button>
          <button type="button" className="btn sm" onClick={sendMail} disabled={!!busy || !user.is_active}>
            {busy === "mail" ? "보내는 중…" : "재설정 메일 보내기"}
          </button>
        </div>
      )}
      <ErrorBox error={error} />
    </div>
  );
}

function EditUserModal({ user, onClose }: { user: Profile; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    name: user.name,
    role: user.role,
    team: user.team ?? "",
    title: user.title ?? "",
    phone: user.phone ?? "",
    skills: user.skills.join(", "),
    color: user.color,
    is_active: user.is_active,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set =
    (k: "name" | "role" | "team" | "title" | "phone" | "skills") =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const info = {
        name: f.name.trim(),
        team: f.team || null,
        title: f.title || null,
        phone: f.phone || null,
        skills: f.skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        color: f.color,
      };
      if (f.role !== user.role || f.is_active !== user.is_active) {
        // 역할·활성 변경은 로그인 차단까지 함께 처리하는 Edge Function 사용
        await callFunction("update-user", { user_id: user.id, role: f.role, is_active: f.is_active, ...info });
      } else {
        const { error } = await supabase.from("profiles").update(info).eq("id", user.id);
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast("저장했습니다.");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`${user.name} 수정`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="fld">
          <label htmlFor="e-name">이름</label>
          <input id="e-name" required value={f.name} onChange={set("name")} />
        </div>
        <div className="fld">
          <label htmlFor="e-role">역할</label>
          <select id="e-role" value={f.role} onChange={set("role")}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="e-team">팀</label>
          <input id="e-team" value={f.team} onChange={set("team")} />
        </div>
        <div className="fld">
          <label htmlFor="e-title">직책</label>
          <input id="e-title" value={f.title} onChange={set("title")} />
        </div>
        <div className="fld">
          <label htmlFor="e-phone">연락처</label>
          <input id="e-phone" value={f.phone} onChange={set("phone")} />
        </div>
        <div className="fld">
          <label htmlFor="e-skills">전문 분야 (쉼표)</label>
          <input id="e-skills" value={f.skills} onChange={set("skills")} />
        </div>
        <div className="fld full">
          <span className="lab">캘린더 색상</span>
          <div className="row">
            {ENGINEER_COLORS.map((c, k) => (
              <button
                key={c}
                type="button"
                aria-label={`색상 ${k + 1}`}
                aria-pressed={f.color === k}
                onClick={() => setF((x) => ({ ...x, color: k }))}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: c,
                  border: f.color === k ? "3px solid var(--fg)" : "2px solid transparent",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>
        <div className="fld full">
          <label className="check">
            <input
              type="checkbox"
              checked={f.is_active}
              onChange={(e) => setF((x) => ({ ...x, is_active: e.target.checked }))}
            />{" "}
            활성 (해제하면 로그인 차단, 배정 대상 제외. 과거 이력은 유지)
          </label>
        </div>
        <PasswordResetSection user={user} />
        <div className="full">
          <ErrorBox error={error} />
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
