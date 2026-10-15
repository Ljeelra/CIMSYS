import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ENGINEER_COLORS,
  slaInfo,
  type IssuePriority,
  type IssueStatus,
  type Profile,
  type SlaInput,
} from "@issue-desk/shared";

// ---------------------------------------------------------------------
// 상태 표시
// ---------------------------------------------------------------------
const STATUS_TONE: Record<IssueStatus, string> = {
  접수: "info",
  배정: "acc",
  진행: "acc",
  보류: "hold",
  고객확인대기: "hold",
  해결: "ok",
  종료: "mute",
};
const PRIORITY_TONE: Record<IssuePriority, string> = { 긴급: "crit", 높음: "warn", 보통: "info", 낮음: "mute" };
const SLA_TONE = {
  none: "ok",
  ok: "ok",
  soon: "warn",
  over: "crit",
  paused: "hold",
  met: "ok",
  missed: "crit",
} as const;

export function Pill({ tone, children, plain }: { tone: string; children: ReactNode; plain?: boolean }) {
  return <span className={`pill t-${tone}${plain ? " plain" : ""}`}>{children}</span>;
}
export const StatusPill = ({ status }: { status: IssueStatus }) => <Pill tone={STATUS_TONE[status]}>{status}</Pill>;
export const PriorityTag = ({ priority }: { priority: IssuePriority }) => (
  <span className={`pri ${PRIORITY_TONE[priority]}`}>
    <i />
    {priority}
  </span>
);
export function SlaTag({ issue }: { issue: SlaInput }) {
  const s = slaInfo(issue);
  return <span className={`sla ${SLA_TONE[s.state]}`}>{s.label}</span>;
}
export const SampleTag = ({ source }: { source?: string }) =>
  source === "sample" ? <span className="sample">예시</span> : null;

export function Who({ profile, showName = true }: { profile: Profile | null | undefined; showName?: boolean }) {
  if (!profile) return <span className="faint">미배정</span>;
  return (
    <span className="who" title={profile.name}>
      <span className="dot" style={{ background: ENGINEER_COLORS[profile.color % ENGINEER_COLORS.length] }}>
        {profile.name.slice(0, 1)}
      </span>
      {showName && profile.name}
    </span>
  );
}

export const Spinner = () => <span className="spin" aria-label="불러오는 중" />;
export const Loading = ({ text = "불러오는 중…" }: { text?: string }) => <div className="loading">{text}</div>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
export const ErrorBox = ({ error }: { error: string | null | undefined }) =>
  error ? (
    <div className="err-box" role="alert">
      {error}
    </div>
  ) : null;

// ---------------------------------------------------------------------
// 토스트
// ---------------------------------------------------------------------
interface ToastItem {
  id: number;
  text: string;
  kind: "" | "err";
}
const ToastContext = createContext<(text: string, kind?: "" | "err") => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((text: string, kind: "" | "err" = "") => {
    const id = ++seq.current;
    setItems((xs) => [...xs, { id, text, kind }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === "err" ? 5000 : 2600);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div id="toast" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

// ---------------------------------------------------------------------
// 모달 / 확인창
// ---------------------------------------------------------------------
export function Modal({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div id="modal">
      <div className="scrim" onClick={onClose} />
      <div className={`dialog${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}

interface ConfirmState {
  text: string;
  ok: string;
  danger: boolean;
  resolve: (v: boolean) => void;
}
const ConfirmContext = createContext<(text: string, opts?: { ok?: string; danger?: boolean }) => Promise<boolean>>(
  async () => false,
);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const ask = useCallback(
    (text: string, opts?: { ok?: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) =>
        setState({ text, ok: opts?.ok ?? "확인", danger: Boolean(opts?.danger), resolve }),
      ),
    [],
  );
  const done = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {state && (
        <div id="confirm">
          <div className="scrim" />
          <div className="dialog" role="alertdialog" aria-modal="true" style={{ width: "min(420px,100%)" }}>
            <div className="dialog-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{state.text}</p>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button className="btn" onClick={() => done(false)}>
                  취소
                </button>
                <button className={`btn ${state.danger ? "danger" : "primary"}`} onClick={() => done(true)} autoFocus>
                  {state.ok}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmContext);

export const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
