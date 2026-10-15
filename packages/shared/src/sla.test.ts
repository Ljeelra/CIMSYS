import { describe, expect, it } from "vitest";
import { formatHours, slaInfo } from "./sla";
import { dday, fromLocalInput, splitTags, toLocalInput } from "./format";

const base = { created_at: "2026-10-15T00:00:00Z", resolved_at: null };
const now = new Date("2026-10-15T06:00:00Z");

describe("slaInfo", () => {
  it("남은 시간이 충분하면 정상", () => {
    expect(slaInfo({ ...base, status: "진행", due_at: "2026-10-18T00:00:00Z" }, now).state).toBe("ok");
  });
  it("잔여 25% 미만이면 임박", () => {
    expect(slaInfo({ ...base, status: "진행", due_at: "2026-10-15T07:00:00Z" }, now).state).toBe("soon");
  });
  it("기한이 지나면 초과", () => {
    const r = slaInfo({ ...base, status: "배정", due_at: "2026-10-15T04:00:00Z" }, now);
    expect(r.state).toBe("over");
    expect(r.label).toBe("2시간 초과");
  });
  it("보류·고객확인대기는 일시정지", () => {
    expect(slaInfo({ ...base, status: "고객확인대기", due_at: "2026-10-15T04:00:00Z" }, now).state).toBe("paused");
  });
  it("해결 시각이 기한 이전이면 준수", () => {
    expect(
      slaInfo({ ...base, status: "해결", due_at: "2026-10-15T08:00:00Z", resolved_at: "2026-10-15T07:00:00Z" }, now)
        .state,
    ).toBe("met");
  });
  it("기한 없으면 none", () => {
    expect(slaInfo({ ...base, status: "접수", due_at: null }, now).state).toBe("none");
  });
});

describe("format", () => {
  it("formatHours", () => {
    expect(formatHours(0.5)).toBe("30분");
    expect(formatHours(5)).toBe("5시간");
    expect(formatHours(72)).toBe("3일");
  });
  it("KST datetime-local 왕복", () => {
    expect(toLocalInput("2026-10-15T01:30:00Z")).toBe("2026-10-15T10:30");
    expect(fromLocalInput("2026-10-15T10:30")).toBe("2026-10-15T01:30:00.000Z");
  });
  it("dday (KST)", () => {
    expect(dday("2026-10-20", new Date("2026-10-15T20:00:00Z"))).toBe(4); // KST 10/16 05:00
  });
  it("splitTags 중복 제거", () => {
    expect(splitTags("백업, #디스크, 백업")).toEqual(["백업", "디스크"]);
  });
});
