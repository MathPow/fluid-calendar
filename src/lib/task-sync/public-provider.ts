import { Prisma, TaskProvider } from "@prisma/client";

/** Keys of `settings` that are credentials and must never reach the browser. */
const SECRET_KEYS = ["token", "key", "secret", "password"];

export const providerOrganisation = {
  organisation: { select: { id: true, name: true, color: true } },
} satisfies Prisma.TaskProviderInclude;

/**
 * A task provider as the settings screen may see it: tokens removed, the rest
 * (login, username…) kept for display.
 */
export function publicProvider<T extends TaskProvider>(provider: T) {
  const { accessToken, refreshToken, settings, ...rest } = provider;
  void accessToken;
  void refreshToken;
  const shown: Record<string, unknown> = {};
  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    for (const [k, v] of Object.entries(settings)) {
      if (!SECRET_KEYS.includes(k.toLowerCase())) shown[k] = v;
    }
  }
  return { ...rest, settings: shown };
}

/** The organisation to store: null for "none", checked to exist otherwise. */
export async function resolveOrganisationId(
  db: Pick<Prisma.TransactionClient, "organisation">,
  id: string | null | undefined
): Promise<string | null | undefined> {
  if (id === undefined) return undefined;
  if (!id) return null;
  const found = await db.organisation.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!found) throw new UnknownOrganisationError();
  return found.id;
}

export class UnknownOrganisationError extends Error {
  constructor() {
    super("Organisation not found");
  }
}
