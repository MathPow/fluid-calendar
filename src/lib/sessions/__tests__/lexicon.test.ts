import {
  buildHotwords,
  buildPrompt,
  lexiconToTranscribeOptions,
  parseLexicon,
} from "../lexicon";

describe("parseLexicon", () => {
  it("reads one term per line and strips list bullets", () => {
    expect(parseLexicon("Mathys\n- StayChum\n* Uguiso")).toEqual([
      { term: "Mathys", note: undefined },
      { term: "StayChum", note: undefined },
      { term: "Uguiso", note: undefined },
    ]);
  });

  it("splits a term from its context note on '='", () => {
    expect(parseLexicon("StayChum = notre app de colocation")).toEqual([
      { term: "StayChum", note: "notre app de colocation" },
    ]);
  });

  it("keeps '=' that appear inside the note", () => {
    expect(parseLexicon("Formule = marge = prix - coût")).toEqual([
      { term: "Formule", note: "marge = prix - coût" },
    ]);
  });

  it("skips blanks and # comments", () => {
    expect(parseLexicon("# Entreprises\n\nUguiso\n\n# Gens\nMathys")).toEqual([
      { term: "Uguiso", note: undefined },
      { term: "Mathys", note: undefined },
    ]);
  });

  it("drops case-insensitive duplicates, keeping the first spelling", () => {
    expect(parseLexicon("StayChum\nstaychum\nSTAYCHUM")).toEqual([
      { term: "StayChum", note: undefined },
    ]);
  });

  it("caps the list so biasing on everything doesn't bias on nothing", () => {
    const many = Array.from({ length: 200 }, (_, i) => `Terme${i}`).join("\n");
    expect(parseLexicon(many)).toHaveLength(80);
  });

  it("treats null/undefined/empty as no lexicon", () => {
    expect(parseLexicon(null)).toEqual([]);
    expect(parseLexicon(undefined)).toEqual([]);
    expect(parseLexicon("   \n\n")).toEqual([]);
  });
});

describe("buildHotwords", () => {
  it("joins terms and omits the notes", () => {
    const entries = parseLexicon("Mathys\nStayChum = notre app");
    expect(buildHotwords(entries)).toBe("Mathys, StayChum");
  });

  it("is undefined when there is nothing to bias toward", () => {
    expect(buildHotwords([])).toBeUndefined();
  });
});

describe("buildPrompt", () => {
  it("names the terms in a French sentence", () => {
    const prompt = buildPrompt(parseLexicon("Mathys\nUguiso"), {
      title: "pricing",
      language: "fr",
    });
    expect(prompt).toContain("pricing");
    expect(prompt).toContain("Mathys, Uguiso");
  });

  it("switches language with the session language", () => {
    const prompt = buildPrompt(parseLexicon("Mathys"), { language: "en" });
    expect(prompt).toContain("business conversation");
  });

  it("stays within whisper's prompt budget and never cuts a name in half", () => {
    const many = Array.from({ length: 120 }, (_, i) => `Entreprise${i}`).join("\n");
    const prompt = buildPrompt(parseLexicon(many), { language: "fr" })!;
    expect(prompt.length).toBeLessThanOrEqual(701);
    // Truncation happens at a comma boundary, so the tail is a whole term.
    expect(prompt.endsWith(".")).toBe(true);
    expect(prompt).not.toMatch(/Entreprise\d*[^\d.,\s]/);
  });

  it("is undefined with neither terms nor a title", () => {
    expect(buildPrompt([], {})).toBeUndefined();
  });
});

describe("lexiconToTranscribeOptions", () => {
  it("produces both whisper levers from one blob", () => {
    const opts = lexiconToTranscribeOptions("Mathys\nStayChum = notre app", {
      title: "Appel",
      language: "fr",
    });
    expect(opts.hotwords).toBe("Mathys, StayChum");
    expect(opts.prompt).toContain("Mathys, StayChum");
  });

  it("yields no hotwords when the lexicon is empty", () => {
    expect(lexiconToTranscribeOptions(null, {}).hotwords).toBeUndefined();
  });
});
