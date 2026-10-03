"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Briefcase,
  Building2,
  Chrome,
  Mail,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  DEFAULT_PROJECT_COLOR,
  initials,
  readableTextOn,
} from "@/lib/projets/meta";
import { cn } from "@/lib/utils";

import { useCalendarStore } from "@/store/calendar";
import { useViewStore } from "@/store/calendar";
import { useRoutineStore } from "@/store/routine";

import { CalendarFeed } from "@/types/calendar";

import { MiniCalendar } from "./MiniCalendar";

interface OrganisationRow {
  id: string;
  name: string;
  color: string | null;
  image: string | null;
  isDefault: boolean;
  sortOrder: number;
}

const NONE = "__none__";

/**
 * Calendar sidebar: mini calendar, then the calendars grouped by organisation
 * (DehorsQC, StayChum…) with everything else under Perso. The ⋯ menu on a
 * calendar renames it, moves it to an organisation, or tags its station.
 */
export function FeedManager() {
  const [syncingFeeds, setSyncingFeeds] = useState<Set<string>>(new Set());
  const [syncingAll, setSyncingAll] = useState(false);
  const [organisations, setOrganisations] = useState<OrganisationRow[]>([]);
  const { feeds, removeFeed, toggleFeed, syncFeed, loadFromDatabase } =
    useCalendarStore();
  const { date: currentDate, setDate } = useViewStore();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/organisations")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: OrganisationRow[]) => {
        if (!cancelled) setOrganisations(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    // Organisations in the user's order (Projets ▸ Réorganiser); the default
    // one collects calendars without an organisation, wherever it sits.
    const ordered = [...organisations].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "fr")
    );
    const known = new Set(ordered.filter((o) => !o.isDefault).map((o) => o.id));
    const sections = ordered.map((org) => ({
      key: org.isDefault ? "perso" : org.id,
      title: org.name,
      color: org.color,
      image: org.image,
      feeds: org.isDefault
        ? feeds.filter((f) => !f.organisationId || !known.has(f.organisationId))
        : feeds.filter((f) => f.organisationId === org.id),
    }));
    if (!ordered.some((o) => o.isDefault)) {
      sections.push({
        key: "perso",
        title: "Perso",
        color: "#ffd166",
        image: null,
        feeds: feeds.filter(
          (f) => !f.organisationId || !known.has(f.organisationId)
        ),
      });
    }
    return sections.filter((s) => s.feeds.length > 0 || s.key === "perso");
  }, [feeds, organisations]);

  const patchFeed = useCallback(
    async (
      feed: CalendarFeed,
      patch: Record<string, unknown>,
      done: string
    ) => {
      try {
        const res = await fetch(`/api/feeds/${feed.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        await loadFromDatabase();
        toast.success(done);
      } catch (e) {
        toast.error("Modification impossible", {
          description: e instanceof Error ? e.message : undefined,
        });
      }
    },
    [loadFromDatabase]
  );

  const renameFeed = useCallback(
    (feed: CalendarFeed) => {
      const name = window.prompt("Nouveau nom du calendrier", feed.name);
      if (!name || name.trim() === feed.name) return;
      patchFeed(feed, { name: name.trim() }, "Calendrier renommé.");
    },
    [patchFeed]
  );

  const handleRemoveFeed = useCallback(
    async (feed: CalendarFeed) => {
      if (
        !window.confirm(
          `Supprimer le calendrier « ${feed.name} » et ses événements ?`
        )
      )
        return;
      try {
        await removeFeed(feed.id);
      } catch (error) {
        console.error("Failed to remove feed:", error);
      }
    },
    [removeFeed]
  );

  const handleSyncAll = useCallback(async () => {
    if (syncingAll) return;
    setSyncingAll(true);
    try {
      await Promise.all(feeds.map((feed) => syncFeed(feed.id)));
    } finally {
      setSyncingAll(false);
    }
  }, [feeds, syncFeed, syncingAll]);

  const handleSyncFeed = useCallback(
    async (feedId: string) => {
      if (syncingFeeds.has(feedId)) return;
      try {
        setSyncingFeeds((prev) => new Set(prev).add(feedId));
        await syncFeed(feedId);
      } finally {
        setSyncingFeeds((prev) => {
          const next = new Set(prev);
          next.delete(feedId);
          return next;
        });
      }
    },
    [syncFeed, syncingFeeds]
  );

  return (
    <div className="flex flex-col bg-card">
      <div className="border-b border-border py-4">
        <MiniCalendar currentDate={currentDate} onDateClick={setDate} />
      </div>
      <div className="space-y-5 p-4">
        <div className="flex items-center justify-between">
          <h3 className="etiquette">Calendriers</h3>
          <button
            onClick={handleSyncAll}
            aria-label="Synchroniser tous les calendriers"
            disabled={syncingAll || feeds.length === 0}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-40"
            title="Rafraîchir tous les calendriers"
          >
            <RefreshCw
              className={cn("h-4 w-4", syncingAll && "animate-spin")}
            />
          </button>
        </div>

        {feeds.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Aucun calendrier pour l&apos;instant
          </p>
        )}

        <GhostRow />

        {groups.map((group) => (
          <div key={group.key} className="space-y-1">
            <div className="flex items-center gap-2 px-1">
              {group.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={group.image}
                  alt=""
                  className="h-5 w-5 rounded-md object-cover"
                />
              ) : (
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-md text-[9px] font-extrabold"
                  style={{
                    backgroundColor: group.color ?? DEFAULT_PROJECT_COLOR,
                    color: readableTextOn(group.color ?? DEFAULT_PROJECT_COLOR),
                  }}
                >
                  {initials(group.title)}
                </span>
              )}
              <span className="text-[13px] font-semibold tracking-title">
                {group.title}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {group.feeds.length}
              </span>
            </div>
            {group.feeds.length === 0 ? (
              <p className="px-1 text-[12px] text-muted-foreground">
                Aucun calendrier.
              </p>
            ) : (
              group.feeds.map((feed) => (
                <div
                  key={feed.id}
                  className="group flex items-center justify-between rounded-xl p-2 hover:bg-secondary"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Checkbox
                      checked={feed.enabled}
                      onCheckedChange={() => toggleFeed(feed.id)}
                      className="h-4 w-4"
                    />
                    <div
                      className="h-3 w-3 flex-shrink-0 rounded-full"
                      style={{
                        backgroundColor: feed.color || "hsl(var(--primary))",
                      }}
                    />
                    <span className="calendar-name min-w-0 truncate text-sm text-foreground">
                      {feed.name}
                    </span>
                    {feed.station && (
                      <span
                        className="text-muted-foreground"
                        title={feed.station === "work" ? "Client" : "Perso"}
                      >
                        {feed.station === "work" ? (
                          <Briefcase className="h-3.5 w-3.5" />
                        ) : (
                          <User className="h-3.5 w-3.5" />
                        )}
                      </span>
                    )}
                    {feed.type === "GOOGLE" && (
                      <Chrome className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    )}
                    {feed.type === "OUTLOOK" && (
                      <Mail className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => handleSyncFeed(feed.id)}
                      disabled={syncingFeeds.has(feed.id)}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                      title="Rafraîchir"
                      aria-label={`Rafraîchir ${feed.name}`}
                    >
                      <RefreshCw
                        className={cn(
                          "h-3.5 w-3.5",
                          syncingFeeds.has(feed.id) && "animate-spin"
                        )}
                      />
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          aria-label={`Options de ${feed.name}`}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onSelect={() => renameFeed(feed)}>
                          <Pencil /> Renommer
                        </DropdownMenuItem>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <Building2 /> Organisation
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuRadioGroup
                              value={feed.organisationId ?? NONE}
                              onValueChange={(v) =>
                                patchFeed(
                                  feed,
                                  { organisationId: v === NONE ? null : v },
                                  "Calendrier déplacé."
                                )
                              }
                            >
                              <DropdownMenuRadioItem value={NONE}>
                                Perso
                              </DropdownMenuRadioItem>
                              {organisations
                                .filter((o) => !o.isDefault)
                                .map((o) => (
                                  <DropdownMenuRadioItem
                                    key={o.id}
                                    value={o.id}
                                  >
                                    {o.name}
                                  </DropdownMenuRadioItem>
                                ))}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <User /> Station
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuLabel>
                              Visible quand le sélecteur est sur…
                            </DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                              value={feed.station ?? NONE}
                              onValueChange={(v) =>
                                patchFeed(
                                  feed,
                                  { station: v === NONE ? null : v },
                                  "Station mise à jour."
                                )
                              }
                            >
                              <DropdownMenuRadioItem value={NONE}>
                                Toujours
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="personal">
                                Perso
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="work">
                                Client
                              </DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-negative-foreground focus:bg-negative focus:text-negative-foreground"
                          onSelect={() => handleRemoveFeed(feed)}
                        >
                          <Trash2 /> Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The ghost blocks (« Semaine type » layers) as one line of the calendar list:
 * one checkbox hides or shows them all. Per-layer switches live under Calques.
 */
function GhostRow() {
  const layers = useRoutineStore((s) => s.layers);
  const setAllVisible = useRoutineStore((s) => s.setAllVisible);
  const blocks = layers.reduce((n, l) => n + l.blocks.length, 0);
  if (!blocks) return null;
  const visible = layers.some((l) => l.visible && l.blocks.length > 0);
  return (
    <div className="flex items-center gap-3 rounded-xl p-2 hover:bg-secondary">
      <Checkbox
        checked={visible}
        onCheckedChange={() => setAllVisible(!visible)}
        className="h-4 w-4"
        aria-label="Afficher les blocs fantômes"
      />
      <span className="h-3 w-3 flex-shrink-0 rounded-full border-2 border-dashed border-muted-foreground/60" />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        Blocs fantômes
      </span>
      <span className="text-[11px] text-muted-foreground">{blocks}</span>
    </div>
  );
}
