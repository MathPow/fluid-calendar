import { Task, TaskStatus } from "@/types/task";

import { GitHubFieldMapper } from "./github-field-mapper";
import {
  ExternalTask,
  ExternalTaskList,
  SyncOptions,
  TaskChange,
  TaskProviderInterface,
  TaskToCreate,
  TaskUpdates,
} from "./task-provider.interface";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

export interface GitHubSettings {
  token: string;
  login: string;
  ownerType: "user" | "organization";
}

interface GitHubIssueContent {
  __typename: "Issue" | "PullRequest";
  id: string;
  number: number;
  title: string;
  body: string | null;
  state: "OPEN" | "CLOSED";
  url: string;
  updatedAt: string;
  closedAt: string | null;
  assignees: { nodes: { login: string }[] };
  labels?: { nodes: { name: string }[] };
  milestone?: { dueOn: string | null } | null;
}

interface GitHubProjectItem {
  id: string;
  updatedAt: string;
  content: GitHubIssueContent | null;
  fieldValues: {
    nodes: Array<{
      __typename?: string;
      date?: string;
      field?: { name: string };
    }>;
  };
}

export class GitHubTaskProvider implements TaskProviderInterface {
  private token: string;
  private login: string;
  private ownerType: "user" | "organization";
  private fieldMapper: GitHubFieldMapper;

  constructor(settings: GitHubSettings) {
    this.token = settings.token;
    this.login = settings.login;
    this.ownerType = settings.ownerType;
    this.fieldMapper = new GitHubFieldMapper();
  }

  getType(): string {
    return "GITHUB";
  }

  getName(): string {
    return "GitHub Projects";
  }

  private async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `bearer ${this.token}`,
        "Content-Type": "application/json",
        "User-Agent": "fluid-calendar",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as { data?: T; errors?: { message: string }[] };

    if (json.errors?.length) {
      throw new Error(`GitHub GraphQL error: ${json.errors[0].message}`);
    }

    if (!json.data) {
      throw new Error("No data returned from GitHub API");
    }

    return json.data;
  }

  async validateConnection(): Promise<boolean> {
    try {
      const data = await this.graphql<{ viewer: { login: string } }>(
        `query { viewer { login } }`
      );
      return !!data.viewer.login;
    } catch {
      return false;
    }
  }

  async getTaskLists(): Promise<ExternalTaskList[]> {
    const userQuery = `
      query GetUserProjects($login: String!) {
        user(login: $login) {
          projectsV2(first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes { id title number url closed }
          }
        }
      }`;

    const orgQuery = `
      query GetOrgProjects($login: String!) {
        organization(login: $login) {
          projectsV2(first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes { id title number url closed }
          }
        }
      }`;

    type ProjectNode = { id: string; title: string; number: number; url: string; closed: boolean };

    if (this.ownerType === "organization") {
      const data = await this.graphql<{ organization: { projectsV2: { nodes: ProjectNode[] } } }>(
        orgQuery,
        { login: this.login }
      );
      return data.organization.projectsV2.nodes
        .filter((p) => !p.closed)
        .map((p) => ({
          id: p.id,
          name: p.title,
          description: `${this.login}/${p.number} — ${p.url}`,
        }));
    } else {
      const data = await this.graphql<{ user: { projectsV2: { nodes: ProjectNode[] } } }>(
        userQuery,
        { login: this.login }
      );
      return data.user.projectsV2.nodes
        .filter((p) => !p.closed)
        .map((p) => ({
          id: p.id,
          name: p.title,
          description: `${this.login}/#${p.number} — ${p.url}`,
        }));
    }
  }

  private async fetchProjectItems(projectId: string): Promise<GitHubProjectItem[]> {
    const query = `
      query GetProjectItems($projectId: ID!, $cursor: String) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: 100, after: $cursor) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                updatedAt
                content {
                  __typename
                  ... on Issue {
                    id
                    number
                    title
                    body
                    state
                    url
                    updatedAt
                    closedAt
                    assignees(first: 10) { nodes { login } }
                    labels(first: 10) { nodes { name } }
                    milestone { dueOn }
                  }
                  ... on PullRequest {
                    id
                    number
                    title
                    body
                    state
                    url
                    updatedAt
                    closedAt
                    assignees(first: 10) { nodes { login } }
                  }
                }
                fieldValues(first: 20) {
                  nodes {
                    __typename
                    ... on ProjectV2ItemFieldDateValue {
                      date
                      field { ... on ProjectV2FieldCommon { name } }
                    }
                  }
                }
              }
            }
          }
        }
      }`;

    type PageInfo = { hasNextPage: boolean; endCursor: string | null };
    type ItemsPage = { pageInfo: PageInfo; nodes: GitHubProjectItem[] };
    type NodeResult = { node: { items: ItemsPage } };

    const all: GitHubProjectItem[] = [];
    let cursor: string | null = null;
    let hasMore = true;

    while (hasMore) {
      const data: NodeResult = await this.graphql<NodeResult>(query, { projectId, cursor });
      const page: ItemsPage = data.node.items;
      all.push(...page.nodes);
      if (page.pageInfo.hasNextPage) {
        cursor = page.pageInfo.endCursor;
      } else {
        hasMore = false;
      }
    }

    return all;
  }

  async getTasks(listId: string, options?: SyncOptions): Promise<ExternalTask[]> {
    const items = await this.fetchProjectItems(listId);

    return items
      .filter((item) => {
        if (!item.content) return false;
        // Optionally filter by assignee (only tasks assigned to viewer)
        if (item.content.assignees.nodes.length > 0) {
          // Include items assigned to anyone — the user can filter in settings
          // In practice they'll only map projects they're part of
        }
        // Filter by modification time if requested
        if (options?.since && new Date(item.updatedAt) < options.since) return false;
        if (!options?.includeCompleted && item.content.state === "CLOSED") return false;
        return true;
      })
      .map((item) => this.projectItemToExternalTask(item, listId));
  }

  private projectItemToExternalTask(item: GitHubProjectItem, listId: string): ExternalTask {
    const content = item.content!;

    // Look for a date field value
    const dateField = item.fieldValues.nodes.find(
      (fv) => fv.__typename === "ProjectV2ItemFieldDateValue" && fv.date
    );

    const dueDate = dateField?.date
      ? new Date(dateField.date)
      : (content as { milestone?: { dueOn: string | null } | null }).milestone?.dueOn
        ? new Date((content as { milestone: { dueOn: string } }).milestone.dueOn)
        : null;

    return {
      id: content.id,
      title: content.title,
      description: content.body || null,
      status: content.state,
      listId,
      url: content.url,
      dueDate,
      lastModified: new Date(content.updatedAt),
      completedDate: content.closedAt ? new Date(content.closedAt) : null,
      tags: (content.labels?.nodes || []).map((l) => l.name),
    };
  }

  async getChanges(listId: string, since?: Date): Promise<TaskChange[]> {
    const items = await this.fetchProjectItems(listId);

    return items
      .filter((item) => {
        if (!item.content) return false;
        if (since && new Date(item.updatedAt) <= since) return false;
        return true;
      })
      .map((item) => ({
        id: item.id,
        taskId: item.content!.id,
        listId,
        type: "UPDATE" as const,
        timestamp: new Date(item.updatedAt),
      }));
  }

  // GitHub issues can't be created via the project API without a repo context.
  // We'll import from GitHub only; creating tasks stays in FluidCalendar.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createTask(_listId: string, _task: TaskToCreate): Promise<ExternalTask> {
    throw new Error("Creating GitHub issues is not supported. Use GitHub directly to create issues.");
  }

  async updateTask(
    listId: string,
    taskId: string,
    updates: TaskUpdates
  ): Promise<ExternalTask> {
    // We support updating title, body, and closing/reopening the issue
    const mutations: Promise<unknown>[] = [];

    if (updates.title !== undefined || updates.description !== undefined) {
      mutations.push(
        this.graphql(`
          mutation UpdateIssue($issueId: ID!, $title: String, $body: String) {
            updateIssue(input: { id: $issueId, title: $title, body: $body }) {
              issue { id }
            }
          }`,
          { issueId: taskId, title: updates.title, body: updates.description }
        )
      );
    }

    if (updates.status === TaskStatus.COMPLETED) {
      mutations.push(
        this.graphql(`
          mutation CloseIssue($issueId: ID!) {
            closeIssue(input: { issueId: $issueId }) {
              issue { id state }
            }
          }`,
          { issueId: taskId }
        )
      );
    } else if (
      updates.status !== undefined &&
      updates.status !== TaskStatus.COMPLETED
    ) {
      mutations.push(
        this.graphql(`
          mutation ReopenIssue($issueId: ID!) {
            reopenIssue(input: { issueId: $issueId }) {
              issue { id state }
            }
          }`,
          { issueId: taskId }
        )
      );
    }

    await Promise.all(mutations);

    // Re-fetch the issue to return current state
    const data = await this.graphql<{
      node: {
        id: string;
        number: number;
        title: string;
        body: string | null;
        state: "OPEN" | "CLOSED";
        url: string;
        updatedAt: string;
        closedAt: string | null;
        assignees: { nodes: { login: string }[] };
      };
    }>(`
      query GetIssue($id: ID!) {
        node(id: $id) {
          ... on Issue {
            id number title body state url updatedAt closedAt
            assignees(first: 5) { nodes { login } }
          }
        }
      }`,
      { id: taskId }
    );

    const node = data.node;
    return {
      id: node.id,
      title: node.title,
      description: node.body,
      status: node.state,
      listId,
      url: node.url,
      lastModified: new Date(node.updatedAt),
      completedDate: node.closedAt ? new Date(node.closedAt) : null,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deleteTask(_listId: string, _taskId: string): Promise<void> {
    // Don't delete GitHub issues — just unlink from FluidCalendar
  }

  mapToInternalTask(externalTask: ExternalTask, projectId: string): Partial<Task> {
    return this.fieldMapper.mapToInternalTask(externalTask, projectId);
  }

  mapToExternalTask(task: Partial<Task>): TaskToCreate {
    return this.fieldMapper.mapToExternalTask(task);
  }
}

export function createGitHubProvider(settings: unknown): GitHubTaskProvider {
  const s = settings as GitHubSettings;
  if (!s?.token || !s?.login) {
    throw new Error("GitHub provider requires token and login in settings");
  }
  return new GitHubTaskProvider(s);
}
