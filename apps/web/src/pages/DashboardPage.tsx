import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatHours, fmtDate, isOpen, PRIORITIES, SLA_RANK, slaInfo } from "@issue-desk/shared";
import { useAuth } from "../lib/auth";
import { useCustomers, useDashboard, useIssues, useProfiles } from "../lib/data";
import { IssueTable } from "../components/IssueTable";
import { Empty, Loading, PriorityTag, SampleTag, SlaTag, Who } from "../components/ui";
import { IssueFormModal } from "./IssueFormModal";

export function DashboardPage() {
  const { profile, canWrite, isAdmin } = useAuth();
  const nav = useNavigate();
  const summary = useDashboard();
  const issues = useIssues();
  const customers = useCustomers();
  const { map, assignable } = useProfiles();
  const [creating, setCreating] = useState(false);

  const all = useMemo(() => issues.data ?? [], [issues.data]);
  const open = all.filter((i) => isOpen(i.status));
  const risk = open
    .filter((i) => ["over", "soon"].includes(slaInfo(i).state))
    .sort(
      (a, b) =>
        SLA_RANK[slaInfo(a).state] - SLA_RANK[slaInfo(b).state] || (a.due_at ?? "").localeCompare(b.due_at ?? ""),
    );
  const mine = open
    .filter((i) => i.assignee_id === profile?.id)
    .sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority));
  const recent = all.slice(0, 8);

  if (issues.isLoading || summary.isLoading) return <Loading />;
  const s = summary.data;
  const empty = !customers.data?.length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>대시보드</h1>
          <div className="sub">
            {fmtDate(new Date().toISOString())} 기준 · 진행 중 {s?.open ?? 0}건
          </div>
        </div>
        {canWrite && (
          <button className="btn primary" onClick={() => setCreating(true)} disabled={empty}>
            + 이슈 등록
          </button>
        )}
      </div>

      {empty && (
        <div className="banner">
          <p>
            <b>아직 등록된 고객사가 없습니다.</b>
            <br />
            {isAdmin
              ? "사용자 메뉴에서 엔지니어를 초대하고, 고객사 메뉴에서 첫 고객사를 추가하세요."
              : "관리자가 고객사를 등록하면 이슈를 접수할 수 있습니다."}
          </p>
          {isAdmin && (
            <>
              <Link className="btn" to="/settings/users">
                사용자 초대
              </Link>
              <Link className="btn primary" to="/customers/new">
                고객사 추가
              </Link>
            </>
          )}
        </div>
      )}

      <div className="kpis">
        <button className="kpi" onClick={() => nav("/issues?tab=open")}>
          <span className="l">진행 중 이슈</span>
          <span className="v">{s?.open ?? 0}</span>
          <span className="faint" style={{ fontSize: 11 }}>
            보류·고객확인 {s?.paused ?? 0}건 포함
          </span>
        </button>
        <button className={`kpi ${s?.overdue ? "crit" : ""}`} onClick={() => nav("/issues?tab=risk")}>
          <span className="l">처리 기한 초과</span>
          <span className="v">{s?.overdue ?? 0}</span>
          <span className="faint" style={{ fontSize: 11 }}>
            즉시 조치 필요
          </span>
        </button>
        <button className={`kpi ${s?.due_soon ? "warn" : ""}`} onClick={() => nav("/issues?tab=risk")}>
          <span className="l">기한 임박</span>
          <span className="v">{s?.due_soon ?? 0}</span>
          <span className="faint" style={{ fontSize: 11 }}>
            잔여 25% 미만
          </span>
        </button>
        <button className="kpi ok" onClick={() => nav("/issues?tab=done")}>
          <span className="l">최근 7일 해결</span>
          <span className="v">{s?.resolved_7d ?? 0}</span>
          <span className="faint" style={{ fontSize: 11 }}>
            지식베이스 자동 축적
          </span>
        </button>
        <button className="kpi" onClick={() => nav("/issues?tab=unassigned")}>
          <span className="l">평균 처리 시간 (30일)</span>
          <span className="v">{s?.avg_resolve_hours_30d == null ? "-" : formatHours(s.avg_resolve_hours_30d)}</span>
          <span className="faint" style={{ fontSize: 11 }}>
            미배정 {s?.unassigned ?? 0}건
          </span>
        </button>
      </div>

      <div className="grid g-main">
        <div className="grid" style={{ alignContent: "start" }}>
          <section className="panel">
            <header>
              <h2>기한 위험 이슈</h2>
              <span className="spacer" />
              <span className="faint" style={{ fontSize: 12 }}>
                초과 {s?.overdue ?? 0} · 임박 {s?.due_soon ?? 0}
              </span>
            </header>
            {risk.length ? (
              <div className="list">
                {risk.slice(0, 8).map((i) => (
                  <Link key={i.id} className="li plain" to={`/issues/${i.issue_no}`}>
                    <PriorityTag priority={i.priority} />
                    <div className="grow">
                      <b>
                        {i.title}
                        <SampleTag source={i.source} />
                      </b>
                      <span>
                        {i.customers?.name} · <span className="idno">{i.issue_no}</span>
                      </span>
                    </div>
                    <Who profile={i.assignee_id ? map.get(i.assignee_id) : null} showName={false} />
                    <SlaTag issue={i} />
                  </Link>
                ))}
              </div>
            ) : (
              <Empty>기한 위험 이슈가 없습니다.</Empty>
            )}
          </section>
          <section className="panel">
            <header>
              <h2>내 담당 이슈</h2>
              <span className="spacer" />
              <span className="faint" style={{ fontSize: 12 }}>
                {mine.length}건
              </span>
            </header>
            <IssueTable issues={mine} />
          </section>
          <section className="panel">
            <header>
              <h2>최근 접수</h2>
              <span className="spacer" />
              <Link className="btn sm ghost" to="/issues?tab=all">
                전체 보기 →
              </Link>
            </header>
            <IssueTable issues={recent} />
          </section>
        </div>
        <div className="grid" style={{ alignContent: "start" }}>
          <section className="panel">
            <header>
              <h2>엔지니어 업무량</h2>
            </header>
            <div className="body">
              {assignable.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {assignable.map((p) => {
                    const theirs = open.filter((i) => i.assignee_id === p.id);
                    const max = Math.max(
                      4,
                      ...assignable.map((q) => open.filter((i) => i.assignee_id === q.id).length),
                    );
                    const by = PRIORITIES.map((pr) => theirs.filter((i) => i.priority === pr).length);
                    const atRisk = theirs.filter((i) => ["over", "soon"].includes(slaInfo(i).state)).length;
                    return (
                      <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <div className="row" style={{ justifyContent: "space-between" }}>
                          <Who profile={p} />
                          <span className="kv-mini">
                            <span>
                              <b>{theirs.length}</b>진행
                            </span>
                            {atRisk > 0 && (
                              <span style={{ color: "var(--crit)" }}>
                                <b style={{ color: "var(--crit)" }}>{atRisk}</b>기한 위험
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="bar" title={PRIORITIES.map((pr, k) => `${pr} ${by[k]}`).join(" · ")}>
                          {by.map((n, k) =>
                            n ? (
                              <i
                                key={k}
                                style={{
                                  width: `${(n / max) * 100}%`,
                                  background: `var(--${["crit", "warn", "info", "faint"][k]})`,
                                }}
                              />
                            ) : null,
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div className="legend">
                    <span>
                      <i style={{ background: "var(--crit)" }} />
                      긴급
                    </span>
                    <span>
                      <i style={{ background: "var(--warn)" }} />
                      높음
                    </span>
                    <span>
                      <i style={{ background: "var(--info)" }} />
                      보통
                    </span>
                    <span>
                      <i style={{ background: "var(--faint)" }} />
                      낮음
                    </span>
                  </div>
                </div>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  등록된 엔지니어가 없습니다.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
      {creating && <IssueFormModal onClose={() => setCreating(false)} />}
    </>
  );
}
