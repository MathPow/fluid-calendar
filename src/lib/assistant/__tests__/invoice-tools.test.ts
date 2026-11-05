import { saveIssuedInvoice } from "@/lib/facturation/service";
import { getAttachment } from "@/lib/mail/imap";
import { prisma } from "@/lib/prisma";

import { type LinkRegistry, runTool } from "../tools";

jest.mock("@/lib/ask/retrieve", () => ({ retrieveSources: jest.fn() }));
jest.mock("@/lib/fiscalite/extract", () => ({ pdfText: jest.fn().mockResolvedValue("") }));
jest.mock("@/lib/machines/health", () => ({ machineHealth: jest.fn() }));
jest.mock("@/lib/machines/netdata", () => ({ machineStats: jest.fn() }));
jest.mock("@/lib/notes/webdav", () => ({ isNotesConfigured: jest.fn(), readNote: jest.fn() }));
jest.mock("@/lib/mail/account", () => ({
  loadAccounts: jest.fn().mockResolvedValue([{ id: "a1", imap: {} }]),
}));
jest.mock("@/lib/mail/imap", () => ({
  getAttachment: jest.fn(),
  getMessage: jest.fn(),
  listMailboxes: jest.fn(),
  listMessages: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    organisation: { findMany: jest.fn() },
    invoice: { findFirst: jest.fn(), findUnique: jest.fn() },
  },
}));
jest.mock("@/lib/facturation/service", () => ({
  invoicingOrgWhere: {},
  issuedSelect: {},
  nextNumberFor: jest.fn(),
  saveIssuedInvoice: jest.fn(),
  settingsFor: jest.fn().mockResolvedValue({ dueDays: 15, lang: "fr", notes: "Merci" }),
  toIssuedView: (row: unknown) => row,
}));

const save = saveIssuedInvoice as jest.Mock;
const orgs = prisma.organisation.findMany as jest.Mock;
const findFirst = prisma.invoice.findFirst as jest.Mock;
const findUnique = prisma.invoice.findUnique as jest.Mock;

const company = (id: string, name: string, status = "petit") => ({
  id,
  name,
  taxProfile: { salesTaxStatus: status },
});

const draft = {
  id: "inv1",
  direction: "revenu",
  organisationId: "o1",
  party: "Symbiose",
  number: "F-001",
  status: "draft",
  generated: true,
  date: "2026-11-01",
  dueDate: "2026-11-16",
  description: "Consultation",
  lines: [{ description: "Consultation", quantity: 1, unitCents: 100000 }],
  applyTaxes: false,
  lang: "fr",
  subtotalCents: 100000,
  gstCents: 0,
  qstCents: 0,
  totalCents: 100000,
};

const run = (name: string, input: unknown, registry: LinkRegistry = new Map()) =>
  runTool("u1", name, input, registry);

const line = { description: "Consultation", quantity: 1, unitCents: 100000 };

beforeEach(() => {
  jest.clearAllMocks();
  orgs.mockResolvedValue([company("o1", "StayChum"), company("o2", "DehorsQC", "inscrit")]);
  findFirst.mockResolvedValue(null);
  save.mockImplementation(async (input, id) => ({ ...draft, ...input, id: id ?? "new" }));
});

describe("create_invoice", () => {
  it("makes a draft with the company's defaults and links to it", async () => {
    const registry: LinkRegistry = new Map();
    const out = JSON.parse(
      (await run(
        "create_invoice",
        { company: "staychum", client: "Symbiose", lines: [line], date: "2026-11-03" },
        registry
      )) as string
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        organisationId: "o1",
        status: "draft",
        applyTaxes: false,
        dueDate: "2026-11-18",
        lang: "fr",
        notes: "Merci",
      })
    );
    expect(out.url).toBe("/facturation?invoice=new");
    expect(registry.get(out.url)?.type).toBe("invoice");
    expect(out.warning).toBeUndefined();
  });

  it("charges taxes by default only for a registered company", async () => {
    await run("create_invoice", { company: "DehorsQC", client: "X", lines: [line] });
    expect(save.mock.calls[0][0].applyTaxes).toBe(true);
  });

  it("warns when a company that isn't registered charges taxes", async () => {
    const out = JSON.parse(
      (await run("create_invoice", {
        company: "StayChum",
        client: "X",
        lines: [line],
        apply_taxes: true,
      })) as string
    );
    expect(out.warning).toMatch(/pas inscrite/);
  });

  it("asks which company when there are several, and refuses an unknown one", async () => {
    await expect(run("create_invoice", { client: "X", lines: [line] })).rejects.toThrow(/StayChum, DehorsQC/);
    await expect(run("create_invoice", { company: "Acme", client: "X", lines: [line] })).rejects.toThrow(/inconnue/);
    expect(save).not.toHaveBeenCalled();
  });

  it("refuses a number already in use", async () => {
    findFirst.mockResolvedValue({ id: "other" });
    await expect(
      run("create_invoice", { company: "StayChum", client: "X", lines: [line], number: "F-001" })
    ).rejects.toThrow(/déjà utilisé/);
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps the Cc for when it's sent, and refuses a bad address", async () => {
    await run("create_invoice", { company: "StayChum", client: "X", lines: [line], cc: "a@x.com; b@y.com" });
    expect(save.mock.calls[0][0].cc).toBe("a@x.com, b@y.com");
    await expect(
      run("create_invoice", { company: "StayChum", client: "X", lines: [line], cc: "a@x.com, nope" })
    ).rejects.toThrow();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("requires at least one line", async () => {
    await expect(run("create_invoice", { company: "StayChum", client: "X", lines: [] })).rejects.toThrow();
  });

  it("saves invoices created in parallel one at a time", async () => {
    let active = 0;
    let peak = 0;
    save.mockImplementation(async (input) => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { ...draft, ...input };
    });
    await Promise.all(
      [1, 2, 3].map(() => run("create_invoice", { company: "StayChum", client: "X", lines: [line] }))
    );
    expect(save).toHaveBeenCalledTimes(3);
    expect(peak).toBe(1);
  });
});

describe("update_invoice", () => {
  it("changes only what's passed, keeps the number, and doesn't turn the first line into a title", async () => {
    findUnique.mockResolvedValue(draft);
    await run("update_invoice", { id: "inv1", due_date: "2026-12-01" });
    const [input, id] = save.mock.calls[0];
    expect(id).toBe("inv1");
    expect(input).toMatchObject({
      party: "Symbiose",
      number: "F-001",
      dueDate: "2026-12-01",
      lines: draft.lines,
      title: null,
    });
    expect(input.status).toBeUndefined();
  });

  it("keeps the Cc unless a new one is passed", async () => {
    findUnique.mockResolvedValue({ ...draft, cc: "compta@client.com" });
    await run("update_invoice", { id: "inv1", notes: "x" });
    expect(save.mock.calls[0][0].cc).toBe("compta@client.com");
    await run("update_invoice", { id: "inv1", cc: "autre@client.com" });
    expect(save.mock.calls[1][0].cc).toBe("autre@client.com");
  });

  it.each([
    ["sent", { ...draft, status: "sent" }],
    ["imported", { ...draft, generated: false }],
  ])("refuses a %s invoice", async (_label, row) => {
    findUnique.mockResolvedValue(row);
    await expect(run("update_invoice", { id: "inv1", notes: "x" })).rejects.toThrow(/brouillon/);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("read_email_attachment", () => {
  const args = { account_id: "a1", mailbox: "INBOX", uid: 1, index: 0 };

  it("hands a PDF without text to the model as a document", async () => {
    (getAttachment as jest.Mock).mockResolvedValue({
      filename: "facture.pdf",
      contentType: "application/pdf",
      content: Buffer.from("%PDF"),
    });
    const out = await run("read_email_attachment", args);
    expect(out).toEqual([
      expect.objectContaining({ type: "text" }),
      expect.objectContaining({ type: "document" }),
    ]);
  });

  it("refuses a format it can't read", async () => {
    (getAttachment as jest.Mock).mockResolvedValue({
      filename: "a.zip",
      contentType: "application/zip",
      content: Buffer.from("x"),
    });
    await expect(run("read_email_attachment", args)).rejects.toThrow(/non lisible/);
  });
});
