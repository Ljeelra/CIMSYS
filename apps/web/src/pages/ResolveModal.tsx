import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { splitTags, type Issue, type IssueResolution } from "@issue-desk/shared";
import { useSimilarIssues } from "../lib/data";
import { errorMessage } from "../lib/errors";
import { supabase } from "../lib/supabase";
import { SimilarCards } from "../components/SimilarCards";
import { ErrorBox, Modal, useToast } from "../components/ui";

/** 해결 기록 양식 (KB-01) — 저장하면 DB 트리거가 상태를 '해결'로 바꾸고 이력을 남긴다 */
export function ResolveModal({
  issue,
  resolution,
  onClose,
}: {
  issue: Issue;
  resolution: IssueResolution | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    cause: resolution?.cause ?? "",
    action: resolution?.action ?? "",
    prevention: resolution?.prevention ?? "",
    customer_guide: resolution?.customer_guide ?? "",
    tags: issue.tags.join(", "),
    kb: issue.kb_published,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const similar = useSimilarIssues({
    query: `${issue.title} ${issue.symptom ?? ""}`,
    product: issue.product,
    category: issue.category,
    excludeId: issue.id,
    limit: 3,
  });
  const set =
    (k: "cause" | "action" | "prevention" | "customer_guide" | "tags") =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      cause: f.cause.trim(),
      action: f.action.trim(),
      prevention: f.prevention.trim() || null,
      customer_guide: f.customer_guide.trim() || null,
    };
    // 태그·공개 여부는 이슈에 저장
    const tags = splitTags(f.tags);
    if (tags.join() !== issue.tags.join() || f.kb !== issue.kb_published) {
      const { error } = await supabase.from("issues").update({ tags, kb_published: f.kb }).eq("id", issue.id);
      if (error) {
        setBusy(false);
        return setError(errorMessage(error));
      }
    }
    const { error } = resolution
      ? await supabase.from("issue_resolutions").update(body).eq("issue_id", issue.id)
      : await supabase.from("issue_resolutions").insert({ issue_id: issue.id, ...body });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await qc.invalidateQueries({ queryKey: ["issue", issue.issue_no] });
    qc.invalidateQueries({ queryKey: ["issues"] });
    qc.invalidateQueries({ queryKey: ["events", issue.id] });
    toast(resolution ? "해결 내용을 수정했습니다." : "해결 처리했습니다. 지식베이스에 저장되었습니다.");
    onClose();
  }

  return (
    <Modal title="해결 기록" onClose={onClose} wide>
      <div className="split">
        <form
          className="form"
          onSubmit={submit}
          style={{ alignContent: "start", gridTemplateColumns: "minmax(0,1fr)" }}
        >
          <div className="fld">
            <label htmlFor="r-cause">원인 *</label>
            <textarea
              id="r-cause"
              rows={3}
              required
              value={f.cause}
              onChange={set("cause")}
              placeholder="근본 원인을 한두 문장으로"
              autoFocus
            />
          </div>
          <div className="fld">
            <label htmlFor="r-action">조치 내용 *</label>
            <textarea
              id="r-action"
              rows={5}
              required
              value={f.action}
              onChange={set("action")}
              placeholder="수행한 명령, 설정 변경, 교체 부품 등 다른 엔지니어가 따라할 수 있게"
            />
          </div>
          <div className="fld">
            <label htmlFor="r-prev">재발 방지 대책</label>
            <textarea
              id="r-prev"
              rows={3}
              value={f.prevention}
              onChange={set("prevention")}
              placeholder="모니터링 추가, 점검 항목 등록, 고객 교육 등"
            />
          </div>
          <div className="fld">
            <label htmlFor="r-guide">고객 안내용 해결 가이드</label>
            <textarea
              id="r-guide"
              rows={5}
              value={f.customer_guide}
              onChange={set("customer_guide")}
              placeholder="고객사에 보낼 수 있는 표현으로 작성"
            />
            <span className="hint">
              고객사에서 해결 가이드를 요청하면 이 내용으로 보고서를 만들 수 있습니다. (PDF는 4단계에서 추가)
            </span>
          </div>
          <div className="fld">
            <label htmlFor="r-tags">태그</label>
            <input id="r-tags" value={f.tags} onChange={set("tags")} />
          </div>
          <label className="check">
            <input type="checkbox" checked={f.kb} onChange={(e) => setF((x) => ({ ...x, kb: e.target.checked }))} />{" "}
            지식베이스에 공개 (사내 유사 이슈 추천에 사용)
          </label>
          <ErrorBox error={error} />
          <div className="form-actions">
            <button type="button" className="btn" onClick={onClose}>
              취소
            </button>
            <button className="btn primary" disabled={busy}>
              {busy ? "저장 중…" : resolution ? "저장" : "해결 완료"}
            </button>
          </div>
        </form>
        <aside className="side-sim">
          <span className="eyebrow">참고할 과거 사례</span>
          <SimilarCards items={similar.data} loading={similar.isFetching} compact onOpen={onClose} />
        </aside>
      </div>
    </Modal>
  );
}
