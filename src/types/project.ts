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
  /** For a list with no Projets project: the organisation it's filed under. */
  organisationId?: string | null;
  organisation?: {
    id: string;
    name: string;
    color: string | null;
    image?: string | null;
    isDefault?: boolean;
    sortOrder?: number;
  } | null;
  agentProject?: {
    id: string;
    slug: string;
    name: string;
    color: string | null;
    organisation?: {
      id: string;
      name: string;
      color: string | null;
      image?: string | null;
      isDefault?: boolean;
      sortOrder?: number;
    } | null;
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
  organisationId?: string | null;
}

export type UpdateProject = Partial<NewProject>;
