import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CONTRACT_TIERS, dday, isOpen, slaInfo } from "@issue-desk/shared";
import { useAuth } from "../lib/auth";
import { currentContract, useCustomers, useIssues, useProfiles } from "../lib/data";
import { Empty, Loading, Pill, SampleTag, SearchIcon } from "../components/ui";

export function CustomersPage() {
  const { isAdmin } = useAuth();
  const nav = useNavigate();
  const customers = useCustomers();
  const issues = useIssues();
  const { map } = useProfiles();
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const stats = useMemo(() => {
    const m = new Map<string, { open: number; over: number; total: number }>();
    for (const i of issues.data ?? []) {
      const s = m.get(i.customer_id) ?? { open: 0, over: 0, total: 0 };
      s.total++;
      if (isOpen(i.status)) s.open++;
      if (slaInfo(i).state === "over") s.over++;
      m.set(i.customer_id, s);
    }
    return m;
  }, [issues.data]);

  if (customers.isLoading) return <Loading />;
  const needle = q.trim().toLowerCase();
  const list = (customers.data ?? []).filter((c) => {
    if (!showArchived && c.is_archived) return false;
    const ct = currentContract(c.contracts);
    if (tier && ct?.tier !== tier) return false;
    return !needle || [c.name, c.code, c.industry, c.address].join(" ").toLowerCase().includes(needle);
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>고객사</h1>
          <div className="sub">{customers.data?.length ?? 0}개 고객사 · 계약·설치 장비·이슈 현황</div>
        </div>
        {isAdmin && (
          <Link className="btn primary" to="/customers/new">
            + 고객사 추가
          </Link>
        )}
      </div>
      <div className="filters">
        <label className="search">
          <SearchIcon />
          <input
            type="search"
            placeholder="고객사명, 업종, 주소 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="고객사 검색"
          />
        </label>
        <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="계약 등급">
          <option value="">전체 계약 등급</option>
          {CONTRACT_TIERS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> 보관된
          고객사 포함
        </label>
      </div>
      {list.length ? (
        <div className="cards">
          {list.map((c) => {
            const ct = currentContract(c.contracts);
            const d = dday(ct?.end_date);
            const st = stats.get(c.id) ?? { open: 0, over: 0, total: 0 };
            const owner = c.owner_engineer_id ? map.get(c.owner_engineer_id) : null;
            return (
              <div
                key={c.id}
                className="ccard"
                role="link"
                tabIndex={0}
                onClick={() => nav(`/customers/${c.id}`)}
                onKeyDown={(e) => e.key === "Enter" && nav(`/customers/${c.id}`)}
              >
                <div className="top">
                  <div>
                    <h3>
                      {c.name}
                      <SampleTag source={c.source} />
                    </h3>
                    <div className="meta">
                      {[c.industry, c.address?.split(" ").slice(0, 2).join(" ")].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {c.is_archived ? (
                    <Pill tone="mute">보관</Pill>
                  ) : ct?.tier ? (
                    <Pill tone={ct.tier === "Premium" ? "acc" : ct.tier === "계약 만료" ? "mute" : "info"}>
                      {ct.tier}
                    </Pill>
                  ) : null}
                </div>
                <div className="meta">
                  담당 {owner?.name ?? "-"} · 계약 만료 {ct?.end_date ?? "-"}{" "}
                  {d != null && d <= 60 && (
                    <b style={{ color: d < 0 ? "var(--crit)" : "var(--warn)" }}>({d < 0 ? "만료" : `D-${d}`})</b>
                  )}
                </div>
                <div className="stats">
                  <div>
                    <b style={st.open ? { color: "var(--accent-fg)" } : undefined}>{st.open}</b>
                    <span>진행 이슈</span>
                  </div>
                  <div>
                    <b style={st.over ? { color: "var(--crit)" } : undefined}>{st.over}</b>
                    <span>기한 초과</span>
                  </div>
                  <div>
                    <b>{st.total}</b>
                    <span>누적 이슈</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="panel">
          <Empty>{customers.data?.length ? "검색 결과가 없습니다." : "등록된 고객사가 없습니다."}</Empty>
        </div>
      )}
    </>
  );
}
