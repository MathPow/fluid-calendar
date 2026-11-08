import { NextResponse } from "next/server";

/**
 * Build a JSON error response that carries both a localized key (for the
 * client to translate) and a French fallback message (for direct display
 * when a consumer hasn't migrated to errorKey yet, or for server logs).
 */
export function apiError(
  errorKey: string,
  fallbackMessage: string,
  status: number
) {
  return NextResponse.json({ error: fallbackMessage, errorKey }, { status });
}

/** Common helpers for the most frequent cases. */
export const apiErrors = {
  notFound: (fallback = "Introuvable") =>
    apiError("api.generic.notFound", fallback, 404),
  unauthorized: (fallback = "Non autorisé") =>
    apiError("api.generic.unauthorized", fallback, 401),
  forbidden: (fallback = "Interdit") =>
    apiError("api.generic.forbidden", fallback, 403),
  invalidJson: (fallback = "JSON invalide") =>
    apiError("api.generic.invalidJson", fallback, 400),
  invalidBody: (fallback = "Corps de requête invalide") =>
    apiError("api.generic.invalidBody", fallback, 400),
  saveFailed: (fallback = "Enregistrement impossible") =>
    apiError("api.generic.saveFailed", fallback, 500),
  deleteFailed: (fallback = "Suppression impossible") =>
    apiError("api.generic.deleteFailed", fallback, 500),
};
