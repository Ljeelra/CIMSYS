import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  fromLocalInput,
  PRIORITIES,
  splitTags,
  toLocalInput,
  type Issue,
  type IssuePriority,
} from "@issue-desk/shared";
import { useAuth } from "../lib/auth";
import { useCodes, useCustomerRefs, useCustomers, useProfiles, useSimilarIssues } from "../lib/data";
import { errorMessage } from "../lib/errors";
import { supabase } from "../lib/supabase";
import { SimilarCards } from "../components/SimilarCards";
import { ErrorBox, Modal, useToast } from "../components/ui";

export function IssueFormModal({
  issue,
  presetCustomerId,
  onClose,
}: {
  issue?: Issue;
  presetCustomerId?: string;
  onClose: () => void;
}) {
  const editing = Boolean(issue);
  const { isAdmin, profile } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const customers = useCustomers();
  const { assignable, map } = useProfiles();
  const categories = useCodes("category");
  const channels = useCodes("channel");

  const [f, setF] = useState({
    customer_id: issue?.customer_id ?? presetCustomerId ?? "",
    title: issue?.title ?? "",
    product: issue?.product ?? "",
    category: issue?.category ?? "장애",
    priority: (issue?.priority ?? "보통") as IssuePriority,
    channel: issue?.channel ?? "전화",
    reporter_name: issue?.reporter_name ?? "",
    symptom: issue?.symptom ?? "",
    assignee_id: issue?.assignee_id ?? "",
    due: issue?.due_manual ? toLocalInput(issue.due_at) : "",
    tags: (issue?.tags ?? []).join(", "),
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = useCustomerRefs(f.customer_id || undefined);
  const similar = useSimilarIssues({
    query: `${f.title} ${f.symptom} ${f.tags}`,
    product: f.product,
    category: f.category,
    customerId: f.customer_id,
    excludeId: issue?.id,
    limit: 4,
  });

  const set =
    (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF((x) => ({ ...x, [k]: e.target.value }));

  // 엔지니어는 미배정 또는 본인만 선택
  const assigneeOptions = isAdmin
    ? assignable
    : assignable.filter((p) => p.id === profile?.id || p.id === issue?.assignee_id);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.customer_id) return setError("고객사를 선택하세요.");
    setBusy(true);
    setError(null);
    const asset = refs.data?.assets.find((a) => a.product === f.product.trim());
    const contact = refs.data?.contacts.find((c) => c.name === f.reporter_name.trim());
    const row = {
      customer_id: f.customer_id,
      title: f.title.trim(),
      product: f.product.trim() || null,
      asset_id: asset?.id ?? null,
      category: f.category,
      priority: f.priority,
      channel: f.channel,
      reporter_name: f.reporter_name.trim() || null,
      reporter_contact_id: contact?.id ?? null,
      symptom: f.symptom.trim() || null,
      assignee_id: f.assignee_id || null,
      tags: splitTags(f.tags),
    };

    let issueNo = issue?.issue_no;
    if (editing && issue) {
      const patch: Record<string, unknown> = { ...row };
      const initialDue = issue.due_manual ? toLocalInput(issue.due_at) : "";
      if (f.due && f.due !== initialDue) patch.due_at = fromLocalInput(f.due);
      if (!f.due && issue.due_manual) patch.due_manual = false; // 비우면 SLA 자동 계산으로 복귀
      const { error } = await supabase.from("issues").update(patch).eq("id", issue.id);
      if (error) {
        setBusy(false);
        return setError(errorMessage(error));
      }
    } else {
      const { data, error } = await supabase
        .from("issues")
        .insert({ ...row, due_at: fromLocalInput(f.due) })
        .select("issue_no")
        .single();
      if (error) {
        setBusy(false);
        return setError(errorMessage(error));
      }
      issueNo = data.issue_no;
    }
    setBusy(false);
    await qc.invalidateQueries({ queryKey: ["issues"] });
    await qc.invalidateQueries({ queryKey: ["issue", issueNo] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    toast(editing ? "저장했습니다." : `${issueNo} 등록했습니다.`);
    onClose();
    if (!editing) nav(`/issues/${issueNo}`);
  }

  return (
    <Modal title={editing ? "이슈 수정" : "이슈 등록"} onClose={onClose} wide>
      <div className="split">
        <form className="form" onSubmit={submit} style={{ alignContent: "start" }}>
          <div className="fld full">
            <label htmlFor="i-cust">고객사 *</label>
            <select id="i-cust" required value={f.customer_id} onChange={set("customer_id")}>
              <option value="">고객사 선택</option>
              {(customers.data ?? [])
                .filter((c) => !c.is_archived || c.id === f.customer_id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="fld full">
            <label htmlFor="i-title">제목 *</label>
            <input
              id="i-title"
              required
              value={f.title}
              onChange={set("title")}
              placeholder="예: 백업 작업 실패 - 디스크 용량 부족 경고"
              autoFocus
            />
          </div>
          <div className="fld">
            <label htmlFor="i-prod">제품/시스템</label>
            <input id="i-prod" list="i-prod-list" value={f.product} onChange={set("product")} autoComplete="off" />
            <datalist id="i-prod-list">
              {[...new Set(refs.data?.assets.map((a) => a.product))].map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div className="fld">
            <label htmlFor="i-cat">유형</label>
            <select id="i-cat" value={f.category} onChange={set("category")}>
              {(categories.data ?? [f.category]).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="i-pri">우선순위</label>
            <select id="i-pri" value={f.priority} onChange={set("priority")}>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="i-ch">접수 경로</label>
            <select id="i-ch" value={f.channel} onChange={set("channel")}>
              {(channels.data ?? [f.channel]).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="fld full">
            <label htmlFor="i-rep">고객 요청자</label>
            <input
              id="i-rep"
              list="i-rep-list"
              value={f.reporter_name}
              onChange={set("reporter_name")}
              autoComplete="off"
            />
            <datalist id="i-rep-list">
              {refs.data?.contacts.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.role ?? ""}
                </option>
              ))}
            </datalist>
          </div>
          <div className="fld full">
            <label htmlFor="i-sym">증상 · 요청 내용</label>
            <textarea
              id="i-sym"
              rows={5}
              value={f.symptom}
              onChange={set("symptom")}
              placeholder="에러 메시지, 발생 시점, 영향 범위를 적으면 유사 사례 추천이 정확해집니다."
            />
          </div>
          <div className="fld">
            <label htmlFor="i-asg">담당 엔지니어</label>
            <select id="i-asg" value={f.assignee_id} onChange={set("assignee_id")}>
              <option value="">{isAdmin ? "미배정" : "미배정 (관리자 배정)"}</option>
              {assigneeOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === profile?.id ? " (나)" : ""}
                  {p.team ? ` · ${p.team}` : ""}
                </option>
              ))}
              {f.assignee_id && !assigneeOptions.some((p) => p.id === f.assignee_id) && (
                <option value={f.assignee_id}>{map.get(f.assignee_id)?.name ?? "알 수 없음"}</option>
              )}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="i-due">처리 기한</label>
            <input id="i-due" type="datetime-local" value={f.due} onChange={set("due")} />
            <span className="hint">비워두면 고객사 SLA로 자동 계산</span>
          </div>
          <div className="fld full">
            <label htmlFor="i-tags">태그 (쉼표로 구분)</label>
            <input id="i-tags" value={f.tags} onChange={set("tags")} placeholder="예: 백업, 디스크, 야간배치" />
          </div>
          <div className="full">
            <ErrorBox error={error} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={onClose}>
              취소
            </button>
            <button className="btn primary" disabled={busy}>
              {busy ? "저장 중…" : editing ? "저장" : "등록"}
            </button>
          </div>
        </form>
        <aside className="side-sim">
          <div>
            <span className="eyebrow">유사 해결 사례</span>
            <p className="faint" style={{ margin: "2px 0 0", fontSize: 12 }}>
              입력하는 동안 과거 해결 사례를 찾아 보여줍니다.
            </p>
          </div>
          <SimilarCards items={similar.data} loading={similar.isFetching} compact onOpen={onClose} />
        </aside>
      </div>
    </Modal>
  );
}
