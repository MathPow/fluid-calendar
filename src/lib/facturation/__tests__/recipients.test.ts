import { parseRecipients } from "../recipients";
import { RecurringInput, SendInput } from "../schemas";

describe("parseRecipients", () => {
  it("splits on commas, semicolons and newlines", () => {
    expect(parseRecipients("a@x.com, b@y.com; c@z.ca\nd@w.org").list).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.ca",
      "d@w.org",
    ]);
  });

  it("keeps display names, even with a comma in quotes", () => {
    expect(parseRecipients('Ana <a@x.com>, "Roy, Ben" <b@y.com>').list).toEqual([
      "Ana <a@x.com>",
      '"Roy, Ben" <b@y.com>',
    ]);
  });

  it("ignores the trailing separator the suggestions leave behind", () => {
    expect(parseRecipients("a@x.com, ")).toEqual({ list: ["a@x.com"], invalid: [] });
  });

  it("drops duplicates, whatever the case or the display name", () => {
    expect(parseRecipients("a@x.com, A@X.com, Ana <a@x.com>").list).toEqual(["a@x.com"]);
  });

  it("drops whoever is already in To", () => {
    expect(parseRecipients("a@x.com, b@y.com", "Ana <A@x.com>").list).toEqual(["b@y.com"]);
  });

  it("reports what isn't an address", () => {
    expect(parseRecipients("a@x.com, nope, b@y, Ben <ben>")).toEqual({
      list: ["a@x.com"],
      invalid: ["nope", "b@y", "Ben <ben>"],
    });
  });

  it("treats empty input as no recipients", () => {
    expect(parseRecipients(null)).toEqual({ list: [], invalid: [] });
    expect(parseRecipients("  , ; ")).toEqual({ list: [], invalid: [] });
  });
});

describe("cc in the API schemas", () => {
  const send = { mailAccountId: "acc", to: "client@x.com" };

  it("normalizes a list of addresses", () => {
    expect(SendInput.parse({ ...send, cc: "a@x.com; b@y.com, a@x.com, " }).cc).toBe("a@x.com, b@y.com");
  });

  it("turns an empty field into null", () => {
    expect(SendInput.parse({ ...send, cc: "  " }).cc).toBeNull();
    expect(SendInput.parse(send).cc).toBeNull();
  });

  it("refuses a bad address", () => {
    expect(SendInput.safeParse({ ...send, cc: "a@x.com, nope" }).success).toBe(false);
  });

  it("takes far more addresses than the old 500 characters allowed", () => {
    const many = Array.from({ length: 60 }, (_, i) => `person${i}@example.com`).join(", ");
    expect(SendInput.parse({ ...send, cc: many }).cc).toBe(many);
  });

  it("applies to recurring contracts too", () => {
    const shape = RecurringInput.shape.cc;
    expect(shape.parse("a@x.com;b@y.com")).toBe("a@x.com, b@y.com");
    expect(shape.safeParse("nope").success).toBe(false);
  });
});
