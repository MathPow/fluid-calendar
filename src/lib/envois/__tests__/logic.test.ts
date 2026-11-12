import {
  classifyReply,
  classifySmtpError,
  findPlaceholder,
  inSendWindow,
  isDelayNotice,
  looksLikeBounce,
  newTextOf,
  parseCampaignCsv,
  parseCsv,
  preflight,
  renderBody,
  startOfSendDay,
  tooManyBounces,
} from "../logic";

const FOOTER =
  "DehorsQC, 1115 rue du Phénix, Lévis (Québec) G6K 1A1\nPour ne plus recevoir de courriels de ma part, réponds simplement « non merci ».";

describe("parseCsv", () => {
  it("keeps commas, quotes and line breaks inside quoted fields", () => {
    expect(parseCsv('a,b\n"x, y","l1\nl2 ""ok"""\n')).toEqual([
      ["a", "b"],
      ["x, y", 'l1\nl2 "ok"'],
    ]);
  });

  it("drops the BOM Excel needs and skips blank lines", () => {
    expect(parseCsv("﻿a,b\r\n\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCampaignCsv", () => {
  const header = "rang,organisation,courriel,objet,corps,à réviser\n";

  it("reads the radar's export", () => {
    const { rows, issues } = parseCampaignCsv(
      `﻿${header}1,Gran Fondo,Info@GranFondo.ca,Ta prochaine édition,"Salut,\n\nallô",\n2,Run,a@b.ca,Objet,Corps,surtout anglophone\n`
    );
    expect(issues).toEqual([]);
    expect(rows).toEqual([
      {
        email: "info@granfondo.ca",
        subject: "Ta prochaine édition",
        body: "Salut,\n\nallô",
        organisation: "Gran Fondo",
        reviewNote: null,
      },
      {
        email: "a@b.ca",
        subject: "Objet",
        body: "Corps",
        organisation: "Run",
        reviewNote: "surtout anglophone",
      },
    ]);
  });

  it("reports bad rows instead of sending them", () => {
    const { rows, issues } = parseCampaignCsv(
      `${header}1,A,pas-une-adresse,O,C,\n2,B,a@b.ca,O,C,\n3,C,A@B.CA,O,C,\n4,D,d@e.ca,,C,\n`
    );
    expect(rows.map((r) => r.email)).toEqual(["a@b.ca"]);
    expect(issues.map((i) => i.code)).toEqual([
      "invalidEmail",
      "duplicate",
      "emptyMessage",
    ]);
  });

  it("refuses a file without the needed columns", () => {
    expect(parseCampaignCsv("nom,ville\nA,Lévis\n").issues).toEqual([
      { code: "missingColumns", columns: "email, subject, body" },
    ]);
  });
});

describe("renderBody", () => {
  it("adds the footer once", () => {
    expect(renderBody("Salut\n", FOOTER)).toBe(`Salut\n\n${FOOTER}`);
    expect(renderBody(`Salut\n\n${FOOTER}`, FOOTER)).toBe(`Salut\n\n${FOOTER}`);
  });
});

describe("findPlaceholder", () => {
  it("finds what was never filled in", () => {
    expect(findPlaceholder("DehorsQC, [adresse postale]")).toBe(
      "[adresse postale]"
    );
    expect(findPlaceholder("Salut {{prenom}},")).toBe("{{prenom}}");
    expect(findPlaceholder("Pour 150 billets à 75$")).toBeNull();
  });
});

describe("preflight", () => {
  const ok = {
    email: "a@b.ca",
    subject: "Objet",
    body: "Corps",
    reviewNote: null,
    selected: true,
    status: "pending",
  };
  const base = {
    hasAccount: true,
    footer: FOOTER,
    testSentAt: new Date(),
    recipients: [ok],
    suppressed: new Set<string>(),
  };
  const codes = (list: { code: string }[]) => list.map((i) => i.code);

  it("passes a complete campaign", () => {
    expect(preflight(base)).toEqual({ errors: [], warnings: [] });
  });

  it("refuses to send without the legal footer", () => {
    expect(codes(preflight({ ...base, footer: "" }).errors)).toEqual([
      "noFooter",
    ]);
    expect(
      codes(
        preflight({ ...base, footer: "DehorsQC, 1115 rue du Phénix" }).errors
      )
    ).toEqual(["footerNoOptOut"]);
    expect(
      codes(preflight({ ...base, footer: "Réponds non merci" }).errors)
    ).toEqual(["footerNoAddress"]);
  });

  it("warns when the address has no postal code", () => {
    const footer =
      "DehorsQC, 1115 rue du Phénix, Lévis\nRéponds « non merci ».";
    expect(codes(preflight({ ...base, footer }).warnings)).toEqual([
      "footerNoPostalCode",
    ]);
  });

  it("refuses unfilled fields", () => {
    const { errors } = preflight({
      ...base,
      recipients: [{ ...ok, body: "Salut [Prénom]" }],
    });
    expect(errors).toEqual([
      { code: "placeholder", value: "[Prénom]", who: "a@b.ca" },
    ]);
  });

  it("counts only what will really leave", () => {
    const result = preflight({
      ...base,
      suppressed: new Set(["gone@b.ca"]),
      recipients: [
        ok,
        { ...ok, email: "flag@b.ca", reviewNote: "à voir" },
        { ...ok, email: "off@b.ca", reviewNote: "à voir", selected: false },
        { ...ok, email: "gone@b.ca" },
      ],
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      { code: "flagged", count: 1 },
      { code: "suppressed", count: 1 },
    ]);
  });

  it("needs someone to send to", () => {
    expect(
      codes(
        preflight({ ...base, recipients: [{ ...ok, selected: false }] }).errors
      )
    ).toEqual(["noRecipients"]);
  });
});

describe("inSendWindow", () => {
  const window = { sendFromHour: 9, sendUntilHour: 17, weekdaysOnly: true };

  it("follows Québec time, not the server's", () => {
    // Thursday 2026-11-05, EST (UTC-5).
    expect(inSendWindow(new Date("2026-11-05T14:00:00Z"), window)).toBe(true); // 9:00
    expect(inSendWindow(new Date("2026-11-05T13:59:00Z"), window)).toBe(false); // 8:59
    expect(inSendWindow(new Date("2026-11-05T22:00:00Z"), window)).toBe(false); // 17:00
  });

  it("skips weekends unless told otherwise", () => {
    const saturday = new Date("2026-11-07T15:00:00Z");
    expect(inSendWindow(saturday, window)).toBe(false);
    expect(inSendWindow(saturday, { ...window, weekdaysOnly: false })).toBe(
      true
    );
  });
});

describe("startOfSendDay", () => {
  it("is midnight in Québec", () => {
    expect(startOfSendDay(new Date("2026-11-06T03:00:00Z")).toISOString()).toBe(
      "2026-11-05T05:00:00.000Z"
    );
  });
});

describe("classifySmtpError", () => {
  it("stops everything when the account is refused", () => {
    expect(classifySmtpError({ code: "EAUTH", responseCode: 535 })).toBe(
      "auth"
    );
  });

  it("recognises the provider blocking the account", () => {
    expect(
      classifySmtpError({
        responseCode: 554,
        response: "554 5.1.8 Email Outgoing Blocked",
      })
    ).toBe("blocked");
    expect(
      classifySmtpError({
        responseCode: 550,
        response: "550 5.4.6 Unusual sending activity detected",
      })
    ).toBe("blocked");
    expect(
      classifySmtpError({
        responseCode: 421,
        response: "421 Too many messages, rate limit",
      })
    ).toBe("blocked");
  });

  it("charges a bad address to that recipient only", () => {
    expect(
      classifySmtpError({
        responseCode: 550,
        response: "550 5.1.1 User unknown",
      })
    ).toBe("badAddress");
    expect(
      classifySmtpError({
        responseCode: 550,
        response: "550 No such user here",
      })
    ).toBe("badAddress");
  });

  it("doesn't exclude an address over a refusal that says nothing about it", () => {
    expect(
      classifySmtpError({
        code: "EENVELOPE",
        responseCode: 553,
        response: "553 Relaying disallowed",
      })
    ).toBe("rejected");
    expect(
      classifySmtpError({
        responseCode: 554,
        response: "554 Transaction failed",
      })
    ).toBe("rejected");
  });

  it("retries what may pass later", () => {
    expect(
      classifySmtpError({ code: "ETIMEDOUT", message: "Connection timeout" })
    ).toBe("transient");
    expect(
      classifySmtpError({ responseCode: 451, response: "451 Try again later" })
    ).toBe("transient");
  });
});

describe("classifyReply", () => {
  const quoted = `\n\nLe jeu. 5 nov. 2026, Mathys a écrit :\n> Pour ne plus recevoir de courriels de ma part, réponds simplement « non merci ».`;
  const reply = (
    text: string,
    subject = "Re: Ta prochaine édition",
    headers = {}
  ) => classifyReply({ text, subject, headers });

  it("doesn't mistake our quoted footer for an opt-out", () => {
    expect(newTextOf(`Oui, appelle-moi!${quoted}`)).toBe("Oui, appelle-moi!");
    expect(reply(`Oui, appelle-moi!${quoted}`)).toBe("reply");
  });

  it("catches an opt-out in the person's own words", () => {
    expect(reply(`Non merci${quoted}`)).toBe("unsubscribe");
    expect(reply("non, merci on est bien avec Race Roster")).toBe(
      "unsubscribe"
    );
    expect(reply("Merci de me retirer de votre liste, désabonnez-moi")).toBe(
      "unsubscribe"
    );
    expect(reply("Ne m'écrivez plus svp")).toBe("unsubscribe");
    expect(reply("STOP")).toBe("unsubscribe");
    expect(reply("Please unsubscribe me")).toBe("unsubscribe");
  });

  it("keeps real conversations", () => {
    expect(reply("On ne s'arrête jamais, stop ou encore?")).toBe("reply");
    expect(reply("Merci pour l'info, on en reparle en janvier")).toBe("reply");
  });

  it("ignores auto-replies", () => {
    expect(
      reply(
        "Je suis absent jusqu'au 10",
        "Réponse automatique : Ta prochaine édition"
      )
    ).toBe("auto");
    expect(reply("Away", "Out of office")).toBe("auto");
    expect(
      reply("Thanks", "Re: x", {
        "auto-submitted": "Auto-Submitted: auto-replied",
      })
    ).toBe("auto");
    expect(
      reply("Non merci", "Re: x", { "auto-submitted": "Auto-Submitted: no" })
    ).toBe("unsubscribe");
  });
});

describe("looksLikeBounce", () => {
  it("spots delivery failures", () => {
    expect(
      looksLikeBounce(
        "MAILER-DAEMON@zoho.com",
        "Undelivered Mail Returned to Sender"
      )
    ).toBe(true);
    expect(looksLikeBounce("postmaster@x.ca", "Message")).toBe(true);
    expect(
      looksLikeBounce("Jean <jean@x.ca>", "Re: Ta prochaine édition")
    ).toBe(false);
  });
});

describe("tooManyBounces", () => {
  it("tolerates a few and stops a stream", () => {
    expect(tooManyBounces(2, 3)).toBe(false);
    expect(tooManyBounces(3, 100)).toBe(false);
    expect(tooManyBounces(3, 20)).toBe(true);
  });
});

describe("isDelayNotice", () => {
  it("treats a delayed report as a warning, not a bounce", () => {
    expect(
      isDelayNotice(
        "Mail Delivery Status Notification (Delay)",
        "Status: 421\nAction: delayed\nDiagnostic-Code: 4.3.2"
      )
    ).toBe(true);
  });
  it("keeps a failed report as a bounce", () => {
    expect(
      isDelayNotice(
        "Mail Delivery Status Notification (Failure)",
        "Status: 5.1.1\nAction: failed"
      )
    ).toBe(false);
  });
});
