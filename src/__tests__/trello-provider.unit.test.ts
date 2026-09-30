import {
  TrelloTaskProvider,
  classifyListName,
} from "@/lib/task-sync/providers/trello-provider";

import { TaskStatus } from "@/types/task";

/** Fake Trello board: three columns, three cards. */
const LISTS = [
  { id: "l-todo", name: "À faire", pos: 1, closed: false },
  { id: "l-doing", name: "En cours", pos: 2, closed: false },
  { id: "l-done", name: "Done", pos: 3, closed: false },
];

const CARDS = [
  {
    id: "c1",
    name: "Brancher Stripe",
    desc: "Checkout + webhooks",
    due: "2026-10-03T16:00:00.000Z",
    dueComplete: false,
    closed: false,
    idList: "l-todo",
    idBoard: "b1",
    url: "https://trello.com/c/c1/1-brancher-stripe",
    shortUrl: "https://trello.com/c/c1",
    dateLastActivity: "2026-09-27T10:00:00.000Z",
    labels: [{ name: "backend" }],
  },
  {
    id: "c2",
    name: "Design billetterie",
    desc: "",
    due: null,
    dueComplete: false,
    closed: false,
    idList: "l-doing",
    idBoard: "b1",
    url: "https://trello.com/c/c2/2-design",
    shortUrl: "https://trello.com/c/c2",
    dateLastActivity: "2026-09-28T09:00:00.000Z",
    labels: [],
  },
  {
    id: "c3",
    name: "Logo",
    desc: "",
    due: null,
    dueComplete: false,
    closed: false,
    idList: "l-done",
    idBoard: "b1",
    url: "https://trello.com/c/c3/3-logo",
    shortUrl: "https://trello.com/c/c3",
    dateLastActivity: "2026-09-20T09:00:00.000Z",
    labels: [],
  },
];

const SIX_LISTS = [
  { id: "s-backlog", name: "Backlog", pos: 1, closed: false },
  { id: "s-ready", name: "Prêt (à prioriser)", pos: 2, closed: false },
  { id: "s-doing", name: "En cours", pos: 3, closed: false },
  { id: "s-blocked", name: "Bloquant", pos: 4, closed: false },
  { id: "s-review", name: "À valider", pos: 5, closed: false },
  { id: "s-done", name: "Fini", pos: 6, closed: false },
];

const sixCard = (id: string, idList: string, name: string) => ({
  ...CARDS[1],
  id,
  idList,
  idBoard: "b6",
  name,
  desc: "",
  due: null,
});

const SIX_CARDS = [
  sixCard("s1", "s-backlog", "Idée de concours"),
  sixCard("s2", "s-ready", "Page partenaires"),
  sixCard("s3", "s-blocked", "Paiement Interac"),
  sixCard("s4", "s-review", "Infolettre d'octobre"),
];

type Call = { method: string; url: URL; body?: Record<string, unknown> };
const calls: Call[] = [];

function mockFetch() {
  global.fetch = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined;
      calls.push({ method, url, body });

      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), {
          status,
          headers: { "Content-Type": "application/json" },
        });

      // Every call must carry the credentials as query params.
      if (
        url.searchParams.get("key") !== "KEY" ||
        url.searchParams.get("token") !== "TOKEN"
      ) {
        return json({ message: "invalid key" }, 401);
      }

      const p = url.pathname;
      if (p === "/1/members/me")
        return json({ id: "me", username: "mathys", fullName: "Mathys" });
      if (p === "/1/members/me/boards")
        return json([
          {
            id: "b1",
            name: "Dehors",
            desc: "",
            url: "https://trello.com/b/b1",
            closed: false,
          },
          {
            id: "b2",
            name: "Old",
            desc: "",
            url: "https://trello.com/b/b2",
            closed: true,
          },
        ]);
      if (p === "/1/boards/b1/lists") return json(LISTS);
      if (p === "/1/boards/b1/cards") return json(CARDS);
      // A board with several columns of the same kind, like a real one.
      if (p === "/1/boards/b6/lists") return json(SIX_LISTS);
      const one = p.match(/^\/1\/cards\/([^/]+)$/);
      if (one && method === "GET") {
        const card = [...CARDS, ...SIX_CARDS].find((c) => c.id === one[1]);
        return card ? json(card) : json({ message: "not found" }, 404);
      }
      if (one && method === "PUT" && one[1].startsWith("s")) {
        const card = SIX_CARDS.find((c) => c.id === one[1]);
        return json({ ...card, ...(body ?? {}) });
      }
      if (p === "/1/cards" && method === "POST")
        return json({
          ...CARDS[0],
          id: "new",
          name: body?.name,
          idList: body?.idList,
          dueComplete: !!body?.dueComplete,
        });
      if (p.startsWith("/1/cards/c1") && method === "PUT")
        return json({
          ...CARDS[0],
          ...(body ?? {}),
          name: (body?.name as string) ?? CARDS[0].name,
        });
      return json({ message: "not found" }, 404);
    }
  ) as unknown as typeof fetch;
}

describe("TrelloTaskProvider", () => {
  let provider: TrelloTaskProvider;

  beforeEach(() => {
    calls.length = 0;
    mockFetch();
    // Every card: the « only mine » filter has its own test below.
    provider = new TrelloTaskProvider({ key: "KEY", token: "TOKEN", onlyMine: false });
  });

  it("keeps only the cards assigned to the connected member by default", async () => {
    const mine = new TrelloTaskProvider({ key: "KEY", token: "TOKEN" });
    const all = await provider.getTasks("b1", { includeCompleted: true });
    expect(all.length).toBeGreaterThan(0);
    // The fixture cards have no members: none is « mine ».
    expect(await mine.getTasks("b1", { includeCompleted: true })).toEqual([]);
    // Asked who « me » is once, since no memberId was stored.
    expect(calls.some((c) => c.url.pathname === "/1/members/me")).toBe(true);
  });

  it("classifies list names in English and French", () => {
    expect(classifyListName("To do")).toBe("TODO");
    expect(classifyListName("Doing")).toBe("IN_PROGRESS");
    expect(classifyListName("En cours")).toBe("IN_PROGRESS");
    expect(classifyListName("Done")).toBe("COMPLETED");
    expect(classifyListName("Terminé ✅")).toBe("COMPLETED");
    expect(classifyListName("Livré")).toBe("COMPLETED");
  });

  it("validates the connection and reports who the token belongs to", async () => {
    expect(await provider.validateConnection()).toBe(true);
    expect(await provider.whoAmI()).toEqual({
      id: "me",
      username: "mathys",
      fullName: "Mathys",
    });
    expect(
      await new TrelloTaskProvider({
        key: "bad",
        token: "x",
      }).validateConnection()
    ).toBe(false);
  });

  it("lists open boards as task lists", async () => {
    const lists = await provider.getTaskLists();
    expect(lists).toEqual([
      { id: "b1", name: "Dehors", description: "https://trello.com/b/b1" },
    ]);
  });

  it("maps cards to tasks with the status taken from their column", async () => {
    const tasks = await provider.getTasks("b1", { includeCompleted: true });
    expect(tasks.map((t) => [t.id, t.status])).toEqual([
      ["c1", "TODO"],
      ["c2", "IN_PROGRESS"],
      ["c3", "COMPLETED"],
    ]);
    expect(tasks[0].dueDate).toEqual(new Date("2026-10-03T16:00:00.000Z"));
    expect(tasks[0].tags).toEqual(["backend"]);
    expect(tasks[0].url).toBe("https://trello.com/c/c1");

    const internal = provider.mapToInternalTask(tasks[1], "proj");
    expect(internal.status).toBe(TaskStatus.IN_PROGRESS);
    expect(internal.title).toBe("Design billetterie");
  });

  it("returns completed cards by default, hides them on request, and honours `since`", async () => {
    expect((await provider.getTasks("b1")).map((t) => t.id)).toEqual([
      "c1",
      "c2",
      "c3",
    ]);
    expect(
      (await provider.getTasks("b1", { includeCompleted: false })).map(
        (t) => t.id
      )
    ).toEqual(["c1", "c2"]);
    const recent = await provider.getTasks("b1", {
      includeCompleted: true,
      since: new Date("2026-09-28T00:00:00.000Z"),
    });
    expect(recent.map((t) => t.id)).toEqual(["c2"]);
  });

  it("creates a card in the column matching the task status", async () => {
    await provider.createTask("b1", {
      title: "Nouvelle tâche",
      status: "IN_PROGRESS",
    });
    const post = calls.find((c) => c.method === "POST");
    expect(post?.url.pathname).toBe("/1/cards");
    expect(post?.body).toMatchObject({
      idList: "l-doing",
      name: "Nouvelle tâche",
      dueComplete: false,
    });
  });

  it("moves a card to Done and flags dueComplete when the task is completed", async () => {
    await provider.updateTask("b1", "c1", {
      status: "COMPLETED",
      title: "Brancher Stripe ✔",
    });
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url.pathname).toBe("/1/cards/c1");
    expect(put?.body).toMatchObject({
      idList: "l-done",
      dueComplete: true,
      name: "Brancher Stripe ✔",
    });
  });

  it("reads the columns of a real board", () => {
    expect(SIX_LISTS.map((l) => classifyListName(l.name))).toEqual([
      "BACKLOG",
      "TODO",
      "IN_PROGRESS",
      "IN_PROGRESS",
      "IN_PROGRESS",
      "COMPLETED",
    ]);
  });

  it("writes nothing when the card already says the same thing", async () => {
    await provider.updateTask("b1", "c1", {
      title: "Brancher Stripe",
      description: "Checkout + webhooks",
      status: "TODO",
      dueDate: new Date("2026-10-03T16:00:00.000Z"),
    });
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("leaves a card in its column when the status is of the same kind", async () => {
    // « Bloquant » and « À valider » both read as in progress: a task that is
    // in progress here must not drag them back to « En cours ».
    await provider.updateTask("b6", "s3", { status: "IN_PROGRESS" });
    await provider.updateTask("b6", "s4", { status: "IN_PROGRESS" });
    await provider.updateTask("b6", "s2", { status: "TODO" });
    await provider.updateTask("b6", "s1", { status: "BACKLOG" });
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("moves a card only when its status really changes", async () => {
    await provider.updateTask("b6", "s2", { status: "IN_PROGRESS" });
    await provider.updateTask("b6", "s3", { status: "COMPLETED" });
    await provider.updateTask("b6", "s4", { status: "TODO" });
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts.map((c) => [c.url.pathname, c.body])).toEqual([
      ["/1/cards/s2", { idList: "s-doing" }],
      ["/1/cards/s3", { idList: "s-done", dueComplete: true }],
      ["/1/cards/s4", { idList: "s-ready" }],
    ]);
  });

  it("sends only the fields that changed", async () => {
    await provider.updateTask("b1", "c1", {
      title: "Brancher Stripe (prod)",
      description: "Checkout + webhooks",
      status: "TODO",
    });
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts.map((c) => c.body)).toEqual([
      { name: "Brancher Stripe (prod)" },
    ]);
  });

  it("archives instead of deleting", async () => {
    await provider.deleteTask("b1", "c1");
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.body).toEqual({ closed: true });
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });
});
