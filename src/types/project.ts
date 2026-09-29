export enum ProjectStatus {
  ACTIVE = "active",
  ARCHIVED = "archived",
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
  /** Set when this task list belongs to a project of the Projets tab. */
  agentProjectId?: string | null;
  agentProject?: {
    id: string;
    slug: string;
    name: string;
    color: string | null;
    organisation?: { id: string; name: string; color: string | null } | null;
  } | null;
  _count?: {
    tasks: number;
  };
  onClose?: () => void;
}

export interface NewProject {
  name: string;
  description?: string;
  color?: string;
  status?: ProjectStatus;
  agentProjectId?: string | null;
}

export type UpdateProject = Partial<NewProject>;
