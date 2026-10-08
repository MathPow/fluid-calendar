import { useMemo } from "react";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useT } from "@/i18n/client";
import { newDate } from "@/lib/date-utils";

import { useProjectStore } from "@/store/project";
import { useTaskListViewSettings } from "@/store/taskListViewSettings";

import { EnergyLevel, Task, TaskStatus, TimePreference } from "@/types/task";

import { MobileTaskRow } from "./BoardView/MobileTaskRow";
import { SortableHeader, StatusFilter, TaskRow } from "./components";

interface TaskListProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onInlineEdit: (task: Task) => void;
}

export function TaskList({
  tasks,
  onEdit,
  onDelete,
  onStatusChange,
  onInlineEdit,
}: TaskListProps) {
  const t = useT();
  const {
    sortBy,
    sortDirection,
    status,
    energyLevel,
    timePreference,
    tagIds,
    search,
    hideUpcomingTasks,
    setSortBy,
    setSortDirection,
    setFilters,
    resetFilters,
  } = useTaskListViewSettings();
  const { activeProject, projects, setActiveProject } = useProjectStore();

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortDirection("desc");
    }
  };

  // First, filter by project
  const projectFilteredTasks = activeProject
    ? activeProject.id === "no-project"
      ? tasks.filter((task) => !task.projectId)
      : tasks.filter((task) => task.projectId === activeProject.id)
    : tasks;

  // Then apply other filters
  const filteredTasks = useMemo(() => {
    const now = newDate();

    return projectFilteredTasks.filter((task) => {
      // Status filter
      if (status?.length && !status.includes(task.status)) {
        return false;
      }

      // Hide future tasks
      if (
        hideUpcomingTasks &&
        task.startDate &&
        newDate(task.startDate) > now
      ) {
        return false;
      }

      // Energy level filter
      if (
        energyLevel?.length &&
        (!task.energyLevel || !energyLevel.includes(task.energyLevel))
      ) {
        return false;
      }

      // Time preference filter
      if (
        timePreference?.length &&
        (!task.preferredTime || !timePreference.includes(task.preferredTime))
      ) {
        return false;
      }

      // Tags filter
      if (tagIds?.length) {
        const taskTagIds = task.tags.map((t) => t.id);
        if (!tagIds.some((id) => taskTagIds.includes(id))) {
          return false;
        }
      }

      // Search
      if (search) {
        const searchLower = search.toLowerCase();
        return (
          task.title.toLowerCase().includes(searchLower) ||
          task.description?.toLowerCase().includes(searchLower) ||
          task.tags.some((tag) => tag.name.toLowerCase().includes(searchLower))
        );
      }

      return true;
    });
  }, [
    projectFilteredTasks,
    status,
    energyLevel,
    timePreference,
    tagIds,
    search,
    hideUpcomingTasks,
  ]);

  // Apply sorting
  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      switch (sortBy) {
        case "title":
          return direction * a.title.localeCompare(b.title);
        case "dueDate":
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return (
            direction *
            (newDate(a.dueDate).getTime() - newDate(b.dueDate).getTime())
          );
        case "startDate":
          if (!a.startDate) return 1;
          if (!b.startDate) return -1;
          return (
            direction *
            (newDate(a.startDate).getTime() - newDate(b.startDate).getTime())
          );
        case "status":
          return direction * a.status.localeCompare(b.status);
        case "project":
          if (!a.project?.name) return 1;
          if (!b.project?.name) return -1;
          return direction * a.project.name.localeCompare(b.project.name);
        case "priority":
          if (!a.priority) return 1;
          if (!b.priority) return -1;
          return direction * a.priority.localeCompare(b.priority);
        case "energyLevel":
          if (!a.energyLevel) return 1;
          if (!b.energyLevel) return -1;
          return direction * a.energyLevel.localeCompare(b.energyLevel);
        case "preferredTime":
          if (!a.preferredTime) return 1;
          if (!b.preferredTime) return -1;
          return direction * a.preferredTime.localeCompare(b.preferredTime);
        case "duration":
          if (!a.duration) return 1;
          if (!b.duration) return -1;
          return direction * (a.duration - b.duration);
        case "schedule":
          // First sort by auto-scheduled vs manual
          if (a.isAutoScheduled !== b.isAutoScheduled) {
            return direction * (a.isAutoScheduled ? -1 : 1);
          }
          // Then sort by scheduled start time
          if (a.isAutoScheduled && b.isAutoScheduled) {
            if (!a.scheduledStart) return 1;
            if (!b.scheduledStart) return -1;
            return (
              direction *
              (newDate(a.scheduledStart).getTime() -
                newDate(b.scheduledStart).getTime())
            );
          }
          // Default to creation date for manual tasks
          return (
            direction *
            (newDate(b.createdAt).getTime() - newDate(a.createdAt).getTime())
          );
        default:
          return (
            direction *
            (newDate(b.createdAt).getTime() - newDate(a.createdAt).getTime())
          );
      }
    });
  }, [filteredTasks, sortBy, sortDirection]);

  const hasActiveFilters =
    status?.length ||
    energyLevel?.length ||
    timePreference?.length ||
    tagIds?.length ||
    search;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto md:overflow-visible">
      <select
        aria-label={t("tasks.list.filterByProject")}
        className="mb-2 h-11 shrink-0 rounded-xl bg-input px-3 md:hidden"
        value={activeProject?.id || "all"}
        onChange={(e) =>
          setActiveProject(
            projects.find((p) => p.id === e.target.value) || null
          )
        }
      >
        <option value="all">{t("tasks.list.allProjects")}</option>
        {activeProject?.id === "no-project" && (
          <option value="no-project">{t("tasks.list.noProject")}</option>
        )}
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <div className="mb-4 flex flex-wrap items-center gap-2 md:flex-nowrap md:gap-4">
        <StatusFilter
          value={status || []}
          onChange={(value) => setFilters({ status: value })}
        />

        <Select
          value={energyLevel?.[0] || "none"}
          onValueChange={(value) =>
            setFilters({
              energyLevel:
                value !== "none" ? [value as EnergyLevel] : undefined,
            })
          }
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder={t("tasks.filters.allEnergy")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("tasks.filters.allEnergy")}</SelectItem>
            {Object.values(EnergyLevel).map((level) => (
              <SelectItem key={level} value={level}>
                {t(`tasks.energy.${level}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={timePreference?.[0] || "none"}
          onValueChange={(value) =>
            setFilters({
              timePreference:
                value !== "none" ? [value as TimePreference] : undefined,
            })
          }
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder={t("tasks.filters.allTimes")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("tasks.filters.allTimes")}</SelectItem>
            {Object.values(TimePreference).map((time) => (
              <SelectItem key={time} value={time}>
                {t(`tasks.time.${time}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex flex-1 gap-2">
          <Input
            value={search || ""}
            onChange={(e) =>
              setFilters({ search: e.target.value || undefined })
            }
            placeholder={t("tasks.filters.search")}
            className="h-9"
          />
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={resetFilters}
              className="h-9"
            >
              <X className="mr-1 h-4 w-4" />
              {t("tasks.filters.clear")}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="hideUpcomingTasks"
            checked={hideUpcomingTasks}
            onCheckedChange={(checked) =>
              setFilters({ hideUpcomingTasks: checked as boolean })
            }
          />
          <label
            htmlFor="hideUpcomingTasks"
            className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {t("tasks.filters.hideUpcoming")}
          </label>
        </div>
      </div>

      <div className="space-y-4 md:hidden">
        <div className="flex gap-2">
          <select
            aria-label={t("tasks.list.sortAria")}
            className="h-11 min-w-0 flex-1 rounded-xl bg-input px-3"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          >
            {[
              ["title", t("tasks.list.col.title")],
              ["dueDate", t("tasks.list.col.dueDate")],
              ["startDate", t("tasks.list.col.startDate")],
              ["status", t("tasks.list.col.status")],
              ["project", t("tasks.list.col.project")],
              ["priority", t("tasks.list.col.priority")],
              ["energyLevel", t("tasks.list.col.energy")],
              ["preferredTime", t("tasks.dialog.fields.preferredTime")],
              ["duration", t("tasks.list.col.duration")],
              ["schedule", t("tasks.list.col.schedule")],
            ].map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-xl bg-secondary px-3"
            onClick={() =>
              setSortDirection(sortDirection === "asc" ? "desc" : "asc")
            }
          >
            {sortDirection === "asc"
              ? t("tasks.list.sort.asc")
              : t("tasks.list.sort.desc")}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("tasks.mobile.swipeHint")}
        </p>
        {Object.values(TaskStatus).map((group) => {
          const items = sortedTasks.filter((task) => task.status === group);
          return (
            <section key={group} className="space-y-2">
              <h2 className="text-sm font-semibold">
                {t(`tasks.status.${group}`)} · {items.length}
              </h2>
              {items.map((task) => (
                <MobileTaskRow
                  key={task.id}
                  task={task}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onStatusChange={onStatusChange}
                />
              ))}
            </section>
          );
        })}
        {sortedTasks.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("tasks.list.empty")}
          </p>
        )}
      </div>
      <div className="hidden flex-1 overflow-hidden rounded-[28px] bg-card shadow-tile md:block">
        <div
          className="overflow-auto"
          style={{ maxHeight: "calc(100vh - 250px)" }}
        >
          <table className="min-w-full divide-y divide-border">
            <thead className="sticky top-0 bg-card">
              <tr>
                <th
                  scope="col"
                  className="w-8 px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                >
                  {/* Drag handle column */}
                </th>
                <SortableHeader
                  column="status"
                  label={t("tasks.list.col.status")}
                  currentSort={sortBy}
                  direction={sortDirection}
                  onSort={handleSort}
                  className="w-32"
                />
                <SortableHeader
                  column="title"
                  label={t("tasks.list.col.title")}
                  currentSort={sortBy}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  column="priority"
                  label={t("tasks.list.col.priority")}
                  currentSort={sortBy}
                  direction={sortDirection}
                  onSort={handleSort}
                  className="w-32"
                />
                <SortableHeader
                  column="energyLevel"
                  label={t("tasks.list.col.energy")}
                  currentSort={sortBy}
                  direction={sortDirection}
                  onSort={handleSort}
                  className="w-32"
                />
                <SortableHeader
                  column="preferredTime"
                  label={t("tasks.list.col.time")}
                  currentSort={sortBy}
                  direction={sortDirection}
                  onSort={handleSort}
                  className="w-32"
                />
                <SortableHeader
                  column="dueDate"
                  label={t("tasks.list.col.dueDate")}
                  currentSort={sortBy}
                  direction={sortDirection}
                  onSort={handleSort}
                  className="w-40"
                />
                <SortableHeader
                  column="duration"
                  label={t("tasks.list.col.duration")}
                  currentSort={sortBy}
                  direction={sortDirection}
                  onSort={handleSort}
                  className="w-20"
                />
                <SortableHeader
                  column="project"
                  label={t("tasks.list.col.project")}
                  currentSort={sortBy}
                  direction={sortDirection}
                  onSort={handleSort}
                  className="w-40"
                />
                <SortableHeader
                  column="schedule"
                  label={t("tasks.list.col.schedule")}
                  currentSort={sortBy}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  column="startDate"
                  label={t("tasks.list.col.startDate")}
                  currentSort={sortBy}
                  direction={sortDirection}
                  onSort={handleSort}
                  className="w-40"
                />
                <th scope="col" className="relative w-10 px-3 py-2">
                  <span className="sr-only">{t("tasks.list.col.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {sortedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onStatusChange={onStatusChange}
                  onInlineEdit={onInlineEdit}
                />
              ))}
            </tbody>
          </table>
          {sortedTasks.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("tasks.list.empty")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
