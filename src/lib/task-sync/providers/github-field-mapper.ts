import { TaskStatus } from "@/types/task";

import { FieldMapper } from "../field-mapper";
import { FieldMapping } from "../types";

export class GitHubFieldMapper extends FieldMapper {
  constructor() {
    const githubMappings: FieldMapping[] = [
      {
        internalField: "status",
        externalField: "status",
        preserveLocalValue: false,
        transformToExternal: (value: unknown) => {
          const status = value as TaskStatus | null | undefined;
          return status === TaskStatus.COMPLETED ? "CLOSED" : "OPEN";
        },
        transformToInternal: (value: unknown) => {
          const state = value as string | null | undefined;
          return (state || "").toUpperCase() === "CLOSED"
            ? TaskStatus.COMPLETED
            : TaskStatus.BACKLOG;
        },
      },
      {
        internalField: "description",
        externalField: "description",
        preserveLocalValue: true,
      },
      {
        internalField: "dueDate",
        externalField: "dueDate",
        preserveLocalValue: true,
        transformToExternal: (value: unknown) => {
          if (!value) return null;
          return new Date(new Date(value as string | number | Date).toISOString());
        },
        transformToInternal: (value: unknown) => {
          if (!value) return null;
          return new Date(new Date(value as string | number | Date).toISOString());
        },
      },
      {
        internalField: "priority",
        externalField: "priority",
        preserveLocalValue: true,
      },
    ];

    super(githubMappings);
  }
}
