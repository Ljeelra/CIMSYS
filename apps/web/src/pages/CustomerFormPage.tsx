import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CONTRACT_TIERS, DEFAULT_SLA_HOURS, PRIORITIES, type IssuePriority } from "@issue-desk/shared";
import { useAuth } from "../lib/auth";
import { currentContract, useCustomer, useProfiles } from "../lib/data";
import { errorMessage } from "../lib/errors";
import { supabase } from "../lib/supabase";
import { ErrorBox, Loading, useConfirm, useToast } from "../components/ui";

type Row = Record<string, string>;
interface Col {
  k: string;
  l: string;
  w?: number;
  ph?: string;
  type?: string;
}

const CONTACT_COLS: Col[] = [
  { k: "name", l: "이름", w: 80 },
  { k: "role", l: "부서/직책", w: 100 },
  { k: "phone", l: "전화", w: 120 },
  { k: "email", l: "이메일", w: 160 },
];
const ASSET_COLS: Col[] = [
  { k: "product", l: "제품", w: 120 },
  { k: "model_version", l: "모델/버전", w: 100 },
  { k: "qty", l: "수량", w: 56, type: "number" },
  { k: "license_serial", l: "라이선스/시리얼", w: 120 },
  { k: "installed_at", l: "설치일", w: 130, type: "date" },
  { k: "environment", l: "환경·비고", w: 130 },
];

function RowsEditor({
  cols,
  rows,
  onChange,
  label,
}: {
  cols: Col[];
  rows: Row[];
  onChange: (r: Row[]) => void;
  label: string;
}) {
  const set = (i: number, k: string, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="rows-ed">
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.k}>{c.l}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r._key}>
                {cols.map((c) => (
                  <td key={c.k}>
                    <input
                      type={c.type ?? "text"}
                      value={r[c.k] ?? ""}
                      placeholder={c.ph ?? c.l}
                      aria-label={`${label} ${c.l}`}
                      style={{ minWidth: c.w }}
                      onChange={(e) => set(i, c.k, e.target.value)}
                    />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 26, height: 26, fontSize: 16 }}
                    aria-label="행 삭제"
                    onClick={() => onChange(rows.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn sm ghost" onClick={() => onChange([...rows, { _key: crypto.randomUUID() }])}>
        + 행 추가
      </button>
    </div>
  );
}

const toRow = (o: object): Row => ({
  _key: crypto.randomUUID(),
  ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v == null ? "" : String(v)])),
});

export function CustomerFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { isAdmin } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const existing = useCustomer(id);
  const { assignable } = useProfiles();

  const [f, setF] = useState<Row>({ name: "" });
  const [sla, setSla] = useState<Record<IssuePriority, string>>({ 긴급: "", 높음: "", 보통: "", 낮음: "" });
  const [contacts, setContacts] = useState<Row[]>([{ _key: "c0" }]);
  const [assets, setAssets] = useState<Row[]>([{ _key: "a0" }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!editing);

  useEffect(() => {
    const c = existing.data;
    if (!c || loaded) return;
    const ct = currentContract(c.contracts);
    setF({
      name: c.name,
      code: c.code ?? "",
      industry: c.industry ?? "",
      address: c.address ?? "",
      account_manager: c.account_manager ?? "",
      owner_engineer_id: c.owner_engineer_id ?? "",
      memo: c.memo ?? "",
      is_archived: c.is_archived ? "1" : "",
      tier: ct?.tier ?? "",
      start_date: ct?.start_date ?? "",
      end_date: ct?.end_date ?? "",
      response_hours: ct?.response_hours?.toString() ?? "",
      inspection_cycle: ct?.inspection_cycle ?? "",
      notes: ct?.notes ?? "",
    });
    const s = Object.fromEntries((ct?.contract_sla ?? []).map((x) => [x.priority, String(x.resolve_hours)]));
    setSla({ 긴급: s["긴급"] ?? "", 높음: s["높음"] ?? "", 보통: s["보통"] ?? "", 낮음: s["낮음"] ?? "" });
    setContacts(c.customer_contacts.length ? c.customer_contacts.map(toRow) : [{ _key: "c0" }]);
    setAssets(c.customer_assets.length ? c.customer_assets.map(toRow) : [{ _key: "a0" }]);
    setLoaded(true);
  }, [existing.data, loaded]);

  if (!isAdmin) return <Navigate to="/customers" replace />;
  if (editing && (existing.isLoading || !loaded)) return <Loading />;

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const strip = (rows: Row[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "_key")));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      id: id ?? null,
      name: f.name,
      code: f.code,
      industry: f.industry,
      address: f.address,
      account_manager: f.account_manager,
      owner_engineer_id: f.owner_engineer_id || null,
      memo: f.memo,
      is_archived: Boolean(f.is_archived),
      contacts: strip(contacts),
      assets: strip(assets),
      contract: {
        tier: f.tier,
        start_date: f.start_date,
        end_date: f.end_date,
        response_hours: f.response_hours,
        inspection_cycle: f.inspection_cycle,
        notes: f.notes,
        sla: Object.fromEntries(PRIORITIES.map((p) => [p, sla[p] || null])),
      },
    };
    const { data, error } = await supabase.rpc("save_customer", { p: payload });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["customers"] }),
      qc.invalidateQueries({ queryKey: ["customer", data] }),
    ]);
    toast("고객사를 저장했습니다.");
    nav(`/customers/${data}`);
  }

  async function remove() {
    if (!id) return;
    if (
      !(await confirm(`${f.name}을(를) 삭제합니다.\n이슈 이력이 있으면 삭제되지 않으니 ‘보관’을 사용하세요.`, {
        ok: "삭제",
        danger: true,
      }))
    )
      return;
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) return setError(errorMessage(error));
    qc.invalidateQueries({ queryKey: ["customers"] });
    toast("삭제했습니다.");
    nav("/customers");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <Link to={id ? `/customers/${id}` : "/customers"} className="btn sm ghost" style={{ marginLeft: -10 }}>
            ← 돌아가기
          </Link>
          <h1>{editing ? "고객사 정보 수정" : "고객사 추가"}</h1>
        </div>
      </div>
      <form className="panel" onSubmit={submit}>
        <div className="body">
          <div className="form">
            <div className="fld">
              <label htmlFor="c-name">고객사명 *</label>
              <input id="c-name" required value={f.name ?? ""} onChange={set("name")} />
            </div>
            <div className="fld">
              <label htmlFor="c-code">약칭/코드</label>
              <input id="c-code" value={f.code ?? ""} onChange={set("code")} />
            </div>
            <div className="fld">
              <label htmlFor="c-ind">업종</label>
              <input id="c-ind" value={f.industry ?? ""} onChange={set("industry")} />
            </div>
            <div className="fld">
              <label htmlFor="c-am">사내 영업 담당</label>
              <input id="c-am" value={f.account_manager ?? ""} onChange={set("account_manager")} />
            </div>
            <div className="fld full">
              <label htmlFor="c-addr">주소</label>
              <input id="c-addr" value={f.address ?? ""} onChange={set("address")} />
            </div>
            <div className="fld">
              <label htmlFor="c-own">담당 엔지니어</label>
              <select id="c-own" value={f.owner_engineer_id ?? ""} onChange={set("owner_engineer_id")}>
                <option value="">지정 안 함</option>
                {assignable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.team ? ` · ${p.team}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld">
              <span className="lab">상태</span>
              <label className="check">
                <input
                  type="checkbox"
                  checked={Boolean(f.is_archived)}
                  onChange={(e) => setF((x) => ({ ...x, is_archived: e.target.checked ? "1" : "" }))}
                />{" "}
                보관 (거래 종료)
              </label>
            </div>

            <h3 className="full" style={{ marginTop: 8 }}>
              계약 · SLA
            </h3>
            <div className="fld">
              <label htmlFor="c-tier">계약 등급</label>
              <select id="c-tier" value={f.tier ?? ""} onChange={set("tier")}>
                <option value="">선택</option>
                {CONTRACT_TIERS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="c-resp">초기 응답 (시간)</label>
              <input
                id="c-resp"
                type="number"
                min={0}
                value={f.response_hours ?? ""}
                onChange={set("response_hours")}
              />
            </div>
            <div className="fld">
              <label htmlFor="c-st">계약 시작일</label>
              <input id="c-st" type="date" value={f.start_date ?? ""} onChange={set("start_date")} />
            </div>
            <div className="fld">
              <label htmlFor="c-en">계약 종료일</label>
              <input id="c-en" type="date" value={f.end_date ?? ""} onChange={set("end_date")} />
            </div>
            <div className="fld">
              <label htmlFor="c-insp">정기 점검 주기</label>
              <input
                id="c-insp"
                placeholder="예: 분기 1회"
                value={f.inspection_cycle ?? ""}
                onChange={set("inspection_cycle")}
              />
            </div>
            <div className="fld">
              <label htmlFor="c-notes">계약 비고</label>
              <input id="c-notes" value={f.notes ?? ""} onChange={set("notes")} />
            </div>
            <div className="fld full">
              <span className="lab">우선순위별 해결 기한 (시간)</span>
              <div className="sla-grid">
                {PRIORITIES.map((p) => (
                  <div key={p} className="fld">
                    <label htmlFor={`c-sla-${p}`} style={{ fontWeight: 500 }}>
                      {p}
                    </label>
                    <input
                      id={`c-sla-${p}`}
                      type="number"
                      min={1}
                      placeholder={`기본 ${DEFAULT_SLA_HOURS[p]}`}
                      value={sla[p]}
                      onChange={(e) => setSla((s) => ({ ...s, [p]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <span className="hint">
                비워두면 기본값을 사용합니다. 이슈 등록 시 이 기한으로 처리 기한이 자동 계산됩니다.
              </span>
            </div>

            <div className="fld full">
              <span className="lab">고객 담당자</span>
              <RowsEditor label="담당자" cols={CONTACT_COLS} rows={contacts} onChange={setContacts} />
            </div>
            <div className="fld full">
              <span className="lab">설치 장비 · 시스템 구성</span>
              <RowsEditor label="장비" cols={ASSET_COLS} rows={assets} onChange={setAssets} />
            </div>
            <div className="fld full">
              <label htmlFor="c-memo">메모</label>
              <textarea id="c-memo" rows={3} value={f.memo ?? ""} onChange={set("memo")} />
            </div>
            <div className="full">
              <ErrorBox error={error} />
            </div>
            <div className="form-actions">
              {editing && (
                <button type="button" className="btn danger" style={{ marginRight: "auto" }} onClick={remove}>
                  삭제
                </button>
              )}
              <Link className="btn" to={id ? `/customers/${id}` : "/customers"}>
                취소
              </Link>
              <button className="btn primary" disabled={busy}>
                {busy ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
