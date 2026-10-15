// SLA 상태 계산 — DB의 dashboard_summary / sla_scan 과 같은 기준 (PRD SLA-04)
import { DONE_STATUSES, PAUSED_STATUSES, type IssueStatus } from "./constants";

export type SlaState = "none" | "ok" | "soon" | "over" | "paused" | "met" | "missed";

export interface SlaInput {
  status: IssueStatus;
  created_at: string;
  due_at: string | null;
  resolved_at: string | null;
}

export interface SlaInfo {
  state: SlaState;
  /** 남은(음수면 초과) 시간, 시간 단위 */
  hoursLeft: number | null;
  label: string;
}

const HOUR = 3_600_000;

export function slaInfo(i: SlaInput, now: Date = new Date()): SlaInfo {
  if (!i.due_at) return { state: "none", hoursLeft: null, label: "-" };
  const due = new Date(i.due_at).getTime();

  if (DONE_STATUSES.includes(i.status)) {
    const resolved = i.resolved_at ? new Date(i.resolved_at).getTime() : now.getTime();
    return resolved <= due
      ? { state: "met", hoursLeft: null, label: "기한 준수" }
      : { state: "missed", hoursLeft: null, label: "기한 초과 해결" };
  }
  if (PAUSED_STATUSES.includes(i.status)) return { state: "paused", hoursLeft: null, label: "일시정지" };

  const left = (due - now.getTime()) / HOUR;
  const total = (due - new Date(i.created_at).getTime()) / HOUR;
  if (left < 0) return { state: "over", hoursLeft: left, label: `${formatHours(-left)} 초과` };
  if (left < Math.max(2, total * 0.25)) return { state: "soon", hoursLeft: left, label: `${formatHours(left)} 남음` };
  return { state: "ok", hoursLeft: left, label: `${formatHours(left)} 남음` };
}

/** 1.5 → "1.5시간", 0.3 → "18분", 50 → "2.1일" */
export function formatHours(h: number | null | undefined): string {
  if (h == null || Number.isNaN(h)) return "-";
  const a = Math.abs(h);
  if (a < 1) return `${Math.round(a * 60)}분`;
  if (a < 48) return `${Math.round(a * 10) / 10}시간`;
  return `${Math.round((a / 24) * 10) / 10}일`;
}

/** 정렬용 우선순위: 초과 → 임박 → 정상 → 일시정지 → 기한 없음 → 완료 */
export const SLA_RANK: Record<SlaState, number> = { over: 0, soon: 1, ok: 2, paused: 3, none: 4, met: 5, missed: 5 };
