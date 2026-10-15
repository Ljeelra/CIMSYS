// 화면에서 사용하는 행 타입. 스키마 변경 후에는 `pnpm db:types` 로 생성 타입과 대조할 것.
import type { IssuePriority, IssueStatus, Role, ScheduleType } from "./constants";

export interface Profile {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  team: string | null;
  title: string | null;
  phone: string | null;
  skills: string[];
  color: number;
  is_active: boolean;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  code: string | null;
  industry: string | null;
  address: string | null;
  account_manager: string | null;
  owner_engineer_id: string | null;
  memo: string | null;
  is_archived: boolean;
  source: "manual" | "import" | "sample";
  created_at: string;
  updated_at: string;
}

export interface CustomerContact {
  id: string;
  customer_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
}

export interface CustomerAsset {
  id: string;
  customer_id: string;
  product: string;
  model_version: string | null;
  qty: number | null;
  license_serial: string | null;
  installed_at: string | null;
  environment: string | null;
  note: string | null;
}

export interface ContractSla {
  contract_id: string;
  priority: IssuePriority;
  resolve_hours: number;
}

export interface Contract {
  id: string;
  customer_id: string;
  tier: string | null;
  start_date: string | null;
  end_date: string | null;
  response_hours: number | null;
  inspection_cycle: string | null;
  notes: string | null;
  is_current: boolean;
  contract_sla?: ContractSla[];
}

export interface Issue {
  id: string;
  issue_no: string;
  customer_id: string;
  asset_id: string | null;
  product: string | null;
  title: string;
  symptom: string | null;
  category: string;
  priority: IssuePriority;
  channel: string;
  reporter_contact_id: string | null;
  reporter_name: string | null;
  status: IssueStatus;
  assignee_id: string | null;
  tags: string[];
  due_at: string | null;
  due_manual: boolean;
  sla_paused_at: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  kb_published: boolean;
  deleted_at: string | null;
  source: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IssueResolution {
  issue_id: string;
  cause: string;
  action: string;
  prevention: string | null;
  customer_guide: string | null;
  resolved_by: string | null;
  resolved_at: string;
  updated_at: string;
}

export type EventType =
  | "create"
  | "status"
  | "assign"
  | "edit"
  | "note"
  | "schedule"
  | "resolve"
  | "report"
  | "attachment";

export interface IssueEvent {
  id: number;
  issue_id: string;
  type: EventType;
  actor_id: string | null;
  message: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface IssueSchedule {
  id: string;
  issue_id: string | null;
  customer_id: string | null;
  engineer_id: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  type: ScheduleType;
  note: string | null;
}

export interface SimilarIssue {
  id: string;
  issue_no: string;
  title: string;
  product: string | null;
  category: string;
  customer_id: string;
  customer_name: string;
  cause: string;
  action: string;
  resolved_at: string;
  resolver_name: string | null;
  score: number;
}

export interface DashboardSummary {
  open: number;
  paused: number;
  unassigned: number;
  overdue: number;
  due_soon: number;
  resolved_7d: number;
  avg_resolve_hours_30d: number | null;
}

export interface CustomerStats {
  total: number;
  open: number;
  overdue: number;
  avg_resolve_hours: number | null;
  sla_met_rate: number | null;
  top_types: { product: string; category: string; count: number }[];
}
