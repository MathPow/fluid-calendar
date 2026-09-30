import { ChangeType } from "@/lib/task-sync/task-change-tracker";

import { Project } from "./project";

// In board order. READY and BLOCKED match the « Prêt (à prioriser) » and
// « Bloquant » columns of a Trello board.
export enum TaskStatus {
  BACKLOG = "backlog",
  READY = "ready",
  TODO = "todo",
  IN_PROGRESS = "in_progress",
  BLOCKED = "blocked",
  COMPLETED = "completed",
}

export enum EnergyLevel {
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

export enum Priority {
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
  NONE = "none",
}

export enum TimePreference {
  MORNING = "morning",
  AFTERNOON = "afternoon",
  EVENING = "evening",
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
}

export interface TaskStep {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  sortOrder: number;
  completedAt?: Date | null;
}

/** A step as sent when saving a task: the whole list replaces the old one. */
export interface TaskStepInput {
  id?: string;
  title: string;
  done?: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  dueDate?: Date | null;
  startDate?: Date | null;
  duration?: number | null;
  priority?: Priority | null;
  energyLevel?: EnergyLevel | null;
  preferredTime?: TimePreference | null;
  tags: Tag[];
  steps?: TaskStep[];
  projectId?: string | null;
  project?: Project | null;
  createdAt: Date;
  updatedAt: Date;
  recurrenceRule?: string | null;
  lastCompletedDate?: Date | null;
  completedAt?: Date | null;
  isRecurring: boolean;
  // Auto-scheduling fields
  isAutoScheduled: boolean;
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
  scheduleScore?: number | null;
  lastScheduled?: Date | null;
  scheduleLocked: boolean;
  postponedUntil?: Date | null;
  // External sync fields
  externalTaskId?: string | null;
  source?: string | null;
  externalListId?: string | null;
  lastSyncedAt?: Date | null;
}

export interface NewTask
  extends Omit<Task, "id" | "createdAt" | "updatedAt" | "tags" | "project" | "steps"> {
  tagIds?: string[];
  steps?: TaskStepInput[];
  isAutoScheduled: boolean;
  scheduleLocked: boolean;
}

export interface UpdateTask
  extends Partial<
    Omit<Task, "id" | "createdAt" | "updatedAt" | "tags" | "project" | "steps">
  > {
  tagIds?: string[];
  steps?: TaskStepInput[];
}

export type NewTag = Omit<Tag, "id">;

export interface TaskFilters {
  status?: TaskStatus[];
  tagIds?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  startDate?: Date | null;
  hideUpcomingTasks?: boolean;
  priority?: Priority[];
  energyLevel?: EnergyLevel[];
  timePreference?: TimePreference[];
  search?: string;
  projectId?: string;
}

/**
 * Task with its related entities
 */
export interface TaskWithRelations extends Task {
  tags: Tag[];
  project: Project | null;
}

export interface TaskChange {
  id: string;
  taskId: string;
  changeType: ChangeType;
  changeData: Record<string, unknown>;
}
