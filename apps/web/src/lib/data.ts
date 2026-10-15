// 조회 훅 — 모든 조회는 사용자 JWT로 실행되어 RLS가 적용된다
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Contract,
  Customer,
  CustomerAsset,
  CustomerContact,
  CustomerStats,
  DashboardSummary,
  Issue,
  IssueEvent,
  IssueResolution,
  Profile,
  SimilarIssue,
} from "@issue-desk/shared";
import { supabase } from "./supabase";

export type IssueRow = Issue & { customers: { name: string } | null };
export type CustomerRow = Customer & { contracts: Pick<Contract, "tier" | "end_date" | "is_current">[] };
export type CustomerFull = Customer & {
  customer_contacts: CustomerContact[];
  customer_assets: CustomerAsset[];
  contracts: Contract[];
};
export type IssueFull = Issue & {
  customers: { id: string; name: string } | null;
  issue_resolutions: IssueResolution | IssueResolution[] | null;
};

export function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export function currentContract<T extends { is_current: boolean }>(contracts: T[] | undefined): T | null {
  return contracts?.find((c) => c.is_current) ?? null;
}

export function useProfiles() {
  const q = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("name");
      if (error) throw error;
      return data as Profile[];
    },
    staleTime: 60_000,
  });
  const map = useMemo(() => new Map((q.data ?? []).map((p) => [p.id, p])), [q.data]);
  const assignable = useMemo(
    () => (q.data ?? []).filter((p) => p.is_active && (p.role === "admin" || p.role === "engineer")),
    [q.data],
  );
  return { ...q, map, assignable };
}

export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*, contracts(tier, end_date, is_current)")
        .order("name");
      if (error) throw error;
      return data as CustomerRow[];
    },
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: ["customer", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*, customer_contacts(*), customer_assets(*), contracts(*, contract_sla(*))")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as CustomerFull;
    },
  });
}

export function useCustomerStats(id: string | undefined) {
  return useQuery({
    queryKey: ["customer-stats", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("customer_stats", { p_customer: id });
      if (error) throw error;
      return data as CustomerStats;
    },
  });
}

/** 이슈 전체(삭제분 제외). 초기 규모(수천 건)를 전제로 화면에서 필터링한다 */
export function useIssues() {
  return useQuery({
    queryKey: ["issues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("issues")
        .select("*, customers(name)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data as IssueRow[];
    },
  });
}

export function useIssue(issueNo: string | undefined) {
  return useQuery({
    queryKey: ["issue", issueNo],
    enabled: Boolean(issueNo),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("issues")
        .select("*, customers(id, name), issue_resolutions(*)")
        .eq("issue_no", issueNo!)
        .maybeSingle();
      if (error) throw error;
      return data as IssueFull | null;
    },
  });
}

export function useIssueEvents(issueId: string | undefined) {
  return useQuery({
    queryKey: ["events", issueId],
    enabled: Boolean(issueId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("issue_events")
        .select("*")
        .eq("issue_id", issueId!)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      if (error) throw error;
      return data as IssueEvent[];
    },
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_summary");
      if (error) throw error;
      return data as DashboardSummary;
    },
  });
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export interface SimilarParams {
  query: string;
  product?: string | null;
  category?: string | null;
  customerId?: string | null;
  excludeId?: string | null;
  limit?: number;
}

/** 유사 해결 사례 추천 (KB-03) */
export function useSimilarIssues(p: SimilarParams) {
  const d = useDebounced(p, 350);
  return useQuery({
    queryKey: ["similar", d],
    enabled: d.query.trim().length >= 2,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("match_similar_issues", {
        p_query: d.query,
        p_product: d.product || null,
        p_category: d.category || null,
        p_customer: d.customerId || null,
        p_exclude: d.excludeId || null,
        p_limit: d.limit ?? 5,
      });
      if (error) throw error;
      return data as SimilarIssue[];
    },
  });
}

/** 이슈·이력 변경을 실시간으로 반영 (DASH-05) */
export function useRealtimeSync(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel("issue-desk")
      .on("postgres_changes", { event: "*", schema: "public", table: "issues" }, () => {
        qc.invalidateQueries({ queryKey: ["issues"] });
        qc.invalidateQueries({ queryKey: ["issue"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
        qc.invalidateQueries({ queryKey: ["customer-stats"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "issue_events" }, (payload) => {
        const issueId = (payload.new as { issue_id?: string }).issue_id;
        qc.invalidateQueries({ queryKey: ["events", issueId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "issue_resolutions" }, () => {
        qc.invalidateQueries({ queryKey: ["issue"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [enabled, qc]);
}

export function useCodes(group: "category" | "channel") {
  return useQuery({
    queryKey: ["codes", group],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("code_values")
        .select("code")
        .eq("group_key", group)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data as { code: string }[]).map((r) => r.code);
    },
  });
}

/** 이슈 등록 폼용: 고객사의 장비·담당자 */
export function useCustomerRefs(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer-refs", customerId],
    enabled: Boolean(customerId),
    queryFn: async () => {
      const [assets, contacts] = await Promise.all([
        supabase
          .from("customer_assets")
          .select("id, product, model_version")
          .eq("customer_id", customerId!)
          .eq("is_active", true),
        supabase.from("customer_contacts").select("id, name, role, phone").eq("customer_id", customerId!),
      ]);
      if (assets.error) throw assets.error;
      if (contacts.error) throw contacts.error;
      return {
        assets: assets.data as { id: string; product: string; model_version: string | null }[],
        contacts: contacts.data as { id: string; name: string; role: string | null; phone: string | null }[],
      };
    },
  });
}
