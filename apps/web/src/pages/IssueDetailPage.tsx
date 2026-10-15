import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { fmtDate, fmtDateTime, formatHours, isDone, STATUSES, type IssueStatus } from "@issue-desk/shared";
import { useAuth } from "../lib/auth";
import { one, useIssue, useIssueEvents, useIssues, useProfiles, useSimilarIssues } from "../lib/data";
import { errorMessage } from "../lib/errors";
import { supabase } from "../lib/supabase";
import { SimilarCards } from "../components/SimilarCards";
import {
  Empty,
  Loading,
  PriorityTag,
  SampleTag,
  SlaTag,
  StatusPill,
  useConfirm,
  useToast,
  Who,
} from "../components/ui";
import { IssueFormModal } from "./IssueFormModal";
import { ResolveModal } from "./ResolveModal";

export function IssueDetailPage() {
  const { issueNo } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { profile, isAdmin, canWrite } = useAuth();
  const { map, assignable } = useProfiles();
  const q = useIssue(issueNo);
  const i = q.data;
  const events = useIssueEvents(i?.id);
  const allIssues = useIssues();
  const similar = useSimilarIssues({
    query: i ? `${i.title} ${i.symptom ?? ""} ${i.tags.join(" ")}` : "",
    product: i?.product,
    category: i?.category,
    customerId: i?.customer_id,
    excludeId: i?.id,
  });
  const [editing, setEditing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (q.isLoading) return <Loading />;
  if (!i)
    return (
      <div className="panel">
        <Empty>
          이슈를 찾을 수 없습니다. <Link to="/issues">목록으로</Link>
        </Empty>
      </div>
    );

  const r = one(i.issue_resolutions);
  const sameType = (allIssues.data ?? []).filter(
    (x) => x.id !== i.id && x.customer_id === i.customer_id && x.product === i.product && x.category === i.category,
  );

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["issue", issueNo] });
    qc.invalidateQueries({ queryKey: ["issues"] });
    qc.invalidateQueries({ queryKey: ["events", i!.id] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  async function update(patch: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    const { error } = await supabase.from("issues").update(patch).eq("id", i!.id);
    setBusy(false);
    if (error) return toast(errorMessage(error), "err");
    toast(okMsg);
    refresh();
  }

  async function setStatus(s: IssueStatus) {
    if (s === i!.status) return;
    if (s === "해결" && !r) return setResolving(true);
    if (s === "종료" && !r?.cause) {
      const ok = await confirm("해결 기록(원인·조치) 없이 종료합니다.\n지식베이스에 남지 않습니다. 계속할까요?", {
        ok: "종료",
      });
      if (!ok) return;
    }
    update({ status: s }, `상태를 ‘${s}’(으)로 변경했습니다.`);
  }

  async function addNote() {
    const text = note.trim();
    if (!text) return;
    setBusy(true);
    const { error } = await supabase
      .from("issue_events")
      .insert({ issue_id: i!.id, type: "note", actor_id: profile!.id, message: text });
    setBusy(false);
    if (error) return toast(errorMessage(error), "err");
    setNote("");
    refresh();
  }

  async function remove() {
    if (
      !(await confirm(
        `${i!.issue_no} 이슈를 삭제합니다.\n30일 후 영구 삭제되며, 그 전까지 관리자가 복구할 수 있습니다.`,
        { ok: "삭제", danger: true },
      ))
    )
      return;
    const { error } = await supabase.from("issues").update({ deleted_at: new Date().toISOString() }).eq("id", i!.id);
    if (error) return toast(errorMessage(error), "err");
    toast("삭제했습니다.");
    qc.invalidateQueries({ queryKey: ["issues"] });
    nav("/issues");
  }

  async function copyGuide() {
    const text = [
      `[${i!.customers?.name ?? ""}] ${i!.title} 처리 결과 안내 (${i!.issue_no})`,
      "",
      "■ 원인",
      r?.cause ?? "",
      "",
      "■ 조치 내용",
      r?.action ?? "",
      ...(r?.prevention ? ["", "■ 재발 방지 대책", r.prevention] : []),
      ...(r?.customer_guide ? ["", "■ 해결 가이드", r.customer_guide] : []),
      "",
      `담당 엔지니어: ${map.get(r?.resolved_by ?? i!.assignee_id ?? "")?.name ?? ""}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast("고객 안내문을 복사했습니다.");
    } catch {
      toast("복사하지 못했습니다. 브라우저 권한을 확인하세요.", "err");
    }
  }

  return (
    <>
      <div>
        <button className="btn sm ghost" style={{ marginLeft: -10 }} onClick={() => nav(-1)}>
          ← 이전
        </button>
      </div>
      <div className="ticket-head">
        <div className="line1">
          <span className="idno" style={{ fontSize: 13 }}>
            {i.issue_no}
          </span>
          <StatusPill status={i.status} />
          <PriorityTag priority={i.priority} />
          <SlaTag issue={i} />
          <SampleTag source={i.source} />
          <span className="spacer" />
          {canWrite && (
            <button className="btn sm" onClick={() => setEditing(true)}>
              수정
            </button>
          )}
          {r && (
            <button className="btn sm" onClick={copyGuide}>
              안내문 복사
            </button>
          )}
          {isAdmin && (
            <button className="btn sm danger" onClick={remove}>
              삭제
            </button>
          )}
        </div>
        <h1>{i.title}</h1>
        <div className="kv-mini">
          <span>
            고객사{" "}
            <Link to={`/customers/${i.customer_id}`} style={{ color: "var(--fg)", fontWeight: 600 }}>
              {i.customers?.name}
            </Link>
          </span>
          <span>
            제품 <b style={{ fontFamily: "var(--f-body)" }}>{i.product || "-"}</b>
          </span>
          <span>
            유형 <b style={{ fontFamily: "var(--f-body)" }}>{i.category}</b>
          </span>
          <span>
            접수 <b>{fmtDateTime(i.created_at)}</b>
          </span>
          <span>
            기한 <b>{fmtDateTime(i.due_at)}</b>
            {i.due_manual && <span className="faint"> (수동)</span>}
          </span>
        </div>
        {canWrite && (
          <div className="status-track" role="group" aria-label="상태 변경">
            {STATUSES.map((s) => (
              <button
                key={s}
                aria-pressed={i.status === s}
                disabled={busy || (s === "종료" && !isAdmin)}
                title={s === "종료" && !isAdmin ? "종료는 관리자만 할 수 있습니다" : undefined}
                onClick={() => setStatus(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid g-main">
        <div className="grid" style={{ alignContent: "start" }}>
          <section className="panel">
            <header>
              <h2>증상 · 접수 내용</h2>
            </header>
            <div className="body">
              <div className="prose">{i.symptom || "-"}</div>
              <dl className="dl" style={{ marginTop: 14 }}>
                <dt>접수 경로</dt>
                <dd>{i.channel}</dd>
                <dt>고객 요청자</dt>
                <dd>{i.reporter_name || "-"}</dd>
                <dt>태그</dt>
                <dd>
                  {i.tags.length ? (
                    <span className="tags">
                      {i.tags.map((t) => (
                        <span key={t} className="tag">
                          #{t}
                        </span>
                      ))}
                    </span>
                  ) : (
                    "-"
                  )}
                </dd>
              </dl>
            </div>
          </section>

          <section className="panel">
            <header>
              <h2>해결 내용</h2>
              <span className="spacer" />
              {canWrite && (
                <button className={`btn sm ${r ? "" : "primary"}`} onClick={() => setResolving(true)}>
                  {r ? "해결 내용 수정" : "해결 기록하기"}
                </button>
              )}
            </header>
            <div className="body">
              {r ? (
                <div className="res-block">
                  <section>
                    <span className="k">원인</span>
                    <div className="prose">{r.cause}</div>
                  </section>
                  <section>
                    <span className="k">조치 내용</span>
                    <div className="prose">{r.action}</div>
                  </section>
                  {r.prevention && (
                    <section>
                      <span className="k">재발 방지 대책</span>
                      <div className="prose">{r.prevention}</div>
                    </section>
                  )}
                  {r.customer_guide && (
                    <section>
                      <span className="k">고객 안내용 해결 가이드</span>
                      <div className="prose" style={{ background: "var(--surface-2)", borderRadius: 8, padding: 12 }}>
                        {r.customer_guide}
                      </div>
                    </section>
                  )}
                  <div className="faint" style={{ fontSize: 12 }}>
                    {fmtDateTime(r.resolved_at)} · {map.get(r.resolved_by ?? "")?.name ?? ""} 해결 · 처리{" "}
                    {formatHours((new Date(r.resolved_at).getTime() - new Date(i.created_at).getTime()) / 3_600_000)} ·{" "}
                    {i.kb_published ? "지식베이스 공개" : "지식베이스 비공개"}
                  </div>
                </div>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  아직 해결되지 않았습니다. 해결 시 원인·조치·재발 방지 내용을 기록하면 지식베이스에 저장되어 다음 유사
                  이슈에 추천됩니다.
                </p>
              )}
            </div>
          </section>

          <section className="panel">
            <header>
              <h2>처리 이력</h2>
            </header>
            {canWrite && (
              <div
                className="body"
                style={{ display: "flex", gap: 8, alignItems: "flex-end", borderBottom: "1px solid var(--line)" }}
              >
                <div className="fld" style={{ flex: 1 }}>
                  <label htmlFor="note-in">메모 남기기</label>
                  <textarea
                    id="note-in"
                    rows={2}
                    style={{ minHeight: 44 }}
                    placeholder="진행 상황, 고객 통화 내용 등"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <button className="btn" onClick={addNote} disabled={busy || !note.trim()}>
                  등록
                </button>
              </div>
            )}
            <div className="timeline">
              {(events.data ?? []).map((h) => (
                <div key={h.id} className={`tl ${h.type}`}>
                  <i />
                  <div>
                    <div className="t">
                      <span className="mono">{fmtDateTime(h.created_at)}</span> ·{" "}
                      {h.actor_id ? (map.get(h.actor_id)?.name ?? "사용자") : "시스템"}
                    </div>
                    <div className="x">{h.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid" style={{ alignContent: "start" }}>
          <section className="panel">
            <header>
              <h2>담당</h2>
            </header>
            <div className="body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="fld">
                <label htmlFor="assign-sel">담당 엔지니어</label>
                {isAdmin ? (
                  <select
                    id="assign-sel"
                    value={i.assignee_id ?? ""}
                    disabled={busy}
                    onChange={(e) => update({ assignee_id: e.target.value || null }, "담당자를 변경했습니다.")}
                  >
                    <option value="">미배정</option>
                    {assignable.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.team ? ` · ${p.team}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="row">
                    <Who profile={i.assignee_id ? map.get(i.assignee_id) : null} />
                    {canWrite && !i.assignee_id && !isDone(i.status) && (
                      <button
                        className="btn sm"
                        disabled={busy}
                        onClick={() => update({ assignee_id: profile!.id }, "담당으로 지정했습니다.")}
                      >
                        내가 맡기
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p className="faint" style={{ margin: 0, fontSize: 12 }}>
                작업 일정 관리는 3단계(일정 캘린더)에서 추가됩니다.
              </p>
            </div>
          </section>

          <section className="panel">
            <header>
              <h2>유사 해결 사례</h2>
              <span className="spacer" />
              <span className="faint" style={{ fontSize: 11 }}>
                지식베이스 추천
              </span>
            </header>
            <div className="body">
              <SimilarCards items={similar.data} loading={similar.isFetching} />
            </div>
          </section>

          {sameType.length > 0 && (
            <section className="panel">
              <header>
                <h2 style={{ color: "var(--warn)" }}>이 고객사 동일 유형 {sameType.length + 1}회째</h2>
              </header>
              <div className="body">
                <p className="muted" style={{ margin: "0 0 8px", fontSize: 13 }}>
                  {i.product} · {i.category} 이슈가 이 고객사에서 반복되고 있습니다.
                </p>
                <div className="list" style={{ margin: "0 -16px" }}>
                  {sameType.slice(0, 5).map((x) => (
                    <Link key={x.id} className="li plain" to={`/issues/${x.issue_no}`}>
                      <div className="grow">
                        <b>{x.title}</b>
                        <span className="mono">{fmtDate(x.created_at)}</span>
                      </div>
                      <StatusPill status={x.status} />
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {editing && <IssueFormModal issue={i} onClose={() => setEditing(false)} />}
      {resolving && <ResolveModal issue={i} resolution={r} onClose={() => setResolving(false)} />}
    </>
  );
}
