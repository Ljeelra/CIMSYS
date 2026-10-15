// 날짜 표시 (Asia/Seoul)
const TZ = "Asia/Seoul";

function parts(iso: string) {
  const f = new Intl.DateTimeFormat("ko-KR", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return p as Record<"year" | "month" | "day" | "hour" | "minute", string>;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const p = parts(iso);
  return `${p.year}.${p.month}.${p.day}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const p = parts(iso);
  return `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}`;
}

export function fmtShort(iso: string | null | undefined): string {
  if (!iso) return "-";
  const p = parts(iso);
  return `${p.month}.${p.day} ${p.hour}:${p.minute}`;
}

/** <input type="datetime-local"> 값 (KST) */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = parts(iso);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** datetime-local(KST) → ISO */
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  return new Date(`${v}:00+09:00`).toISOString();
}

/** 오늘 기준 D-day (KST). 'YYYY-MM-DD' 입력 */
export function dday(date: string | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  const today = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now)}T00:00:00+09:00`);
  const target = new Date(`${date}T00:00:00+09:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function splitTags(s: string): string[] {
  return [
    ...new Set(
      s
        .split(/[,#\n]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ].slice(0, 12);
}
