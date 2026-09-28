import { Task, TaskStatus } from "@/types/task";

import {
  ExternalTask,
  ExternalTaskList,
  SyncOptions,
  TaskChange,
  TaskProviderInterface,
  TaskToCreate,
  TaskUpdates,
} from "./task-provider.interface";
import { TrelloFieldMapper } from "./trello-field-mapper";

const TRELLO_API = "https://api.trello.com/1";

/**
 * Stored in TaskProvider.settings. The key + token pair is what the user
 * generates on trello.com (Power-Up admin → API key, then the authorize URL
 * for a token). username / fullName are only kept for display.
 */
export interface TrelloSettings {
  key: string;
  token: string;
  memberId?: string;
  username?: string;
  fullName?: string;
}

interface TrelloBoard {
  id: string;
  name: string;
  desc: string;
  url: string;
  closed: boolean;
}

interface TrelloList {
  id: string;
  name: string;
  pos: number;
  closed: boolean;
}

interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  due: string | null;
  dueComplete: boolean;
  closed: boolean;
  idList: string;
  idBoard: string;
  url: string;
  shortUrl: string;
  dateLastActivity: string;
  labels: { name: string }[];
}

/** Status values exchanged with the field mapper (not Trello's own vocabulary). */
export type TrelloStatus = "TODO" | "IN_PROGRESS" | "COMPLETED";

const CARD_FIELDS =
  "id,name,desc,due,dueComplete,closed,idList,idBoard,url,shortUrl,dateLastActivity,labels";

/**
 * Which column a list is, guessed from its name. Trello has no notion of a
 * "done" list, so we read the usual English / French names.
 */
export function classifyListName(name: string): TrelloStatus {
  const n = name.trim().toLowerCase();
  if (/\b(done|termin|complet|fini|closed|ship|livr|archiv)/.test(n)) return "COMPLETED";
  if (/\b(doing|in progress|en cours|wip|progress|review|test|qa)\b/.test(n)) return "IN_PROGRESS";
  return "TODO";
}

/**
 * Trello boards as task lists: one DreamDash project ↔ one Trello board.
 * Every open card on the board becomes a task; its list decides the status.
 */
export class TrelloTaskProvider implements TaskProviderInterface {
  private key: string;
  private token: string;
  private fieldMapper: TrelloFieldMapper;
  private listCache = new Map<string, TrelloList[]>();

  constructor(settings: TrelloSettings) {
    this.key = settings.key;
    this.token = settings.token;
    this.fieldMapper = new TrelloFieldMapper();
  }

  getType(): string {
    return "TRELLO";
  }

  getName(): string {
    return "Trello";
  }

  private async api<T>(
    path: string,
    init: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      query?: Record<string, string | undefined>;
      body?: Record<string, unknown>;
    } = {}
  ): Promise<T> {
    const url = new URL(`${TRELLO_API}${path}`);
    url.searchParams.set("key", this.key);
    url.searchParams.set("token", this.token);
    for (const [k, v] of Object.entries(init.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, v);
    }

    const response = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        "User-Agent": "dreamdash",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Trello API error: ${response.status} ${response.statusText}${text ? ` — ${text.slice(0, 200)}` : ""}`
      );
    }
    return (await response.json()) as T;
  }

  async validateConnection(): Promise<boolean> {
    try {
      const me = await this.api<{ id: string }>("/members/me", {
        query: { fields: "id" },
      });
      return !!me.id;
    } catch {
      return false;
    }
  }

  /** Who the token belongs to — used by the connect route for display. */
  async whoAmI(): Promise<{ id: string; username: string; fullName: string }> {
    return this.api("/members/me", { query: { fields: "id,username,fullName" } });
  }

  async getTaskLists(): Promise<ExternalTaskList[]> {
    const boards = await this.api<TrelloBoard[]>("/members/me/boards", {
      query: { filter: "open", fields: "id,name,desc,url,closed" },
    });
    return boards
      .filter((b) => !b.closed)
      .map((b) => ({
        id: b.id,
        name: b.name,
        description: b.url,
      }));
  }

  private async boardLists(boardId: string): Promise<TrelloList[]> {
    const cached = this.listCache.get(boardId);
    if (cached) return cached;
    const lists = await this.api<TrelloList[]>(`/boards/${boardId}/lists`, {
      query: { filter: "open", fields: "id,name,pos,closed" },
    });
    const sorted = lists.filter((l) => !l.closed).sort((a, b) => a.pos - b.pos);
    this.listCache.set(boardId, sorted);
    return sorted;
  }

  /** The list a card should sit in for a given status, if the board has one. */
  private async listForStatus(
    boardId: string,
    status: TrelloStatus
  ): Promise<TrelloList | undefined> {
    const lists = await this.boardLists(boardId);
    if (lists.length === 0) return undefined;
    const exact = lists.find((l) => classifyListName(l.name) === status);
    if (exact) return exact;
    // No matching column: new work goes in the first list, everything else stays put.
    return status === "TODO" ? lists[0] : undefined;
  }

  private cardStatus(card: TrelloCard, lists: TrelloList[]): TrelloStatus {
    if (card.dueComplete || card.closed) return "COMPLETED";
    const list = lists.find((l) => l.id === card.idList);
    return list ? classifyListName(list.name) : "TODO";
  }

  private cardToExternalTask(card: TrelloCard, boardId: string, lists: TrelloList[]): ExternalTask {
    const status = this.cardStatus(card, lists);
    return {
      id: card.id,
      title: card.name,
      description: card.desc || null,
      status,
      listId: boardId,
      url: card.shortUrl || card.url,
      dueDate: card.due ? new Date(card.due) : null,
      lastModified: new Date(card.dateLastActivity),
      completedDate: status === "COMPLETED" ? new Date(card.dateLastActivity) : null,
      tags: (card.labels ?? []).map((l) => l.name).filter(Boolean),
    };
  }

  async getTasks(boardId: string, options?: SyncOptions): Promise<ExternalTask[]> {
    const [cards, lists] = await Promise.all([
      this.api<TrelloCard[]>(`/boards/${boardId}/cards`, {
        query: { filter: "open", fields: CARD_FIELDS },
      }),
      this.boardLists(boardId),
    ]);

    return cards
      .filter((card) => {
        if (options?.since && new Date(card.dateLastActivity) < options.since) return false;
        // Like the Google provider: completed cards come back by default so a
        // card moved to Done flips the local task to completed on the next sync.
        if (options?.includeCompleted === false && this.cardStatus(card, lists) === "COMPLETED")
          return false;
        return true;
      })
      .map((card) => this.cardToExternalTask(card, boardId, lists));
  }

  async getChanges(boardId: string, since?: Date): Promise<TaskChange[]> {
    const cards = await this.api<TrelloCard[]>(`/boards/${boardId}/cards`, {
      query: { filter: "open", fields: "id,dateLastActivity" },
    });
    return cards
      .filter((card) => !since || new Date(card.dateLastActivity) > since)
      .map((card) => ({
        id: card.id,
        taskId: card.id,
        listId: boardId,
        type: "UPDATE" as const,
        timestamp: new Date(card.dateLastActivity),
      }));
  }

  async createTask(boardId: string, task: TaskToCreate): Promise<ExternalTask> {
    const status = (task.status as TrelloStatus | null | undefined) ?? "TODO";
    const target =
      (await this.listForStatus(boardId, status)) ?? (await this.boardLists(boardId))[0];
    if (!target) {
      throw new Error("This Trello board has no open list to put cards in.");
    }

    const card = await this.api<TrelloCard>("/cards", {
      method: "POST",
      body: {
        idList: target.id,
        name: task.title,
        desc: task.description ?? "",
        due: task.dueDate ? new Date(task.dueDate).toISOString() : null,
        dueComplete: status === "COMPLETED",
      },
    });
    return this.cardToExternalTask(card, boardId, await this.boardLists(boardId));
  }

  async updateTask(boardId: string, cardId: string, updates: TaskUpdates): Promise<ExternalTask> {
    const body: Record<string, unknown> = {};
    if (updates.title !== undefined) body.name = updates.title;
    if (updates.description !== undefined) body.desc = updates.description ?? "";
    if (updates.dueDate !== undefined) {
      body.due = updates.dueDate ? new Date(updates.dueDate).toISOString() : null;
    }
    if (updates.status !== undefined && updates.status !== null) {
      const status = updates.status as TrelloStatus;
      body.dueComplete = status === "COMPLETED";
      const list = await this.listForStatus(boardId, status);
      if (list) body.idList = list.id;
    }

    const card =
      Object.keys(body).length > 0
        ? await this.api<TrelloCard>(`/cards/${cardId}`, { method: "PUT", body })
        : await this.api<TrelloCard>(`/cards/${cardId}`, { query: { fields: CARD_FIELDS } });
    return this.cardToExternalTask(card, boardId, await this.boardLists(boardId));
  }

  /** Archive rather than destroy — nothing on a shared board should vanish. */
  async deleteTask(_boardId: string, cardId: string): Promise<void> {
    await this.api(`/cards/${cardId}`, { method: "PUT", body: { closed: true } });
  }

  mapToInternalTask(externalTask: ExternalTask, projectId: string): Partial<Task> {
    return this.fieldMapper.mapToInternalTask(externalTask, projectId);
  }

  mapToExternalTask(task: Partial<Task>): TaskToCreate {
    return this.fieldMapper.mapToExternalTask(task);
  }
}

export function createTrelloProvider(settings: unknown): TrelloTaskProvider {
  const s = settings as TrelloSettings;
  if (!s?.key || !s?.token) {
    throw new Error("Trello provider requires an API key and a token in settings");
  }
  return new TrelloTaskProvider(s);
}

// Re-exported so callers can map TaskStatus without importing the mapper.
export { TaskStatus };
