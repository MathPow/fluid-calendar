"use client";

import { useEffect, useState } from "react";

import { Check, ChevronDown, Cpu, Sparkles } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  ASSISTANT_MODELS,
  type AssistantModelId,
  type AssistantModelInfo,
  assistantModelInfo,
} from "@/lib/assistant/models";
import { cn } from "@/lib/utils";

import { useAssistantModel } from "@/store/assistantModel";

/** What the server can run: the API key, the Claude Code bridge. */
interface Availability {
  api: boolean;
  bridge: boolean;
}

let cached: Availability | null = null;

const isOff = (m: AssistantModelInfo, a: Availability | null) =>
  !!a && !!m.requires && !a[m.requires];

/**
 * The model the assistant answers with. A Claude model needs the server's API
 * key or the Claude Code bridge; without it it's greyed out and the chat falls
 * back to the first model that works (the local one at worst).
 */
export function useEffectiveModel(): {
  model: AssistantModelId;
  available: Availability | null;
} {
  const { model } = useAssistantModel();
  const [available, setAvailable] = useState<Availability | null>(cached);
  useEffect(() => {
    if (cached !== null) return;
    fetch("/api/assistant/chat", { cache: "no-store" })
      .then((r): Promise<{ claude?: boolean; bridge?: boolean }> =>
        r.ok ? r.json() : Promise.resolve({})
      )
      .then((d) => {
        cached = { api: !!d.claude, bridge: !!d.bridge };
        setAvailable(cached);
      })
      .catch(() => setAvailable({ api: false, bridge: false }));
  }, []);
  const usable = isOff(assistantModelInfo(model), available)
    ? (ASSISTANT_MODELS.find((m) => !isOff(m, available))?.id ?? "local")
    : model;
  return { model: usable, available };
}

/** Compact picker for the chat panel's header. */
export function ModelPicker({ disabled }: { disabled?: boolean }) {
  const { setModel } = useAssistantModel();
  const { model, available } = useEffectiveModel();
  const current = assistantModelInfo(model);
  const short = current.label.replace(/^Claude /, "");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-border/70 disabled:opacity-50"
          title="Modèle de l'assistant"
          aria-label={`Modèle : ${current.label}`}
        >
          {current.claude ? (
            <Sparkles className="h-3 w-3" />
          ) : (
            <Cpu className="h-3 w-3" />
          )}
          {short}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="z-[70] w-64 p-1.5"
      >
        <p className="etiquette px-2 pb-1.5 pt-1">Modèle</p>
        {ASSISTANT_MODELS.map((m) => {
          const off = isOff(m, available);
          const on = m.id === model;
          return (
            <DropdownMenuItem
              key={m.id}
              disabled={off}
              onSelect={() => setModel(m.id)}
              className={cn(
                "cursor-pointer items-start gap-2 rounded-xl py-2",
                on && "bg-tint-soft"
              )}
            >
              {m.claude ? (
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{m.label}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {off
                    ? m.requires === "bridge"
                      ? "Pont Claude Code non configuré sur le serveur"
                      : "Clé API Anthropic manquante sur le serveur"
                    : m.hint}
                </span>
              </span>
              {on && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
