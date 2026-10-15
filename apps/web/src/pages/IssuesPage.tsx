import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DONE_STATUSES, isOpen, PRIORITIES, SLA_RANK, slaInfo } from "@issue-desk/shared";
import { useAuth } from "../lib/auth";
import { useCustomers, useIssues, useProfiles, type IssueRow } from "../lib/data";
import { IssueTable } from "../components/IssueTable";
import { Loading, SearchIcon } from "../components/ui";
import { IssueFormModal } from "./IssueFormModal";

type Tab = "open" | "mine" | "risk" | "unassigned" | "done" | "all";
const TABS: [Tab, string][] = [
  ["open", "진행 중"],
  ["mine", "내 담당"],
  ["risk", "기한 위험"],
  ["unassigned", "미배정"],
  ["done", "해결됨"],
  ["all", "전체"],
];

export function IssuesPage() {
  const { profile, canWrite } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "open";
  const issues = useIssues();
  const customers = useCustomers();
  const { assignable } = useProfiles();
  const [q, setQ] = useState("");
  const [cust, setCust] = useState("");
  const [pri, setPri] = useState("");
  const [eng, setEng] = useState("");
  const [creating, setCreating] = useState(false);

  const filters: Record<Tab, (i: IssueRow) => boolean> = useMemo(
    () => ({
      open: (i) => isOpen(i.status),
      mine: (i) => isOpen(i.status) && i.assignee_id === profile?.id,
      risk: (i) => ["over", "soon"].includes(slaInfo(i).state),
      unassigned: (i) => isOpen(i.status) && !i.assignee_id,
      done: (i) => DONE_STATUSES.includes(i.status),
      all: () => true,
    }),
    [profile?.id],
  );

  if (issues.isLoading) return <Loading />;
  const all = issues.data ?? [];
  const needle = q.trim().toLowerCase();
  const list = all
    .filter(filters[tab])
    .filter((i) => !cust || i.customer_id === cust)
    .filter((i) => !pri || i.priority === pri)
    .filter((i) => !eng || i.assignee_id === eng)
    .filter(
      (i) =>
        !needle ||
        [i.issue_no, i.title, i.symptom, i.product, i.category, i.customers?.name, ...i.tags]
          .join(" ")
          .toLowerCase()
          .includes(needle),
    )
    .sort((a, b) => {
      if (tab === "done") return (b.resolved_at ?? "").localeCompare(a.resolved_at ?? "");
      if (tab === "all") return b.created_at.localeCompare(a.created_at);
      return (
        SLA_RANK[slaInfo(a).state] - SLA_RANK[slaInfo(b).state] ||
        PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) ||
        (a.due_at ?? "").localeCompare(b.due_at ?? "")
      );
    });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>이슈</h1>
          <div className="sub">기한 위험 → 우선순위 순으로 정렬됩니다</div>
        </div>
        {canWrite && (
          <button className="btn primary" onClick={() => setCreating(true)}>
            + 이슈 등록
          </button>
        )}
      </div>
      <div className="seg" role="group" aria-label="이슈 구분">
        {TABS.map(([k, label]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => setParams({ tab: k })}>
            {label}
            <span className="n">{all.filter(filters[k]).length}</span>
          </button>
        ))}
      </div>
      <div className="filters">
        <label className="search">
          <SearchIcon />
          <input
            type="search"
            placeholder="번호, 제목, 증상, 태그 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="이슈 검색"
          />
        </label>
        <select value={cust} onChange={(e) => setCust(e.target.value)} aria-label="고객사">
          <option value="">전체 고객사</option>
          {(customers.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={pri} onChange={(e) => setPri(e.target.value)} aria-label="우선순위">
          <option value="">전체 우선순위</option>
          {PRIORITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select value={eng} onChange={(e) => setEng(e.target.value)} aria-label="담당자">
          <option value="">전체 담당자</option>
          {assignable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <section className="panel">
        <IssueTable issues={list} />
      </section>
      {creating && <IssueFormModal onClose={() => setCreating(false)} />}
    </>
  );
}
