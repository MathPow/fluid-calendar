"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ChevronRight,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { DropZones } from "@/components/notes/DropZones";
import { cn } from "@/lib/utils";

interface NoteEntry {
  path: string;
  name: string;
  type: "file" | "directory";
  size: number;
  lastModified: string | null;
}

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children: TreeNode[];
}

/** Build a nested tree from the flat, vault-relative entry list. */
function buildTree(entries: NoteEntry[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "/", type: "directory", children: [] };

  const ensureDir = (parts: string[]): TreeNode => {
    let node = root;
    let acc = "";
    for (const part of parts) {
      acc += `/${part}`;
      let child = node.children.find(
        (c) => c.type === "directory" && c.name === part
      );
      if (!child) {
        child = { name: part, path: acc, type: "directory", children: [] };
        node.children.push(child);
      }
      node = child;
    }
    return node;
  };

  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    if (entry.type === "directory") {
      ensureDir(parts);
    } else {
      const parent = ensureDir(parts.slice(0, -1));
      parent.children.push({
        name: parts[parts.length - 1],
        path: entry.path,
        type: "file",
        children: [],
      });
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(root.children);

  return root.children;
}

const prettyName = (name: string) => name.replace(/\.(md|markdown|txt|canvas)$/i, "");

/**
 * Deep-link that opens a note in the desktop/mobile Obsidian app via its URI
 * scheme. When a vault name is configured (server env OBSIDIAN_VAULT_NAME), the
 * vault's own folder is the first path segment in WebDAV terms, so we strip it —
 * inside the vault the file is relative to its root. Without a vault name,
 * Obsidian opens the file in the currently-open vault.
 */
const obsidianHref = (path: string, vault: string | null) => {
  let file = path.replace(/^\//, "");
  if (vault && file.startsWith(`${vault}/`)) file = file.slice(vault.length + 1);
  // Obsidian addresses markdown notes by path WITHOUT the extension.
  file = file.replace(/\.(md|markdown)$/i, "");
  // Obsidian wants literal "/" path separators — encode each segment (so spaces
  // and accents are escaped) but keep the slashes raw.
  const encodedFile = file.split("/").map(encodeURIComponent).join("/");
  const query = [];
  if (vault) query.push(`vault=${encodeURIComponent(vault)}`);
  query.push(`file=${encodedFile}`);
  return `obsidian://open?${query.join("&")}`;
};

const markdownComponents = {
  h1: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="mb-3 mt-6 text-2xl font-semibold tracking-tight" {...p} />
  ),
  h2: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="mb-2 mt-6 text-xl font-semibold tracking-tight" {...p} />
  ),
  h3: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="mb-2 mt-5 text-lg font-semibold" {...p} />
  ),
  p: (p: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-3 leading-7 text-foreground/90" {...p} />
  ),
  ul: (p: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="mb-3 ml-5 list-disc space-y-1 text-foreground/90" {...p} />
  ),
  ol: (p: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="mb-3 ml-5 list-decimal space-y-1 text-foreground/90" {...p} />
  ),
  li: (p: React.HTMLAttributes<HTMLLIElement>) => <li className="leading-7" {...p} />,
  a: (p: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="text-primary underline-offset-2 hover:underline" {...p} />
  ),
  blockquote: (p: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="my-4 border-l-2 border-primary/50 pl-4 italic text-muted-foreground"
      {...p}
    />
  ),
  code: ({
    className,
    ...rest
  }: React.HTMLAttributes<HTMLElement>) => {
    const isBlock = className?.includes("language-");
    return isBlock ? (
      <code className={cn("font-mono text-sm", className)} {...rest} />
    ) : (
      <code
        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
        {...rest}
      />
    );
  },
  pre: (p: React.HTMLAttributes<HTMLPreElement>) => (
    <pre
      className="mb-4 overflow-x-auto rounded-xl border border-border bg-muted/60 p-4 text-sm"
      {...p}
    />
  ),
  hr: () => <hr className="my-6 border-border" />,
  table: (p: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...p} />
    </div>
  ),
  th: (p: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th className="border border-border bg-muted/50 px-3 py-1.5 text-left font-medium" {...p} />
  ),
  td: (p: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td className="border border-border px-3 py-1.5" {...p} />
  ),
};

function TreeView({
  nodes,
  depth,
  selectedPath,
  expanded,
  onToggle,
  onSelect,
}: {
  nodes: TreeNode[];
  depth: number;
  selectedPath: string | null;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  return (
    <ul>
      {nodes.map((node) => {
        const isOpen = expanded.has(node.path);
        if (node.type === "directory") {
          return (
            <li key={node.path}>
              <button
                type="button"
                onClick={() => onToggle(node.path)}
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                style={{ paddingLeft: depth * 12 + 8 }}
              >
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform",
                    isOpen && "rotate-90"
                  )}
                />
                {isOpen ? (
                  <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{node.name}</span>
              </button>
              {isOpen && node.children.length > 0 && (
                <TreeView
                  nodes={node.children}
                  depth={depth + 1}
                  selectedPath={selectedPath}
                  expanded={expanded}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              )}
            </li>
          );
        }
        return (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => onSelect(node.path)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm",
                selectedPath === node.path
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
              )}
              style={{ paddingLeft: depth * 12 + 26 }}
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{prettyName(node.name)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function NotesExplorer() {
  const [entries, setEntries] = useState<NoteEntry[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loadingTree, setLoadingTree] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [loadingNote, setLoadingNote] = useState(false);
  const [filter, setFilter] = useState("");
  const [vault, setVault] = useState<string | null>(null);

  const loadTree = async () => {
    setLoadingTree(true);
    setTreeError(null);
    try {
      const res = await fetch("/api/notes");
      if (!res.ok) throw new Error("Failed to load notes");
      const data = await res.json();
      setConfigured(data.configured);
      setEntries(data.entries ?? []);
      setVault(data.vault ?? null);
    } catch {
      setTreeError("Couldn't reach the Obsidian vault.");
    } finally {
      setLoadingTree(false);
    }
  };

  useEffect(() => {
    loadTree();
  }, []);

  // Default the view to the "Main" folder so notes start there, not at the
  // cluttered vault root. Only seeds the initial expansion (won't fight the user).
  const [seededDefault, setSeededDefault] = useState(false);
  useEffect(() => {
    if (seededDefault || entries.length === 0) return;
    const main = entries.find(
      (e) => e.type === "directory" && (e.path === "/Main" || e.name === "Main")
    );
    if (main) setExpanded((prev) => (prev.size === 0 ? new Set([main.path]) : prev));
    setSeededDefault(true);
  }, [entries, seededDefault]);

  const selectNote = useCallback(
    async (path: string, opts?: { fromUrl?: boolean }) => {
      setSelectedPath(path);
      // Reflect the open note in the URL (/notes?path=…) so a refresh or a
      // shared/bookmarked link reopens the same note.
      if (!opts?.fromUrl && typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        params.set("path", path);
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}?${params.toString()}`
        );
      }
      setLoadingNote(true);
      try {
        const res = await fetch(`/api/notes/file?path=${encodeURIComponent(path)}`);
        if (!res.ok) throw new Error("Failed to read note");
        const data = await res.json();
        setContent(data.content ?? "");
      } catch {
        setContent("> Failed to load this note.");
      } finally {
        setLoadingNote(false);
      }
    },
    []
  );

  // Restore the note from the URL on first load (refresh / shared link).
  const [restoredFromUrl, setRestoredFromUrl] = useState(false);
  useEffect(() => {
    if (restoredFromUrl || entries.length === 0) return;
    setRestoredFromUrl(true);
    const param = new URLSearchParams(window.location.search).get("path");
    if (!param || !entries.some((e) => e.type === "file" && e.path === param)) {
      return;
    }
    // Expand the ancestor folders so the note is revealed in the tree.
    const parts = param.split("/").filter(Boolean);
    const dirs: string[] = [];
    let cur = "";
    for (let i = 0; i < parts.length - 1; i++) {
      cur += `/${parts[i]}`;
      dirs.push(cur);
    }
    setExpanded((prev) => new Set([...prev, ...dirs]));
    selectNote(param, { fromUrl: true });
  }, [entries, restoredFromUrl, selectNote]);

  // Deep-link support: /notes?path=/Foo/bar.md (from global search) opens that
  // note once and expands its folders. One-shot so it won't fight the user.
  const [openedDeepLink, setOpenedDeepLink] = useState(false);
  useEffect(() => {
    if (openedDeepLink || entries.length === 0) return;
    if (typeof window === "undefined") return;
    const target = new URLSearchParams(window.location.search).get("path");
    if (!target) return;
    if (!entries.some((e) => e.type === "file" && e.path === target)) return;

    const parts = target.split("/").filter(Boolean);
    const dirs: string[] = [];
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc += `/${parts[i]}`;
      dirs.push(acc);
    }
    setExpanded((prev) => new Set([...prev, ...dirs]));
    selectNote(target);
    setOpenedDeepLink(true);
    // selectNote is stable enough for this one-shot deep-link open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, openedDeepLink]);

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const filteredEntries = useMemo(() => {
    if (!filter.trim()) return entries;
    const q = filter.toLowerCase();
    // Keep matching files and any ancestor directories of a match.
    const matchingDirs = new Set<string>();
    const files = entries.filter((e) => e.type === "file");
    const matches = files.filter((e) => e.name.toLowerCase().includes(q));
    for (const m of matches) {
      const parts = m.path.split("/").filter(Boolean);
      let acc = "";
      for (let i = 0; i < parts.length - 1; i++) {
        acc += `/${parts[i]}`;
        matchingDirs.add(acc);
      }
    }
    return entries.filter(
      (e) =>
        (e.type === "file" && e.name.toLowerCase().includes(q)) ||
        (e.type === "directory" && matchingDirs.has(e.path))
    );
  }, [entries, filter]);

  // When filtering, auto-expand all surviving directories.
  const tree = useMemo(() => buildTree(filteredEntries), [filteredEntries]);
  const effectiveExpanded = filter.trim()
    ? new Set(filteredEntries.filter((e) => e.type === "directory").map((e) => e.path))
    : expanded;

  const fileCount = entries.filter((e) => e.type === "file").length;

  return (
    <div className="flex h-full">
      {/* Tree pane */}
      <div className="flex w-72 flex-none flex-col border-r border-border bg-card">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Notes</h2>
            <p className="text-xs text-muted-foreground">{fileCount} notes</p>
          </div>
          <button
            type="button"
            onClick={loadTree}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", loadingTree && "animate-spin")} />
          </button>
        </div>

        <div className="px-3 pb-2">
          <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter notes…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {loadingTree ? (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : treeError ? (
            <p className="px-2 py-3 text-sm text-destructive">{treeError}</p>
          ) : tree.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              No notes found.
            </p>
          ) : (
            <TreeView
              nodes={tree}
              depth={0}
              selectedPath={selectedPath}
              expanded={effectiveExpanded}
              onToggle={toggle}
              onSelect={selectNote}
            />
          )}
        </div>
      </div>

      {/* Viewer pane */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {!configured ? (
          <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center p-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FileText className="h-7 w-7" />
            </div>
            <h1 className="mt-4 text-xl font-semibold">Connect your vault</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Set <code className="rounded bg-muted px-1">OBSIDIAN_WEBDAV_URL</code>,{" "}
              <code className="rounded bg-muted px-1">…_USERNAME</code> and{" "}
              <code className="rounded bg-muted px-1">…_PASSWORD</code> to browse
              your Obsidian notes here.
            </p>
          </div>
        ) : !selectedPath ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 p-6 text-center">
            <div className="text-muted-foreground">
              <FileText className="mx-auto h-10 w-10 opacity-40" />
              <p className="mt-3 text-sm">Select a note to read it.</p>
            </div>
            <DropZones onSaved={loadTree} />
          </div>
        ) : (
          <article className="mx-auto max-w-3xl px-8 py-8">
            <div className="mb-1 text-xs text-muted-foreground">
              {selectedPath.replace(/^\//, "")}
            </div>
            <div className="mb-6 flex items-start justify-between gap-4">
              <h1 className="text-2xl font-bold tracking-tight">
                {prettyName(selectedPath.split("/").pop() ?? "")}
              </h1>
              <a
                href={obsidianHref(selectedPath, vault)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                title="Open this note in the Obsidian app"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in Obsidian
              </a>
            </div>
            {loadingNote ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading note…
              </div>
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {content}
              </ReactMarkdown>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
