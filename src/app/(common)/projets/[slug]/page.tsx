import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft, AtSign, Phone } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AskBox } from "@/components/projets/AskBox";
import { Avatar } from "@/components/projets/ImageField";
import { ProjectDetailActions } from "@/components/projets/ProjectDetailActions";
import { ProjectLocationsTile } from "@/components/projets/ProjectLocationsTile";
import {
  ProjectStorePage,
  type StoreFact,
} from "@/components/projets/ProjectStorePage";
import { type ProjectTab, ProjectTabs } from "@/components/projets/ProjectTabs";
import { ProjectTasksTile } from "@/components/projets/ProjectTasksTile";
import { ProjectMark } from "@/components/projets/ProjectTile";
import { ShowcaseRunControl } from "@/components/projets/ShowcaseRunControl";
import { LinkPill } from "@/components/projets/link-icons";
import { Badge } from "@/components/ui/badge";

import { getLocale, getT } from "@/i18n/server";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PROJECT_COLOR,
  initials,
  pad2,
  timeAgoFr,
} from "@/lib/projets/meta";
import {
  machineSelect,
  organisationSelect,
  projectInclude,
} from "@/lib/projets/queries";
import {
  type ShowcaseRunStatus,
  type ShowcaseRunView,
  expireStaleShowcaseRuns,
  showcaseRunSelect,
} from "@/lib/projets/showcase-runs";

export const dynamic = "force-dynamic";

/** "https://dehorsqc.com/x" → "dehorsqc.com"; links are typed by hand, so tolerate junk. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function formatStamp(date: Date, locale: string): string {
  return date.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function ProjetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ onglet?: string }>;
}) {
  const { slug } = await params; // Next already URL-decodes route params
  const { onglet } = await searchParams;
  const t = await getT();
  const locale = await getLocale();
  const [project, projects, contacts, organisations, showcase, media] =
    await Promise.all([
      prisma.agentProject.findUnique({
        where: { slug },
        include: {
          ...projectInclude,
          activities: { orderBy: { createdAt: "desc" }, take: 200 },
        },
      }),
      prisma.agentProject.findMany({
        where: { archived: false },
        select: {
          id: true,
          name: true,
          slug: true,
          color: true,
          parentId: true,
          station: true,
          organisationId: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.contact.findMany({
        select: {
          id: true,
          name: true,
          company: true,
          role: true,
          email: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.organisation.findMany({
        select: organisationSelect,
        orderBy: { sortOrder: "asc" },
      }),
      prisma.projectShowcase.findFirst({ where: { project: { slug } } }),
      // Everything but the bytes, which /api/project-media/[id] serves.
      prisma.projectMedia.findMany({
        where: { project: { slug } },
        select: {
          id: true,
          name: true,
          caption: true,
          capsule: true,
          inGallery: true,
        },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

  if (!project) notFound();

  const machines = await prisma.machine.findMany({
    select: machineSelect,
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });

  // The task list attached to this project (Tasks / Calendar tabs), its open
  // tasks, and the unattached lists that could be attached instead. Plus the
  // latest /project-showcase run for the Présentation tab.
  await expireStaleShowcaseRuns(project.id);
  const [taskList, candidateLists, lastRun] = await Promise.all([
    prisma.project.findUnique({
      where: { agentProjectId: project.id },
      select: {
        id: true,
        tasks: {
          orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
          select: {
            id: true,
            title: true,
            status: true,
            dueDate: true,
            steps: { select: { done: true }, orderBy: { sortOrder: "asc" } },
          },
        },
      },
    }),
    prisma.project.findMany({
      where: { agentProjectId: null, status: "active" },
      select: { id: true, name: true, _count: { select: { tasks: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.showcaseRun.findFirst({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      select: showcaseRunSelect,
    }),
  ]);
  const showcaseRun: ShowcaseRunView | null = lastRun && {
    ...lastRun,
    status: lastRun.status as ShowcaseRunStatus,
    createdAt: lastRun.createdAt.toISOString(),
    startedAt: lastRun.startedAt?.toISOString() ?? null,
    finishedAt: lastRun.finishedAt?.toISOString() ?? null,
  };
  const openTasks = (taskList?.tasks ?? []).filter(
    (t) => t.status !== "completed"
  );

  const color = project.color ?? DEFAULT_PROJECT_COLOR;
  const activityCount = project._count.activities;
  const website = project.links.find((l) => l.kind === "website");
  const facts: StoreFact[] = [
    showcase?.status && {
      label: t("projects.detail.facts.status"),
      value: showcase.status,
    },
    showcase?.startedAt && {
      label: t("projects.detail.facts.started"),
      // Stored as a calendar date at UTC midnight; format it in UTC or it
      // slips to the day before in Montréal.
      value: showcase.startedAt.toLocaleDateString(
        locale === "fr" ? "fr-CA" : "en-CA",
        { dateStyle: "long", timeZone: "UTC" }
      ),
    },
    project.organisation &&
      !project.organisation.isDefault && {
        label: t("projects.detail.facts.organisation"),
        value: project.organisation.name,
      },
    project.lastActivityAt && {
      label: t("projects.detail.facts.lastActivity"),
      value: timeAgoFr(project.lastActivityAt),
    },
    website && {
      label: t("projects.detail.facts.site"),
      value: website.label || hostOf(website.url),
      href: website.url,
    },
  ].filter((f): f is StoreFact => Boolean(f));

  // Tabs keep the page calm: the store page first when there is one. Without
  // one, the Présentation tab comes after the Fiche and offers to generate it.
  const runControl = (
    <ShowcaseRunControl
      projectId={project.id}
      hasPath={Boolean(project.path)}
      hasShowcase={Boolean(showcase)}
      initialRun={showcaseRun}
      layout={showcase ? "bar" : "empty"}
    />
  );
  const presentationTab: ProjectTab = {
    value: "presentation",
    label: t("projects.tabs.presentation"),
    content: showcase ? (
      <>
        {runControl}
        <ProjectStorePage
          media={media}
          description={project.description}
          facts={facts}
          tags={showcase.tags}
          about={showcase.about}
        />
      </>
    ) : (
      runControl
    ),
  };
  const tabs: ProjectTab[] = [
    ...(showcase ? [presentationTab] : []),
    {
      value: "fiche",
      label: t("projects.tabs.fiche"),
      content: (
        <>
          {/* ------------------------------------------ Ink tile + colour tile */}
          <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="tile-ink flex flex-col gap-7 p-7 md:p-10">
              {/* The store page already shows the description up top. */}
              {!showcase && (
                <div>
                  <p className="etiquette text-background/60">
                    {t("projects.detail.sections.about")}
                  </p>
                  <p className="voice mt-4 text-[24px] text-background md:text-[28px]">
                    {project.description ||
                      t("projects.detail.sections.aboutEmpty")}
                  </p>
                </div>
              )}
              <div>
                <p className="etiquette text-background/60">
                  {t("projects.detail.sections.links")}
                </p>
                {project.links.length === 0 ? (
                  <p className="mt-3 text-[14px] text-background/60">
                    {t("projects.detail.sections.linksEmpty")}
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {project.links.map((l) => (
                      <LinkPill
                        key={l.id}
                        kind={l.kind}
                        label={l.label}
                        url={l.url}
                        onInk
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div
              className="rounded-tile p-7 text-[#19181c] md:p-10"
              style={{ backgroundColor: color }}
            >
              <p className="etiquette text-[#19181c]/60">
                {t("projects.detail.sections.stack")}
              </p>
              {project.stack.length === 0 ? (
                <p className="mt-4 font-serif text-[15px] italic text-[#19181c]/70">
                  {t("projects.detail.sections.stackEmpty")}
                </p>
              ) : (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {project.stack.map((s) => (
                    <li
                      key={s}
                      className="rounded-full bg-[#19181c]/10 px-3 py-1.5 text-[13px] font-medium"
                    >
                      {s}
                    </li>
                  ))}
                </ul>
              )}
              {project.children.length > 0 && (
                <>
                  <p className="etiquette mt-8 text-[#19181c]/60">
                    {t("projects.detail.sections.subprojects")}
                  </p>
                  <p className="mt-3 text-[40px] font-extrabold leading-none tracking-[-0.02em]">
                    {project.children.length}
                  </p>
                </>
              )}
            </div>
          </section>

          {/* -------------------------------------- Sub-projects + Contacts */}
          <section className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="tile p-7 md:p-10">
              <p className="etiquette">
                {t("projects.detail.sections.subprojects")}
              </p>
              {project.children.length === 0 ? (
                <p className="mt-4 text-[14px] text-muted-foreground">
                  {t("projects.detail.sections.subprojectsEmpty")}
                </p>
              ) : (
                <ol className="mt-4">
                  {project.children.map((c, i) => (
                    <li
                      key={c.id}
                      className="border-b border-border last:border-b-0"
                    >
                      <Link
                        href={`/projets/${encodeURIComponent(c.slug)}`}
                        className="flex items-baseline gap-3 py-3.5"
                      >
                        <span className="rangee-num">{pad2(i + 1)}</span>
                        <span
                          className="relative top-[-1px] h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: c.color ?? color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-title">
                          {c.name}
                        </span>
                        <span className="text-[12px] text-muted-foreground">
                          {c.lastActivityAt && timeAgoFr(c.lastActivityAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="tile p-7 md:p-10">
              <div className="flex items-center justify-between">
                <p className="etiquette">
                  {t("projects.detail.sections.contacts")}
                </p>
                <Link
                  href="/contacts"
                  className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
                >
                  {t("projects.detail.sections.contactsAll")}
                </Link>
              </div>
              {project.contacts.length === 0 ? (
                <p className="mt-4 text-[14px] text-muted-foreground">
                  {t("projects.detail.sections.contactsEmpty")}
                </p>
              ) : (
                <ul className="mt-4">
                  {project.contacts.map(({ contact, role }) => (
                    <li
                      key={contact.id}
                      className="flex items-center gap-3 border-b border-border py-3.5 last:border-b-0"
                    >
                      <Avatar
                        image={contact.image}
                        fallback={initials(contact.name)}
                        color="#a8ccff"
                        className="h-9 w-9 text-[12px]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold tracking-title">
                          {contact.name}
                        </p>
                        <p className="truncate text-[13px] text-muted-foreground">
                          {[role ?? contact.role, contact.company]
                            .filter(Boolean)
                            .join(" · ") ||
                            contact.email ||
                            "—"}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {contact.email && (
                          <a
                            href={`mailto:${contact.email}`}
                            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                            title={contact.email}
                          >
                            <AtSign className="h-4 w-4" />
                          </a>
                        )}
                        {contact.phone && (
                          <a
                            href={`tel:${contact.phone}`}
                            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                            title={contact.phone}
                          >
                            <Phone className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Every machine the project lives on, each with its terminal. */}
          <ProjectLocationsTile
            projectId={project.id}
            locations={project.locations.map((l) => ({
              id: l.id,
              path: l.path,
              lastSeenAt: l.lastSeenAt.toISOString(),
              machine: l.machine,
            }))}
            machines={machines}
          />
        </>
      ),
    },
    ...(showcase ? [] : [presentationTab]),
    {
      value: "taches",
      label: t("projects.tabs.taches"),
      count: openTasks.length,
      content: (
        <ProjectTasksTile
          agentProjectId={project.id}
          list={
            taskList
              ? {
                  id: taskList.id,
                  openCount: openTasks.length,
                  doneCount: taskList.tasks.length - openTasks.length,
                }
              : null
          }
          tasks={openTasks.slice(0, 10).map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            dueDate: t.dueDate ? t.dueDate.toISOString() : null,
            steps: t.steps,
          }))}
          candidates={candidateLists.map((c) => ({
            id: c.id,
            name: c.name,
            taskCount: c._count.tasks,
          }))}
        />
      ),
    },
    {
      value: "journal",
      label: t("projects.tabs.journal"),
      count: activityCount,
      content: (
        <>
          <div className="mt-6">
            <AskBox slug={project.slug} />
          </div>

          {project.activities.length === 0 ? (
            <div className="tile mt-5 px-6 py-16 text-center">
              <p className="text-[15px] font-semibold tracking-title">
                {t("projects.detail.sections.journalEmpty.title")}
              </p>
              <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
                {t("projects.detail.sections.journalEmpty.body")}
              </p>
            </div>
          ) : (
            <section className="tile mt-5 p-7 md:p-10">
              <p className="etiquette">
                {t("projects.detail.sections.journal.title")}
              </p>
              <ol className="mt-4">
                {project.activities.map((a, i) => (
                  <li
                    key={a.id}
                    className="grid gap-3 border-b border-border py-6 last:border-b-0 md:grid-cols-[2rem_1fr] md:gap-6"
                  >
                    <span className="rangee-num pt-0.5">{pad2(i + 1)}</span>
                    <div className="min-w-0">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <time className="text-[13px] text-muted-foreground">
                          {formatStamp(a.createdAt, locale)}
                        </time>
                        {a.agent ? (
                          <Badge
                            variant="tint"
                            className="px-2.5 py-0.5 text-[11px]"
                          >
                            {a.agent}
                          </Badge>
                        ) : null}
                        {a.source ? (
                          <Badge
                            variant="outline"
                            className="px-2.5 py-0.5 text-[11px]"
                          >
                            {a.source}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-[15px] leading-7 text-foreground/90 [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2 [&_strong]:font-semibold">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {a.summary}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      ),
    },
  ];
  const initialTab = tabs.some((t) => t.value === onglet)
    ? onglet!
    : tabs[0].value;

  return (
    <div className="page pb-16 pt-8 md:pt-12">
      <Link
        href={
          project.parent
            ? `/projets/${encodeURIComponent(project.parent.slug)}`
            : "/projets"
        }
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />{" "}
        {project.parent ? project.parent.name : t("projects.detail.back")}
      </Link>

      <header className="mt-6 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-4">
            <ProjectMark
              name={project.name}
              color={project.color}
              image={project.image}
              className="h-14 w-14 md:h-16 md:w-16"
            />
            <h1 className="display break-words text-[40px] sm:text-[56px] md:text-[72px]">
              {project.name}.
            </h1>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {project.organisation && (
              <Badge className="px-4 py-2 text-[13px]">
                {project.organisation.name}
              </Badge>
            )}
            <Badge className="px-4 py-2 text-[13px]">
              {t(
                activityCount > 1
                  ? "projects.detail.badges.activityPlural"
                  : "projects.detail.badges.activity",
                { count: activityCount }
              )}
            </Badge>
            {project.lastActivityAt && (
              <Badge className="px-4 py-2 text-[13px]">
                {t("projects.detail.badges.lastActivity", {
                  ago: timeAgoFr(project.lastActivityAt),
                })}
              </Badge>
            )}
            {project.locations.length > 1 ? (
              <span className="font-serif text-[15px] italic text-muted-foreground">
                {t("projects.detail.badges.machines", {
                  count: project.locations.length,
                })}
              </span>
            ) : project.locations[0] || project.path ? (
              <span className="font-serif text-[15px] italic text-muted-foreground">
                {project.locations[0]
                  ? `${project.locations[0].path} · ${project.locations[0].machine.label || project.locations[0].machine.name}`
                  : project.path}
              </span>
            ) : null}
          </div>
        </div>
        <ProjectDetailActions
          project={project}
          projects={projects}
          organisations={organisations}
          contacts={contacts}
        />
      </header>
      <div className="filet mt-8" />

      <ProjectTabs initial={initialTab} tabs={tabs} />
    </div>
  );
}
