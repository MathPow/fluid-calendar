import {
  listNotesIn,
  moveNoteTo,
  noteExists,
  readNote,
  writeNoteAt,
} from "@/lib/notes/webdav";

/**
 * « Pense-bête »: the dashboard's little notes. Each one is a plain Markdown
 * note in its own vault folder (so it lives in Notes / Obsidian too), with a
 * small front matter naming its organisation by slug. Archiving moves it to
 * the folder's « Archives » subfolder, where it stays readable in Notes.
 */

export function stickyDir(): string {
  const dir = process.env.NOTES_STICKY_DIR || "/Pense-bête";
  return dir.startsWith("/") ? dir : `/${dir}`;
}

export const stickyArchiveDir = () => `${stickyDir()}/Archives`;

export interface StickyNote {
  path: string;
  text: string;
  /** Organisation slug from the front matter, if any. */
  organisation: string | null;
  created: string | null;
  lastModified: string | null;
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Split a note into its front-matter fields and body. */
export function parseSticky(raw: string) {
  const match = raw.match(FRONT_MATTER);
  const fields = new Map<string, string>();
  if (match) {
    for (const line of match[1].split(/\r?\n/)) {
      const kv = line.match(/^([\w-]+):\s*(.*)$/);
      if (kv) fields.set(kv[1], kv[2].replace(/^["']|["']$/g, "").trim());
    }
  }
  const body = (match ? raw.slice(match[0].length) : raw).trim();
  return { fields, body };
}

/** Rebuild a note, keeping front-matter keys it doesn't manage. */
export function formatSticky(
  fields: Map<string, string>,
  body: string
): string {
  const lines = [...fields]
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}: ${v}`);
  const head = lines.length ? `---\n${lines.join("\n")}\n---\n\n` : "";
  return `${head}${body.trim()}\n`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-07 1342 Appeler Tristan.md" — sortable and readable in Obsidian. */
function stickyFileName(text: string, now: Date): string {
  const words =
    text
      .split(/\r?\n/)
      .find((l) => l.trim())
      ?.replace(/^[#>*\-\s[\]x]+/i, "")
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50)
      .trim() || "Note";
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${stamp} ${words}.md`;
}

export async function listSticky(): Promise<StickyNote[]> {
  const entries = await listNotesIn(stickyDir());
  const notes = await Promise.all(
    entries.map(async (e) => {
      const { fields, body } = parseSticky(await readNote(e.path));
      return {
        path: e.path,
        text: body,
        organisation: fields.get("organisation") || null,
        created: fields.get("created") || e.lastModified,
        lastModified: e.lastModified,
      };
    })
  );
  const time = (s: string | null) => (s ? Date.parse(s) || 0 : 0);
  return notes.sort((a, b) => time(b.created) - time(a.created));
}

export async function createSticky(
  text: string,
  organisation: string | null
): Promise<string> {
  const now = new Date();
  const name = stickyFileName(text, now);
  let path = `${stickyDir()}/${name}`;
  for (let i = 2; await noteExists(path); i++) {
    path = `${stickyDir()}/${name.replace(/\.md$/, ` (${i}).md`)}`;
  }
  const fields = new Map<string, string>();
  if (organisation) fields.set("organisation", organisation);
  fields.set("created", now.toISOString());
  fields.set("tags", "pense-bete");
  await writeNoteAt(path, formatSticky(fields, text));
  return path;
}

/** Only notes of the Pense-bête folder itself can be changed from the box. */
export function isStickyPath(path: string): boolean {
  const dir = stickyDir();
  return (
    path.startsWith(`${dir}/`) &&
    !path.slice(dir.length + 1).includes("/") &&
    !path.includes("..")
  );
}

export async function updateSticky(
  path: string,
  patch: { text?: string; organisation?: string | null }
): Promise<void> {
  const { fields, body } = parseSticky(await readNote(path));
  if (patch.organisation !== undefined) {
    if (patch.organisation) fields.set("organisation", patch.organisation);
    else fields.delete("organisation");
  }
  await writeNoteAt(path, formatSticky(fields, patch.text ?? body));
}

export const archiveSticky = (path: string) =>
  moveNoteTo(path, stickyArchiveDir());
