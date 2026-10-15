// 업무 상수 — DB enum과 반드시 일치 (supabase/migrations/20261015000100_init_schema.sql)

export const ROLES = ["admin", "engineer", "viewer"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { admin: "관리자", engineer: "엔지니어", viewer: "조회자" };

export const STATUSES = ["접수", "배정", "진행", "보류", "고객확인대기", "해결", "종료"] as const;
export type IssueStatus = (typeof STATUSES)[number];
export const OPEN_STATUSES: readonly IssueStatus[] = ["접수", "배정", "진행", "보류", "고객확인대기"];
export const PAUSED_STATUSES: readonly IssueStatus[] = ["보류", "고객확인대기"];
export const DONE_STATUSES: readonly IssueStatus[] = ["해결", "종료"];

export const PRIORITIES = ["긴급", "높음", "보통", "낮음"] as const;
export type IssuePriority = (typeof PRIORITIES)[number];

export const SCHEDULE_TYPES = ["현장 방문", "원격 지원", "내부 작업", "고객 미팅", "정기 점검"] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

export const DEFAULT_SLA_HOURS: Record<IssuePriority, number> = { 긴급: 4, 높음: 24, 보통: 72, 낮음: 168 };

export const CONTRACT_TIERS = ["Premium", "Standard", "Basic", "무상 보증", "계약 만료"] as const;

/** 캘린더·아바타 색상 (profiles.color 0~7) */
export const ENGINEER_COLORS = [
  "#2F6FDB",
  "#D9480F",
  "#2B8A3E",
  "#9C36B5",
  "#C2255C",
  "#0B7285",
  "#B07800",
  "#5C6BC0",
] as const;

export function isOpen(s: IssueStatus): boolean {
  return OPEN_STATUSES.includes(s);
}
export function isDone(s: IssueStatus): boolean {
  return DONE_STATUSES.includes(s);
}
