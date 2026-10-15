import { Link } from "react-router-dom";
import { fmtDate, type SimilarIssue } from "@issue-desk/shared";

export function SimilarCards({
  items,
  loading,
  compact,
  onOpen,
}: {
  items: SimilarIssue[] | undefined;
  loading?: boolean;
  compact?: boolean;
  onOpen?: () => void;
}) {
  if (loading && !items)
    return (
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>
        찾는 중…
      </p>
    );
  if (!items?.length)
    return (
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        비슷한 해결 사례가 아직 없습니다.
      </p>
    );
  return (
    <div className="sims">
      {items.map((x) => (
        <Link key={x.id} to={`/issues/${x.issue_no}`} className="sim-card plain" onClick={onOpen}>
          <div className="h">
            <b>{x.title}</b>
            <span className="score">{Math.min(99, Math.round(x.score * 100))}%</span>
          </div>
          <p>
            <b style={{ fontWeight: 600, color: "var(--fg)" }}>원인</b> {x.cause}
          </p>
          {!compact && (
            <p>
              <b style={{ fontWeight: 600, color: "var(--fg)" }}>조치</b> {x.action}
            </p>
          )}
          <span className="faint" style={{ fontSize: 11 }}>
            {x.customer_name} · {x.product ?? ""} · {fmtDate(x.resolved_at)} · {x.resolver_name ?? ""}
          </span>
        </Link>
      ))}
    </div>
  );
}
