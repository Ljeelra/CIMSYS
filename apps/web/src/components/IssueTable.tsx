import { useNavigate } from "react-router-dom";
import { fmtShort } from "@issue-desk/shared";
import type { IssueRow } from "../lib/data";
import { useProfiles } from "../lib/data";
import { Empty, PriorityTag, SampleTag, SlaTag, StatusPill, Who } from "./ui";

export function IssueTable({ issues, showCustomer = true }: { issues: IssueRow[]; showCustomer?: boolean }) {
  const nav = useNavigate();
  const { map } = useProfiles();
  if (!issues.length) return <Empty>조건에 맞는 이슈가 없습니다.</Empty>;
  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>번호</th>
            <th>제목</th>
            {showCustomer && <th>고객사</th>}
            <th>우선순위</th>
            <th>상태</th>
            <th>담당</th>
            <th>처리 기한</th>
            <th>접수</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((i) => (
            <tr
              key={i.id}
              className="click"
              tabIndex={0}
              onClick={() => nav(`/issues/${i.issue_no}`)}
              onKeyDown={(e) => e.key === "Enter" && nav(`/issues/${i.issue_no}`)}
            >
              <td className="idno">{i.issue_no}</td>
              <td className="title-cell">
                <b>
                  {i.title}
                  <SampleTag source={i.source} />
                </b>
                <span>{[i.product, i.category].filter(Boolean).join(" · ")}</span>
              </td>
              {showCustomer && <td className="nw">{i.customers?.name}</td>}
              <td>
                <PriorityTag priority={i.priority} />
              </td>
              <td>
                <StatusPill status={i.status} />
              </td>
              <td>
                <Who profile={i.assignee_id ? map.get(i.assignee_id) : null} />
              </td>
              <td>
                <SlaTag issue={i} />
              </td>
              <td className="mono faint">{fmtShort(i.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
