import { NavLink, Outlet } from "react-router-dom";
import { ROLE_LABEL } from "@issue-desk/shared";
import { useAuth } from "../lib/auth";
import { useIssues, useRealtimeSync } from "../lib/data";
import { slaInfo } from "@issue-desk/shared";

const ICON = {
  dash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  cust: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h6" />
    </svg>
  ),
  issue: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 4h16v12H8l-4 4z" />
      <path d="M12 8v3M12 13.5v.5" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c1.8.7 3 2.6 3.5 5.4" />
    </svg>
  ),
};

export function Layout() {
  const { profile, signOut } = useAuth();
  useRealtimeSync(Boolean(profile));
  const issues = useIssues();
  const overdue = (issues.data ?? []).filter((i) => slaInfo(i).state === "over").length;

  const items: [string, string, keyof typeof ICON][] = [
    ["/", "대시보드", "dash"],
    ["/customers", "고객사", "cust"],
    ["/issues", "이슈", "issue"],
    ["/settings/users", "사용자", "users"],
  ];

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">
          <div className="brand-mark">CS</div>
          <div>
            <b>고객사 이슈 데스크</b>
            <span>Field Service Desk</span>
          </div>
        </div>
        <nav className="nav">
          {items.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === "/"} title={label}>
              {ICON[icon]}
              <span className="lbl">{label}</span>
              {to === "/issues" && overdue > 0 && <span className="cnt">{overdue}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="me-card">
          <span className="eyebrow">내 계정</span>
          <b>{profile?.name}</b>
          <span>{profile ? ROLE_LABEL[profile.role] : ""}</span>
          <span className="faint" style={{ overflowWrap: "anywhere" }}>
            {profile?.email}
          </span>
          <button className="logout" onClick={signOut}>
            로그아웃
          </button>
        </div>
      </aside>
      <main>
        <div className="wrap">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
