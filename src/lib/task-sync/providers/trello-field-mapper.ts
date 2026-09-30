import { TaskStatus } from "@/types/task";

import { FieldMapper } from "../field-mapper";
import { FieldMapping } from "../types";

/**
 * Trello cards ↔ tasks. The provider already reduces a card's list, archive
 * flag and dueComplete into "BACKLOG" | "TODO" | "IN_PROGRESS" | "COMPLETED", so this
 * mapper only translates between those and TaskStatus.
 */
export class TrelloFieldMapper extends FieldMapper {
  constructor() {
    const mappings: FieldMapping[] = [
      {
        internalField: "status",
        externalField: "status",
        preserveLocalValue: false,
        transformToExternal: (value: unknown) => {
          const status = value as TaskStatus | null | undefined;
          if (status === TaskStatus.COMPLETED) return "COMPLETED";
          if (status === TaskStatus.IN_PROGRESS) return "IN_PROGRESS";
          if (status === TaskStatus.BACKLOG) return "BACKLOG";
          if (status === TaskStatus.READY) return "READY";
          if (status === TaskStatus.BLOCKED) return "BLOCKED";
          return "TODO";
        },
        transformToInternal: (value: unknown) => {
          switch ((value as string | null | undefined) ?? "") {
            case "COMPLETED":
              return TaskStatus.COMPLETED;
            case "IN_PROGRESS":
              return TaskStatus.IN_PROGRESS;
            case "BACKLOG":
              return TaskStatus.BACKLOG;
            case "READY":
              return TaskStatus.READY;
            case "BLOCKED":
              return TaskStatus.BLOCKED;
            default:
              return TaskStatus.TODO;
          }
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
        transformToExternal: (value: unknown) =>
          value ? new Date(value as string | number | Date) : null,
        transformToInternal: (value: unknown) =>
          value ? new Date(value as string | number | Date) : null,
      },
      {
        internalField: "priority",
        externalField: "priority",
        preserveLocalValue: true,
      },
    ];

    super(mappings);
  }
}
