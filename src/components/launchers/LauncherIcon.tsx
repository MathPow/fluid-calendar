import {
  AppWindow,
  Clipboard,
  Code2,
  Coffee,
  FolderOpen,
  GitBranch,
  Globe,
  Lock,
  MessageSquare,
  Music,
  Play,
  RefreshCw,
  Rocket,
  Terminal,
  Zap,
} from "lucide-react";

import type { LauncherIconId } from "@/lib/launchers";

export const LAUNCHER_ICON_COMPONENTS: Record<LauncherIconId, typeof Zap> = {
  zap: Zap,
  code: Code2,
  terminal: Terminal,
  globe: Globe,
  folder: FolderOpen,
  app: AppWindow,
  lock: Lock,
  git: GitBranch,
  rocket: Rocket,
  play: Play,
  refresh: RefreshCw,
  music: Music,
  coffee: Coffee,
  message: MessageSquare,
  clipboard: Clipboard,
};

/** A sensible icon for a command, when saving one as a launcher. */
export const ICON_FOR_ACTION: Record<string, LauncherIconId> = {
  open_url: "globe",
  open_path: "folder",
  open_code: "code",
  open_app: "app",
  notify: "message",
  clipboard: "clipboard",
  lock: "lock",
  shell: "terminal",
};

export function LauncherIcon({
  icon,
  className,
}: {
  icon: string;
  className?: string;
}) {
  const Icon = LAUNCHER_ICON_COMPONENTS[icon as LauncherIconId] ?? Zap;
  return <Icon className={className} />;
}
