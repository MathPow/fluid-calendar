/**
 * Events tagged with an organisation. The link lives in EventOrganisation,
 * keyed by the provider's id (synced feeds recreate their rows), and a
 * recurring series shares one key so every occurrence carries the logo.
 */

type EventKeyFields = {
  id: string;
  externalEventId: string | null;
  recurringEventId: string | null;
  masterEventId: string | null;
};

/** The key an event's link is stored under. `master` is its series master, if any. */
export function eventKey(event: EventKeyFields, master?: EventKeyFields | null): string {
  if (event.recurringEventId) return event.recurringEventId;
  if (master) return master.externalEventId ?? master.id;
  return event.externalEventId ?? event.id;
}

/**
 * Attach `organisationId` to each event: its own link first, else its
 * calendar's organisation. `organisationLinked` says which one it is.
 */
export function withOrganisations<
  E extends EventKeyFields & { feedId: string; feed?: { organisationId?: string | null } | null },
>(events: E[], links: { feedId: string; eventKey: string; organisationId: string }[]) {
  const byId = new Map(events.map((e) => [e.id, e]));
  const linkOf = new Map(links.map((l) => [`${l.feedId}\u0000${l.eventKey}`, l.organisationId]));
  return events.map((e) => {
    const master = e.masterEventId ? byId.get(e.masterEventId) : null;
    const own = linkOf.get(`${e.feedId}\u0000${eventKey(e, master)}`);
    return {
      ...e,
      organisationId: own ?? e.feed?.organisationId ?? null,
      organisationLinked: !!own,
    };
  });
}
