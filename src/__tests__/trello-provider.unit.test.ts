import { TaskStatus } from "@/types/task";

import {
  TrelloTaskProvider,
  classifyListName,
} from "@/lib/task-sync/providers/trello-provider";

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

type Call = { method: string; url: URL; body?: Record<string, unknown> };
const calls: Call[] = [];

function mockFetch() {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ method, url, body });

    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    // Every call must carry the credentials as query params.
    if (url.searchParams.get("key") !== "KEY" || url.searchParams.get("token") !== "TOKEN") {
      return json({ message: "invalid key" }, 401);
    }

    const p = url.pathname;
    if (p === "/1/members/me") return json({ id: "me", username: "mathys", fullName: "Mathys" });
    if (p === "/1/members/me/boards")
      return json([
        { id: "b1", name: "Dehors", desc: "", url: "https://trello.com/b/b1", closed: false },
        { id: "b2", name: "Old", desc: "", url: "https://trello.com/b/b2", closed: true },
      ]);
    if (p === "/1/boards/b1/lists") return json(LISTS);
    if (p === "/1/boards/b1/cards") return json(CARDS);
    if (p === "/1/cards" && method === "POST")
      return json({ ...CARDS[0], id: "new", name: body?.name, idList: body?.idList, dueComplete: !!body?.dueComplete });
    if (p.startsWith("/1/cards/c1") && method === "PUT")
      return json({ ...CARDS[0], ...(body ?? {}), name: (body?.name as string) ?? CARDS[0].name });
    return json({ message: "not found" }, 404);
  }) as unknown as typeof fetch;
}

describe("TrelloTaskProvider", () => {
  let provider: TrelloTaskProvider;

  beforeEach(() => {
    calls.length = 0;
    mockFetch();
    provider = new TrelloTaskProvider({ key: "KEY", token: "TOKEN" });
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
    expect(await provider.whoAmI()).toEqual({ id: "me", username: "mathys", fullName: "Mathys" });
    expect(await new TrelloTaskProvider({ key: "bad", token: "x" }).validateConnection()).toBe(false);
  });

  it("lists open boards as task lists", async () => {
    const lists = await provider.getTaskLists();
    expect(lists).toEqual([{ id: "b1", name: "Dehors", description: "https://trello.com/b/b1" }]);
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
    expect((await provider.getTasks("b1")).map((t) => t.id)).toEqual(["c1", "c2", "c3"]);
    expect(
      (await provider.getTasks("b1", { includeCompleted: false })).map((t) => t.id)
    ).toEqual(["c1", "c2"]);
    const recent = await provider.getTasks("b1", {
      includeCompleted: true,
      since: new Date("2026-09-28T00:00:00.000Z"),
    });
    expect(recent.map((t) => t.id)).toEqual(["c2"]);
  });

  it("creates a card in the column matching the task status", async () => {
    await provider.createTask("b1", { title: "Nouvelle tâche", status: "IN_PROGRESS" });
    const post = calls.find((c) => c.method === "POST");
    expect(post?.url.pathname).toBe("/1/cards");
    expect(post?.body).toMatchObject({ idList: "l-doing", name: "Nouvelle tâche", dueComplete: false });
  });

  it("moves a card to Done and flags dueComplete when the task is completed", async () => {
    await provider.updateTask("b1", "c1", { status: "COMPLETED", title: "Brancher Stripe ✔" });
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url.pathname).toBe("/1/cards/c1");
    expect(put?.body).toMatchObject({ idList: "l-done", dueComplete: true, name: "Brancher Stripe ✔" });
  });

  it("archives instead of deleting", async () => {
    await provider.deleteTask("b1", "c1");
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.body).toEqual({ closed: true });
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });
});
