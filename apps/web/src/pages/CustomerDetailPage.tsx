import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DEFAULT_SLA_HOURS, dday, formatHours, isOpen, PRIORITIES } from "@issue-desk/shared";
import { useAuth } from "../lib/auth";
import { currentContract, useCustomer, useCustomerStats, useIssues, useProfiles } from "../lib/data";
import { IssueTable } from "../components/IssueTable";
import { Empty, Loading, Pill, PriorityTag, SampleTag, Who } from "../components/ui";
import { IssueFormModal } from "./IssueFormModal";

export function CustomerDetailPage() {
  const { id } = useParams();
  const { isAdmin, canWrite } = useAuth();
  const customer = useCustomer(id);
  const stats = useCustomerStats(id);
  const issues = useIssues();
  const { map } = useProfiles();
  const [creating, setCreating] = useState(false);

  if (customer.isLoading) return <Loading />;
  const c = customer.data;
  if (!c)
    return (
      <div className="panel">
        <Empty>
          고객사를 찾을 수 없습니다. <Link to="/customers">목록으로</Link>
        </Empty>
      </div>
    );

  const ct = currentContract(c.contracts);
  const sla = Object.fromEntries((ct?.contract_sla ?? []).map((s) => [s.priority, s.resolve_hours]));
  const d = dday(ct?.end_date);
  const list = (issues.data ?? []).filter((i) => i.customer_id === c.id);
  const s = stats.data;
  const maxTop = Math.max(1, ...(s?.top_types ?? []).map((t) => t.count));

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/customers" className="btn sm ghost" style={{ marginLeft: -10 }}>
            ← 고객사
          </Link>
          <h1>
            {c.name}
            <SampleTag source={c.source} /> {c.is_archived && <Pill tone="mute">보관</Pill>}
          </h1>
          <div className="sub">
            {c.industry}
            {c.code && (
              <>
                {" "}
                · <span className="mono">{c.code}</span>
              </>
            )}
          </div>
        </div>
        <div className="row">
          {canWrite && !c.is_archived && (
            <button className="btn primary" onClick={() => setCreating(true)}>
              + 이 고객사 이슈 등록
            </button>
          )}
          {isAdmin && (
            <Link className="btn" to={`/customers/${c.id}/edit`}>
              정보 수정
            </Link>
          )}
        </div>
      </div>

      <div className="kpis">
        <div className="kpi" style={{ cursor: "default" }}>
          <span className="l">진행 중</span>
          <span className="v" style={{ color: "var(--accent-fg)" }}>
            {s?.open ?? "-"}
          </span>
        </div>
        <div className="kpi" style={{ cursor: "default" }}>
          <span className="l">누적 이슈</span>
          <span className="v">{s?.total ?? "-"}</span>
        </div>
        <div className="kpi" style={{ cursor: "default" }}>
          <span className="l">평균 처리 시간</span>
          <span className="v">{formatHours(s?.avg_resolve_hours)}</span>
        </div>
        <div className="kpi" style={{ cursor: "default" }}>
          <span className="l">기한 준수율</span>
          <span className="v">{s?.sla_met_rate == null ? "-" : `${s.sla_met_rate}%`}</span>
        </div>
        <div className="kpi" style={{ cursor: "default" }}>
          <span className="l">계약 만료</span>
          <span
            className="v"
            style={{ fontSize: 20, color: d != null && d <= 60 ? (d < 0 ? "var(--crit)" : "var(--warn)") : undefined }}
          >
            {d == null ? "-" : d < 0 ? "만료" : `D-${d}`}
          </span>
        </div>
      </div>

      <div className="grid g-3">
        <section className="panel">
          <header>
            <h2>기본 정보</h2>
          </header>
          <div className="body">
            <dl className="dl">
              <dt>주소</dt>
              <dd>{c.address || "-"}</dd>
              <dt>사내 영업</dt>
              <dd>{c.account_manager || "-"}</dd>
              <dt>담당 엔지니어</dt>
              <dd>
                <Who profile={c.owner_engineer_id ? map.get(c.owner_engineer_id) : null} />
              </dd>
              <dt>메모</dt>
              <dd className="prose" style={{ fontSize: 13 }}>
                {c.memo || "-"}
              </dd>
            </dl>
            <h3 style={{ margin: "16px 0 8px" }}>고객 담당자</h3>
            {c.customer_contacts.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {c.customer_contacts.map((p) => (
                  <div key={p.id} style={{ fontSize: 13 }}>
                    <b style={{ fontWeight: 600 }}>{p.name}</b> <span className="muted">{p.role}</span>
                    {p.is_primary && (
                      <>
                        {" "}
                        <Pill tone="acc" plain>
                          주 담당
                        </Pill>
                      </>
                    )}
                    <div className="mono muted" style={{ fontSize: 12, userSelect: "all" }}>
                      {[p.phone, p.email].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                등록된 담당자가 없습니다.
              </p>
            )}
          </div>
        </section>
        <section className="panel">
          <header>
            <h2>계약 · 유지보수 / SLA</h2>
          </header>
          <div className="body">
            <dl className="dl">
              <dt>계약 등급</dt>
              <dd>{ct?.tier ? <Pill tone="acc">{ct.tier}</Pill> : "-"}</dd>
              <dt>계약 기간</dt>
              <dd className="mono">
                {ct?.start_date ?? "-"} ~ {ct?.end_date ?? "-"}
              </dd>
              <dt>초기 응답</dt>
              <dd>{ct?.response_hours != null ? `${ct.response_hours}시간 이내` : "-"}</dd>
              <dt>점검 주기</dt>
              <dd>{ct?.inspection_cycle || "-"}</dd>
              <dt>비고</dt>
              <dd>{ct?.notes || "-"}</dd>
            </dl>
            <h3 style={{ margin: "16px 0 8px" }}>우선순위별 해결 기한</h3>
            <div className="sla-grid">
              {PRIORITIES.map((p) => (
                <div key={p} style={{ background: "var(--surface-2)", borderRadius: 7, padding: "8px 10px" }}>
                  <PriorityTag priority={p} />
                  <div className="mono" style={{ fontSize: 15, marginTop: 2 }}>
                    {sla[p] ?? DEFAULT_SLA_HOURS[p]}h
                    {sla[p] == null && (
                      <span className="faint" style={{ fontSize: 11 }}>
                        {" "}
                        기본
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="panel">
          <header>
            <h2>자주 발생하는 유형</h2>
          </header>
          <div className="body">
            {s?.top_types.length ? (
              s.top_types.map((t) => (
                <div key={`${t.product}|${t.category}`} className="hbar-row">
                  <span className="lab" title={`${t.product} · ${t.category}`}>
                    {t.product} · {t.category}
                  </span>
                  <div className="bar">
                    <i
                      style={{
                        width: `${(t.count / maxTop) * 100}%`,
                        background: t.count >= 3 ? "var(--crit)" : "var(--accent)",
                      }}
                    />
                  </div>
                  <span className="val">{t.count}</span>
                </div>
              ))
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                이슈 이력이 없습니다.
              </p>
            )}
            {s?.top_types.some((t) => t.count >= 3) && (
              <p className="notice" style={{ margin: "12px 0 0" }}>
                빨간 막대는 3회 이상 반복된 유형입니다. 근본 대책 검토가 필요합니다.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <header>
          <h2>설치 장비 · 시스템 구성</h2>
          <span className="spacer" />
          <span className="faint" style={{ fontSize: 12 }}>
            {c.customer_assets.length}건
          </span>
        </header>
        {c.customer_assets.length ? (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>제품</th>
                  <th>모델/버전</th>
                  <th>수량</th>
                  <th>라이선스/시리얼</th>
                  <th>설치일</th>
                  <th>환경·비고</th>
                  <th>이슈</th>
                </tr>
              </thead>
              <tbody>
                {c.customer_assets.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <b style={{ fontWeight: 500 }}>{a.product}</b>
                    </td>
                    <td className="mono">{a.model_version}</td>
                    <td className="mono">{a.qty}</td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {a.license_serial}
                    </td>
                    <td className="mono">{a.installed_at}</td>
                    <td>{[a.environment, a.note].filter(Boolean).join(" · ")}</td>
                    <td className="mono">
                      {list.filter((i) => i.asset_id === a.id || i.product === a.product).length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>등록된 장비가 없습니다.</Empty>
        )}
      </section>

      <section className="panel">
        <header>
          <h2>이슈 이력</h2>
          <span className="spacer" />
          <span className="faint" style={{ fontSize: 12 }}>
            진행 {list.filter((i) => isOpen(i.status)).length} · 전체 {list.length}
          </span>
        </header>
        <IssueTable issues={list} showCustomer={false} />
      </section>
      {creating && <IssueFormModal presetCustomerId={c.id} onClose={() => setCreating(false)} />}
    </>
  );
}
