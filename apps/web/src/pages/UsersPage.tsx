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
  const [inviting, setInviting] = useState(false);
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
          <button className="btn primary" onClick={() => setInviting(true)}>
            + 사용자 초대
          </button>
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
                    <td>{p.is_active ? <Pill tone="ok">활성</Pill> : <Pill tone="mute">비활성</Pill>}</td>
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
              <dd>고객사·계약·장비 관리, 사용자 초대·권한 변경, 이슈 배정·종료·삭제</dd>
              <dt>엔지니어</dt>
              <dd>이슈 등록·수정, 상태 변경(종료 제외), 해결 기록, 메모</dd>
              <dt>조회자</dt>
              <dd>모든 정보 조회 (영업·CS 등)</dd>
            </dl>
          </div>
        </section>
        <section className="panel">
          <header>
            <h2>초대 방법</h2>
          </header>
          <div className="body" style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={{ margin: 0 }}>
              <b>초대 메일</b>: 사용자가 메일의 링크를 눌러 직접 비밀번호를 정합니다.
            </p>
            <p style={{ margin: 0 }}>
              <b>임시 비밀번호</b>: 메일 없이 바로 계정을 만들고, 비밀번호를 따로 전달합니다. 첫 로그인 후 변경을
              안내하세요.
            </p>
            <p className="faint" style={{ margin: 0 }}>
              회사 도메인 이메일만 초대할 수 있습니다.
            </p>
          </div>
        </section>
      </div>
      {inviting && <InviteModal onClose={() => setInviting(false)} />}
      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    email: "",
    name: "",
    role: "engineer" as Role,
    team: "",
    title: "",
    mode: "invite",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await callFunction("invite-user", {
        email: f.email,
        name: f.name,
        role: f.role,
        team: f.team || undefined,
        title: f.title || undefined,
        password: f.mode === "password" ? f.password : undefined,
      });
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      toast(f.mode === "password" ? "계정을 만들었습니다." : "초대 메일을 보냈습니다.");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="사용자 초대" onClose={onClose}>
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
        <div className="fld full">
          <span className="lab">초대 방식</span>
          <div className="row">
            <label className="check">
              <input type="radio" name="mode" value="invite" checked={f.mode === "invite"} onChange={set("mode")} />{" "}
              초대 메일
            </label>
            <label className="check">
              <input type="radio" name="mode" value="password" checked={f.mode === "password"} onChange={set("mode")} />{" "}
              임시 비밀번호
            </label>
          </div>
        </div>
        {f.mode === "password" && (
          <div className="fld full">
            <label htmlFor="u-pw">임시 비밀번호 (8자 이상)</label>
            <input
              id="u-pw"
              type="text"
              minLength={8}
              required
              value={f.password}
              onChange={set("password")}
              autoComplete="off"
            />
          </div>
        )}
        <div className="full">
          <ErrorBox error={error} />
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "처리 중…" : f.mode === "password" ? "계정 만들기" : "초대 메일 보내기"}
          </button>
        </div>
      </form>
    </Modal>
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
