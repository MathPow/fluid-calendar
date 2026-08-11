import {
  buildTimeline,
  formatTimestamp,
  offsetFor,
  parseTimestamp,
  timelineDuration,
  toLocal,
} from "../timeline";

const rec = (id: string, orderIndex: number, durationSec: number | null) => ({
  id,
  title: id,
  orderIndex,
  durationSec,
});

describe("buildTimeline", () => {
  it("lays recordings end to end in orderIndex order", () => {
    const timeline = buildTimeline([
      rec("b", 1, 1200),
      rec("a", 0, 3600),
      rec("c", 2, 600),
    ]);
    expect(timeline.map((t) => [t.recordingId, t.offsetSec])).toEqual([
      ["a", 0],
      ["b", 3600],
      ["c", 4800],
    ]);
  });

  it("treats an unknown duration as zero rather than shifting later files", () => {
    const timeline = buildTimeline([rec("a", 0, null), rec("b", 1, 600)]);
    expect(timeline[1].offsetSec).toBe(0);
  });

  it("sums to the session length", () => {
    expect(timelineDuration(buildTimeline([rec("a", 0, 3600), rec("b", 1, 1200)]))).toBe(
      4800
    );
    expect(timelineDuration([])).toBe(0);
  });
});

describe("offsetFor", () => {
  it("finds a recording's offset, and falls back to 0 when absent", () => {
    const timeline = buildTimeline([rec("a", 0, 3600), rec("b", 1, 600)]);
    expect(offsetFor(timeline, "b")).toBe(3600);
    expect(offsetFor(timeline, "nope")).toBe(0);
  });
});

describe("toLocal", () => {
  const timeline = buildTimeline([rec("a", 0, 3600), rec("b", 1, 1200)]);

  it("maps a global position into the right file", () => {
    expect(toLocal(timeline, 100)).toEqual({ recordingId: "a", localSec: 100 });
    expect(toLocal(timeline, 4000)).toEqual({ recordingId: "b", localSec: 400 });
  });

  it("puts a boundary position at the start of the next file", () => {
    expect(toLocal(timeline, 3600)).toEqual({ recordingId: "b", localSec: 0 });
  });

  it("clamps past the end instead of returning nothing", () => {
    expect(toLocal(timeline, 99999)).toEqual({ recordingId: "b", localSec: 1200 });
  });

  it("returns null with no recordings", () => {
    expect(toLocal([], 10)).toBeNull();
  });
});

describe("formatTimestamp", () => {
  it("drops the hour under an hour and keeps it above", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(3600)).toBe("1:00:00");
    expect(formatTimestamp(6440)).toBe("1:47:20");
  });

  it("floors fractional seconds and clamps negatives", () => {
    expect(formatTimestamp(65.9)).toBe("1:05");
    expect(formatTimestamp(-5)).toBe("0:00");
  });
});

describe("parseTimestamp", () => {
  it("round-trips the format we emit", () => {
    expect(parseTimestamp("1:47:20")).toBe(6440);
    expect(parseTimestamp("12:34")).toBe(754);
  });

  it("accepts bare seconds, which is what an agent often passes", () => {
    expect(parseTimestamp("742")).toBe(742);
    expect(parseTimestamp("742.5")).toBe(742.5);
  });

  it("rejects junk rather than silently seeking to 0", () => {
    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp("bientôt")).toBeNull();
    expect(parseTimestamp("1:aa")).toBeNull();
    expect(parseTimestamp("-1:00")).toBeNull();
    expect(parseTimestamp("1:2:3:4")).toBeNull();
  });
});
