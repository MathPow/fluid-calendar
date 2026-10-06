"use client";

import {
  AtSign,
  Dribbble,
  Facebook,
  Github,
  Globe,
  Instagram,
  Link2,
  Linkedin,
  MessageCircle,
  Music2,
  Plus,
  Twitch,
  Twitter,
  X,
  Youtube,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

import {
  SOCIAL_PLATFORMS,
  type SocialPlatform,
  detectPlatform,
  socialLabel,
  socialPlatform,
  socialUrl,
} from "@/lib/projets/meta";

const ICONS: Record<string, typeof Globe> = {
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  tiktok: Music2,
  x: Twitter,
  threads: AtSign,
  youtube: Youtube,
  github: Github,
  twitch: Twitch,
  behance: Dribbble,
  whatsapp: MessageCircle,
  website: Globe,
  other: Link2,
};

export function SocialIcon({ platform, className }: { platform: string; className?: string }) {
  const Icon = ICONS[platform] ?? Link2;
  return <Icon className={cn("h-4 w-4", className)} />;
}

export interface SocialLinkDraft {
  platform: SocialPlatform;
  value: string;
}

/** Editable list of a contact's profiles: platform + handle or URL per row. */
export function SocialLinksField({
  links,
  onChange,
}: {
  links: SocialLinkDraft[];
  onChange: (links: SocialLinkDraft[]) => void;
}) {
  const t = useT();
  const update = (i: number, patch: Partial<SocialLinkDraft>) =>
    onChange(links.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  // Suggest the first platform not used yet.
  const next = (SOCIAL_PLATFORMS.find((p) => !links.some((l) => l.platform === p.id))?.id ??
    "other") as SocialPlatform;

  return (
    <div className="space-y-2">
      {links.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select value={l.platform} onValueChange={(v) => update(i, { platform: v as SocialPlatform })}>
            <SelectTrigger className="w-[150px] shrink-0">
              <div className="flex min-w-0 items-center gap-2">
                <SocialIcon platform={l.platform} className="h-3.5 w-3.5 shrink-0" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              {SOCIAL_PLATFORMS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={l.value}
            onChange={(e) => {
              // A pasted profile link picks its platform.
              const platform = detectPlatform(e.target.value);
              update(i, { value: e.target.value, ...(platform ? { platform } : {}) });
            }}
            placeholder={socialPlatform(l.platform).placeholder}
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("projects.socialLinks.removeAria")}
            onClick={() => onChange(links.filter((_, j) => j !== i))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onChange([...links, { platform: next, value: "" }])}
      >
        <Plus /> {t("projects.socialLinks.add")}
      </Button>
    </div>
  );
}

/** Round icon buttons opening each profile, for a contact tile. */
export function SocialLinkButtons({
  links,
  className,
}: {
  links: { id?: string; platform: string; value: string }[];
  className?: string;
}) {
  if (!links.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {links.map((l, i) => (
        <a
          key={l.id ?? i}
          href={socialUrl(l.platform, l.value)}
          target="_blank"
          rel="noopener noreferrer"
          title={`${socialPlatform(l.platform).label} · ${socialLabel(l.value)}`}
          onClick={(e) => e.stopPropagation()}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-foreground hover:text-background"
        >
          <SocialIcon platform={l.platform} className="h-3.5 w-3.5" />
        </a>
      ))}
    </div>
  );
}
