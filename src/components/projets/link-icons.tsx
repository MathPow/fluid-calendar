import {
  Figma,
  Github,
  Globe,
  HardDrive,
  Link2,
  NotebookPen,
  Server,
  Sparkles,
  Trello,
} from "lucide-react";

import { linkKindLabel } from "@/lib/projets/meta";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Globe> = {
  figma: Figma,
  drive: HardDrive,
  website: Globe,
  claude: Sparkles,
  github: Github,
  trello: Trello,
  notion: NotebookPen,
  coolify: Server,
  other: Link2,
};

export function LinkKindIcon({
  kind,
  className,
}: {
  kind: string;
  className?: string;
}) {
  const Icon = ICONS[kind] ?? Link2;
  return <Icon className={cn("h-4 w-4", className)} />;
}

/** Pill that opens a project link in a new tab. `onInk` flips it for ink tiles. */
export function LinkPill({
  kind,
  label,
  url,
  onInk,
}: {
  kind: string;
  label?: string | null;
  url: string;
  onInk?: boolean;
}) {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    host = url;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className={cn(
        "inline-flex h-9 max-md:min-h-10 max-w-full items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition-colors",
        onInk
          ? "bg-background/10 text-background hover:bg-background hover:text-foreground"
          : "bg-secondary text-foreground hover:bg-foreground hover:text-background"
      )}
    >
      <LinkKindIcon kind={kind} className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label || linkKindLabel(kind)}</span>
      {!label && host && (
        <span className="hidden truncate opacity-60 sm:inline">· {host}</span>
      )}
    </a>
  );
}
