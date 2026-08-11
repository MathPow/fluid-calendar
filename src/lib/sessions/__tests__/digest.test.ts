import { chunkSegments, parseChunkResponse, renderToc, type SessionSegment } from "../digest";

const seg = (startSec: number, endSec: number, text: string): SessionSegment => ({
  recordingId: "r1",
  startSec,
  endSec,
  text,
});

describe("chunkSegments", () => {
  it("groups segments into windows of the requested width", () => {
    const chunks = chunkSegments(
      [seg(0, 5, "a"), seg(100, 105, "b"), seg(700, 705, "c")],
      600
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toBe("a b");
    expect(chunks[1].text).toBe("c");
  });

  it("never splits a segment — a chunk ends where its last segment ends", () => {
    const chunks = chunkSegments([seg(0, 5, "a"), seg(595, 640, "b")], 600);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].endSec).toBe(640);
  });

  it("starts a new window from the first segment past the boundary, not from a fixed grid", () => {
    // Nothing between 10s and 900s: the second chunk starts at 900, not at 600.
    const chunks = chunkSegments([seg(0, 10, "a"), seg(900, 910, "b")], 600);
    expect(chunks.map((c) => c.startSec)).toEqual([0, 900]);
  });

  it("orders by time even when segments arrive shuffled", () => {
    const chunks = chunkSegments([seg(700, 705, "c"), seg(0, 5, "a")], 600);
    expect(chunks[0].text).toBe("a");
    expect(chunks[1].text).toBe("c");
  });

  it("drops empty text and handles no segments at all", () => {
    expect(chunkSegments([seg(0, 5, "   ")], 600)).toEqual([]);
    expect(chunkSegments([], 600)).toEqual([]);
  });
});

describe("parseChunkResponse", () => {
  it("pulls the summary and tags out of the expected format", () => {
    const parsed = parseChunkResponse(
      "RESUME: On revoit le pricing en trois paliers.\nTAGS: pricing, site"
    );
    expect(parsed.summary).toBe("On revoit le pricing en trois paliers.");
    expect(parsed.tags).toEqual(["pricing", "site"]);
  });

  it("collapses a multi-line summary onto one line", () => {
    const parsed = parseChunkResponse("RESUME: Ligne un\nligne deux\nTAGS: a");
    expect(parsed.summary).toBe("Ligne un ligne deux");
  });

  it("falls back to the whole response when the model ignores the format", () => {
    const parsed = parseChunkResponse("Ils parlent de pricing.");
    expect(parsed.summary).toBe("Ils parlent de pricing.");
    expect(parsed.tags).toEqual([]);
  });

  it("normalizes tags and caps them at four", () => {
    const parsed = parseChunkResponse("RESUME: x\nTAGS: #Pricing, SITE , a, b, c, d");
    expect(parsed.tags).toEqual(["pricing", "site", "a", "b"]);
  });

  it("splits space-separated tags, which qwen2.5 emits about half the time", () => {
    expect(parseChunkResponse("RESUME: x\nTAGS: Pricing Paliers").tags).toEqual([
      "pricing",
      "paliers",
    ]);
  });

  it("survives a missing TAGS line", () => {
    expect(parseChunkResponse("RESUME: rien de substantiel").tags).toEqual([]);
  });
});

describe("renderToc", () => {
  it("renders one line per chunk with its window and tags", () => {
    const toc = renderToc([
      {
        startSec: 0,
        endSec: 600,
        text: "",
        summary: "Ouverture.",
        tags: ["admin"],
      },
      {
        startSec: 3600,
        endSec: 4200,
        text: "",
        summary: "Pricing.",
        tags: [],
      },
    ]);
    expect(toc).toContain("**[0:00–10:00]** Ouverture.");
    expect(toc).toContain("#admin");
    // Past an hour the timestamps carry the hour, so a 4h call stays unambiguous.
    expect(toc).toContain("**[1:00:00–1:10:00]** Pricing.");
  });
});
