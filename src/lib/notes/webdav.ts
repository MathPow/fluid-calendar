import { createClient, type FileStat, type WebDAVClient } from "webdav";

import { logger } from "@/lib/logger";

const LOG_SOURCE = "notes-webdav";

/**
 * Read-only WebDAV access to an Obsidian vault, used by the Notes tab.
 *
 * Configured via env:
 *   OBSIDIAN_WEBDAV_URL, OBSIDIAN_WEBDAV_USERNAME, OBSIDIAN_WEBDAV_PASSWORD
 */

export interface NoteEntry {
  /** Vault-relative path, always starting with "/" (e.g. "/Daily/2026-06-24.md"). */
  path: string;
  /** Display name (file or folder name). */
  name: string;
  type: "file" | "directory";
  size: number;
  lastModified: string | null;
}

export function isNotesConfigured(): boolean {
  return Boolean(
    process.env.OBSIDIAN_WEBDAV_URL &&
      process.env.OBSIDIAN_WEBDAV_USERNAME &&
      process.env.OBSIDIAN_WEBDAV_PASSWORD
  );
}

let cachedClient: WebDAVClient | null = null;

function getClient(): WebDAVClient {
  if (cachedClient) return cachedClient;
  const url = process.env.OBSIDIAN_WEBDAV_URL;
  const username = process.env.OBSIDIAN_WEBDAV_USERNAME;
  const password = process.env.OBSIDIAN_WEBDAV_PASSWORD;
  if (!url || !username || !password) {
    throw new Error("Obsidian WebDAV is not configured");
  }
  cachedClient = createClient(url, { username, password });
  return cachedClient;
}

/** Extensions we treat as readable text notes. */
const TEXT_EXTENSIONS = [".md", ".markdown", ".txt", ".canvas"];

function isTextNote(name: string): boolean {
  const lower = name.toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Reject path traversal and absolute-host escapes. */
function assertSafePath(path: string): void {
  if (path.includes("..") || path.includes("\0")) {
    throw new Error("Invalid note path");
  }
}

/**
 * Deep-list the whole vault, returning folders plus text notes only
 * (skips attachments/images). Sorted folders-first then alphabetical.
 */
export async function listVault(): Promise<NoteEntry[]> {
  const client = getClient();
  try {
    const items = (await client.getDirectoryContents("/", {
      deep: true,
    })) as FileStat[];

    const entries: NoteEntry[] = items
      .filter((item) => {
        if (item.type === "directory") return true;
        return isTextNote(item.basename);
      })
      // Hide Obsidian's internal config folder
      .filter((item) => !item.filename.includes("/.obsidian"))
      .map((item) => ({
        path: item.filename.startsWith("/")
          ? item.filename
          : `/${item.filename}`,
        name: item.basename,
        type: item.type === "directory" ? "directory" : "file",
        size: item.size ?? 0,
        lastModified: item.lastmod ?? null,
      }));

    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.path.localeCompare(b.path);
    });

    return entries;
  } catch (error) {
    logger.error(
      "Failed to list Obsidian vault",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    throw error;
  }
}

/** Read a single note's raw text content. */
export async function readNote(path: string): Promise<string> {
  assertSafePath(path);
  const client = getClient();
  const content = await client.getFileContents(path, { format: "text" });
  return typeof content === "string" ? content : content.toString();
}
