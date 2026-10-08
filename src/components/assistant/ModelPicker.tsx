"use client";

import { useEffect, useState } from "react";

import { Check, ChevronDown, Cpu, Sparkles } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useT } from "@/i18n/client";
import {
  ASSISTANT_MODELS,
  type AssistantModelId,
  assistantModelInfo,
} from "@/lib/assistant/models";
import { cn } from "@/lib/utils";

import { useAssistantModel } from "@/store/assistantModel";

let claudeAvailable: boolean | null = null;

/**
 * The model the assistant answers with. Claude models need the server's API
 * key; without it they're shown greyed out and the chat runs locally.
 */
export function useEffectiveModel(): {
  model: AssistantModelId;
  claude: boolean | null;
} {
  const { model } = useAssistantModel();
  const [claude, setClaude] = useState<boolean | null>(claudeAvailable);
  useEffect(() => {
    if (claudeAvailable !== null) return;
    fetch("/api/assistant/chat", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { claude: false }))
      .then((d) => {
        claudeAvailable = !!d.claude;
        setClaude(claudeAvailable);
      })
      .catch(() => setClaude(false));
  }, []);
  const usable =
    claude === false && assistantModelInfo(model).claude ? "local" : model;
  return { model: usable, claude };
}

/** Compact picker for the chat panel's header. */
export function ModelPicker({ disabled }: { disabled?: boolean }) {
  const t = useT();
  const { setModel } = useAssistantModel();
  const { model, claude } = useEffectiveModel();
  const current = assistantModelInfo(model);
  const short = current.label.replace(/^Claude /, "");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-border/70 disabled:opacity-50"
          title={t("assistant.modelPicker.title")}
          aria-label={t("assistant.modelPicker.aria", { label: current.label })}
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
        <p className="etiquette px-2 pb-1.5 pt-1">
          {t("assistant.modelPicker.heading")}
        </p>
        {ASSISTANT_MODELS.map((m) => {
          const off = m.claude && claude === false;
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
                    ? t("assistant.modelPicker.missingKey")
                    : m.hintKey
                      ? t(m.hintKey)
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
