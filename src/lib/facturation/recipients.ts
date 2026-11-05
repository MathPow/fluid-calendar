/**
 * Address lists typed in a Cc field: « a@x.com, Name <b@y.com>; c@z.com ».
 * Shared by the dialogs and the API, so what the form accepts is what's sent.
 */

const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;".]+(\.[^\s@<>,;".]+)+$/;

/** Split on commas, semicolons and newlines, except inside quotes or <…>. */
function splitEntries(raw: string): string[] {
  const entries: string[] = [];
  let current = "";
  let inQuotes = false;
  let inAngle = false;
  for (const ch of raw) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "<" && !inQuotes) inAngle = true;
    else if (ch === ">" && !inQuotes) inAngle = false;
    if (!inQuotes && !inAngle && /[,;\n\r]/.test(ch)) {
      entries.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  entries.push(current);
  return entries.map((e) => e.trim()).filter(Boolean);
}

/** The bare address of « Name <a@x.com> » or « a@x.com »; null if malformed. */
function addressOf(entry: string): string | null {
  const angle = entry.match(/<([^<>]*)>$/);
  const address = (angle ? angle[1] : entry).trim();
  return EMAIL.test(address) ? address.toLowerCase() : null;
}

export interface ParsedRecipients {
  /** Valid entries as typed (display names kept), without duplicates. */
  list: string[];
  /** Entries that aren't an email address. */
  invalid: string[];
}

/**
 * Parse an address list. Duplicates are dropped, along with anything already
 * in `exclude` (the To field, so nobody gets the invoice twice).
 */
export function parseRecipients(
  raw: string | null | undefined,
  exclude?: string | null
): ParsedRecipients {
  const seen = new Set(
    splitEntries(exclude ?? "")
      .map(addressOf)
      .filter((a): a is string => !!a)
  );
  const list: string[] = [];
  const invalid: string[] = [];
  for (const entry of splitEntries(raw ?? "")) {
    const address = addressOf(entry);
    if (!address) {
      invalid.push(entry);
    } else if (!seen.has(address)) {
      seen.add(address);
      list.push(entry);
    }
  }
  return { list, invalid };
}
