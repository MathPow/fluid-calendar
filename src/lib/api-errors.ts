import { NextResponse } from "next/server";

/**
 * Short, user-visible API errors. The server returns the French `error`
 * message (unchanged for backwards compat) plus an `errorKey` the client
 * can translate for non-FR locales.
 */
export const API_ERROR_MESSAGES = {
  notFound: "Introuvable",
  createFailed: "Création impossible",
  saveFailed: "Enregistrement impossible",
  invalid: "Invalide",
  invalidOrder: "Ordre invalide",
  invalidLayout: "Disposition invalide",
  movementNotFound: "Mouvement introuvable",
  layerNotFound: "Calque introuvable",
  organisationNotFound: "Organisation introuvable",
  projectNotFound: "Projet introuvable",
  parentProjectNotFound: "Projet parent introuvable",
  fileMissing: "Fichier manquant",
  fileTooLarge15: "Fichier trop lourd (15 Mo max)",
  fileTooLarge10: "Fichier trop lourd (10 Mo max)",
  pdfOrImageOnly: "PDF ou image seulement",
  pinIncorrect: "Code PIN incorrect",
  tooManyAttempts: "Trop d'essais. Réessaie dans 15 minutes.",
  locationIdRequired: "locationId requis",
  projectIdRequired: "projectId requis",
  organisationIdAndYearRequired: "organisationId et year requis",
  organisationIdExpected: "organisationId (string | null) attendu",
  budgetsInvalid: "`budgets` invalide",
  trackedOrBudgetsExpected: "`tracked` ou `budgets` attendu",
  searchParamsRequired: "Fournis ?q= ou ?from=&to=",
  audioRequired: "Ajoute au moins un fichier audio avant de compiler.",
  importedInvoiceReadonly: "Facture importée : modifie-la dans Fiscalité",
} as const;

export type ApiErrorKey = keyof typeof API_ERROR_MESSAGES;

export function apiError(key: ApiErrorKey, status: number) {
  return NextResponse.json(
    { error: API_ERROR_MESSAGES[key], errorKey: `errors.${key}` },
    { status }
  );
}

/**
 * Pick the best message from an API error payload: translate `errorKey` when
 * present, otherwise fall back to the raw `error` text or a generic message.
 */
export function readApiError(
  payload: unknown,
  t: (key: string, params?: Record<string, string | number>) => string,
  fallbackKey = "toasts.common.saveFailed"
): string {
  const p = (payload ?? {}) as { error?: string; errorKey?: string };
  if (p.errorKey) {
    const translated = t(p.errorKey);
    if (translated !== p.errorKey) return translated;
  }
  if (p.error) return p.error;
  return t(fallbackKey);
}
