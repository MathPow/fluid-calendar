/**
 * Reads the "download your data" exports of LinkedIn, Instagram and Facebook
 * (the zip, or the one file that matters inside it) into people that could
 * become contacts. Runs in the browser: the export never leaves the device,
 * only the people picked are sent.
 *
 * The networks don't hand out contact lists through their APIs, so the
 * official export is the one reliable source:
 * - LinkedIn: Connections.csv (name, profile URL, company, position, sometimes email)
 * - Instagram: followers_*.json + following.json (usernames only)
 * - Facebook: your_friends.json (names only, no profile link)
 */

export type ImportPlatform = "linkedin" | "instagram" | "facebook";

export interface SocialCandidate {
  /** Stable id of the person, also the dismissal key. */
  key: string;
  name: string;
  /** Profiles to attach (Facebook friends have none: the export has no link). */
  links: { platform: ImportPlatform; value: string }[];
  /** Every network the person was found on. */
  sources: ImportPlatform[];
  email?: string;
  company?: string;
  role?: string;
  /** Instagram: follows you and you follow them. */
  mutual?: boolean;
  /** Instagram: only one direction. */
  follow?: "follower" | "following";
  /** When you connected, ISO date. */
  since?: string;
}

/** Lower-case, accents off, spaces squeezed: "Élise  Côté" → "elise cote". */
export function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The comparable part of a profile link or handle, so "@Foo",
 * "instagram.com/foo/" and "https://www.instagram.com/_u/foo" all give "foo".
 * LinkedIn keeps its "in/" or "company/" prefix.
 */
export function socialKey(platform: string, value: string): string {
  let v = value.trim();
  if (/^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}\//i.test(v)) {
    try {
      v = new URL(/^https?:/i.test(v) ? v : `https://${v}`).pathname;
    } catch {
      /* keep as typed */
    }
  }
  v = v
    .replace(/^\/+|\/+$/g, "")
    .replace(/^@/, "")
    .toLowerCase();
  try {
    v = decodeURIComponent(v);
  } catch {
    /* keep as typed */
  }
  if (platform === "instagram") v = v.replace(/^_u\//, "").split("/")[0];
  if (platform === "linkedin" && !/^(in|company|pub)\//.test(v)) v = `in/${v}`;
  return `${platform}:${v}`;
}

/** Facebook exports store UTF-8 bytes as Latin-1 characters ("Ã©" for "é"). */
function fixMojibake(s: string): string {
  if (!/[\u0080-ÿ]/.test(s) || /[^\u0000-ÿ]/.test(s)) return s;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(s, (c) => c.charCodeAt(0))
    );
  } catch {
    return s;
  }
}

function isoDate(epochSeconds: unknown): string | undefined {
  return typeof epochSeconds === "number" && epochSeconds > 0
    ? new Date(epochSeconds * 1000).toISOString().slice(0, 10)
    : undefined;
}

// ---------- LinkedIn ----------

/** RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/** "05 Oct 2024" → "2024-10-05". */
function linkedinDate(s: string): string | undefined {
  const m = /^(\d{1,2}) (\w{3}) (\d{4})$/.exec(s.trim());
  const month = m && MONTHS[m[2].toLowerCase()];
  return m && month ? `${m[3]}-${month}-${m[1].padStart(2, "0")}` : undefined;
}

export function parseLinkedInConnections(text: string): SocialCandidate[] {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  // A "Notes:" preamble comes before the real header.
  const start = rows.findIndex((r) => r[0]?.trim() === "First Name");
  if (start < 0) return [];
  const header = rows[start].map((h) => h.trim());
  const col = (r: string[], name: string) =>
    (r[header.indexOf(name)] ?? "").trim();
  const out: SocialCandidate[] = [];
  for (const r of rows.slice(start + 1)) {
    const name = `${col(r, "First Name")} ${col(r, "Last Name")}`.trim();
    if (!name) continue;
    const url = col(r, "URL");
    out.push({
      key: url ? socialKey("linkedin", url) : `linkedin:name:${normName(name)}`,
      name,
      links: url ? [{ platform: "linkedin", value: url }] : [],
      sources: ["linkedin"],
      email: col(r, "Email Address") || undefined,
      company: col(r, "Company") || undefined,
      role: col(r, "Position") || undefined,
      since: linkedinDate(col(r, "Connected On")),
    });
  }
  return out;
}

// ---------- Instagram ----------

interface IgEntry {
  title?: string;
  string_list_data?: { href?: string; value?: string; timestamp?: number }[];
}

function igUsernames(
  entries: IgEntry[]
): { username: string; since?: string }[] {
  const out: { username: string; since?: string }[] = [];
  for (const e of entries) {
    const d = e.string_list_data?.[0];
    const raw = d?.value || e.title || d?.href;
    if (!raw) continue;
    const username = socialKey("instagram", raw).slice("instagram:".length);
    if (username) out.push({ username, since: isoDate(d?.timestamp) });
  }
  return out;
}

/** The entries of followers_N.json (a bare array) or following.json. */
function igEntries(json: unknown): IgEntry[] {
  if (Array.isArray(json)) return json as IgEntry[];
  if (json && typeof json === "object") {
    for (const v of Object.values(json as Record<string, unknown>))
      if (Array.isArray(v)) return v as IgEntry[];
  }
  return [];
}

/** The HTML export: every profile link in the page. */
function igHtmlUsernames(html: string): { username: string }[] {
  const seen = new Set<string>();
  for (const m of html.matchAll(
    /https?:\/\/(?:www\.)?instagram\.com\/(?:_u\/)?([\w.]+)/g
  ))
    seen.add(m[1].toLowerCase());
  return [...seen].map((username) => ({ username }));
}

export function buildInstagram(
  followers: { username: string; since?: string }[],
  following: { username: string; since?: string }[]
): SocialCandidate[] {
  const byName = new Map<
    string,
    SocialCandidate & { _in: boolean; _out: boolean }
  >();
  const add = (list: typeof followers, dir: "in" | "out") => {
    for (const { username, since } of list) {
      const row = byName.get(username) ?? {
        key: `instagram:${username}`,
        name: username,
        links: [{ platform: "instagram" as const, value: `@${username}` }],
        sources: ["instagram" as const],
        _in: false,
        _out: false,
      };
      if (dir === "in") row._in = true;
      else row._out = true;
      row.since =
        row.since && since
          ? row.since < since
            ? row.since
            : since
          : (row.since ?? since);
      byName.set(username, row);
    }
  };
  add(followers, "in");
  add(following, "out");
  return [...byName.values()].map(({ _in, _out, ...c }) => ({
    ...c,
    mutual: _in && _out,
    follow: _in && _out ? undefined : _in ? "follower" : "following",
  }));
}

// ---------- Facebook ----------

export function parseFacebookFriends(json: unknown): SocialCandidate[] {
  let list: unknown[] = [];
  if (Array.isArray(json)) list = json;
  else if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    const arr =
      o.friends_v2 ?? o.friends ?? Object.values(o).find(Array.isArray);
    if (Array.isArray(arr)) list = arr;
  }
  const out: SocialCandidate[] = [];
  for (const f of list) {
    const name = fixMojibake(
      String((f as { name?: unknown })?.name ?? "")
    ).trim();
    if (!name) continue;
    out.push({
      key: `facebook:name:${normName(name)}`,
      name,
      links: [],
      sources: ["facebook"],
      since: isoDate((f as { timestamp?: unknown }).timestamp),
    });
  }
  return out;
}

// ---------- Files ----------

export interface ParsedExport {
  candidates: SocialCandidate[];
  /** Per file: what was found in it, for the summary. */
  found: { file: string; platform: ImportPlatform | null; count: number }[];
}

type Pending = {
  linkedin: SocialCandidate[];
  facebook: SocialCandidate[];
  igFollowers: { username: string; since?: string }[];
  igFollowing: { username: string; since?: string }[];
};

/** Sorts one file (by its path in the export) into the right pile. */
function readEntry(
  path: string,
  text: string,
  acc: Pending
): ImportPlatform | null {
  const base = path.split("/").pop()!.toLowerCase();
  const lower = path.toLowerCase();
  if (
    base === "connections.csv" ||
    (base.endsWith(".csv") && text.includes("First Name,Last Name"))
  ) {
    acc.linkedin.push(...parseLinkedInConnections(text));
    return "linkedin";
  }
  const isJson = base.endsWith(".json");
  const isHtml = base.endsWith(".html");
  if (!isJson && !isHtml) return null;

  if (
    /^followers(_\d+)?\.(json|html)$/.test(base) ||
    /^following\.(json|html)$/.test(base)
  ) {
    const list = isJson
      ? igUsernames(igEntries(JSON.parse(text)))
      : igHtmlUsernames(text);
    (base.startsWith("followers") ? acc.igFollowers : acc.igFollowing).push(
      ...list
    );
    return "instagram";
  }
  if (
    isJson &&
    (/^(your_)?friends\.json$/.test(base) ||
      (lower.includes("friends") && base === "friends_v2.json"))
  ) {
    acc.facebook.push(...parseFacebookFriends(JSON.parse(text)));
    return "facebook";
  }
  return null;
}

const WANTED =
  /(^|\/)(connections\.csv|followers(_\d+)?\.(json|html)|following\.(json|html)|(your_)?friends\.json)$/i;

/** Reads the dropped files (zips, CSV, JSON, HTML) into one de-duplicated list. */
export async function readExports(files: File[]): Promise<ParsedExport> {
  const acc: Pending = {
    linkedin: [],
    facebook: [],
    igFollowers: [],
    igFollowing: [],
  };
  const found: ParsedExport["found"] = [];
  for (const file of files) {
    const read = (path: string, text: string) => {
      try {
        const before = countOf(acc);
        const platform = readEntry(path, text, acc);
        found.push({ file: path, platform, count: countOf(acc) - before });
      } catch {
        found.push({ file: path, platform: null, count: 0 });
      }
    };
    if (/\.zip$/i.test(file.name) || file.type === "application/zip") {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter(
        (e) => !e.dir && WANTED.test(e.name)
      );
      // Instagram's "following" sits next to "pending_follow_requests",
      // "close_friends"… only the two real lists are wanted.
      if (entries.length === 0)
        found.push({ file: file.name, platform: null, count: 0 });
      for (const e of entries)
        read(`${file.name}/${e.name}`, await e.async("string"));
    } else {
      read(file.name, await file.text());
    }
  }

  const candidates = mergeByName([
    ...acc.linkedin,
    ...acc.facebook,
    ...buildInstagram(acc.igFollowers, acc.igFollowing),
  ]);
  return { candidates, found };
}

function countOf(a: Pending) {
  return (
    a.linkedin.length +
    a.facebook.length +
    a.igFollowers.length +
    a.igFollowing.length
  );
}

/**
 * One row per person: the same key twice (two exports of the same network)
 * collapses, and a LinkedIn connection and a Facebook friend with the exact
 * same full name become one person with both sources. Instagram only knows
 * usernames, so it never merges by name.
 */
function mergeByName(list: SocialCandidate[]): SocialCandidate[] {
  const byKey = new Map<string, SocialCandidate>();
  const byName = new Map<string, SocialCandidate>();
  for (const c of list) {
    if (byKey.has(c.key)) continue;
    const named = !c.sources.includes("instagram");
    const twin = named ? byName.get(normName(c.name)) : undefined;
    if (twin && !twin.sources.some((s) => c.sources.includes(s))) {
      twin.sources.push(...c.sources);
      twin.links.push(...c.links);
      twin.email ??= c.email;
      twin.company ??= c.company;
      twin.role ??= c.role;
      byKey.set(c.key, twin);
      continue;
    }
    byKey.set(c.key, c);
    if (named && !byName.has(normName(c.name))) byName.set(normName(c.name), c);
  }
  return [...new Set(byKey.values())];
}

/** Every key a merged person answers to (one per source), for dismissals. */
export function candidateKeys(c: SocialCandidate): string[] {
  const keys = new Set<string>([c.key]);
  for (const l of c.links) keys.add(socialKey(l.platform, l.value));
  if (c.sources.includes("facebook"))
    keys.add(`facebook:name:${normName(c.name)}`);
  return [...keys];
}

/** What an existing contact is known by: profile keys, emails, names. */
export function existingIndex(
  contacts: {
    name: string;
    email: string | null;
    links: { platform: string; value: string }[];
  }[]
) {
  const keys = new Set<string>();
  const emails = new Set<string>();
  const names = new Set<string>();
  for (const c of contacts) {
    for (const l of c.links) keys.add(socialKey(l.platform, l.value));
    if (c.email) emails.add(c.email.trim().toLowerCase());
    names.add(normName(c.name));
  }
  return {
    /** Already in the list: same profile, same email, or same full name. */
    has(c: SocialCandidate): boolean {
      if (candidateKeys(c).some((k) => keys.has(k))) return true;
      if (c.email && emails.has(c.email.toLowerCase())) return true;
      // Instagram "names" are usernames: only a profile match counts.
      return (
        c.sources.some((s) => s !== "instagram") && names.has(normName(c.name))
      );
    },
  };
}
