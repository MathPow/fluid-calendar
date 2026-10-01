"use client";

import { useEffect, useState } from "react";

import { Check, Pipette } from "lucide-react";

import { Input } from "@/components/ui/input";

import { useT } from "@/i18n/client";
import { PROJECT_COLORS, isHexColor, readableTextOn } from "@/lib/projets/meta";
import { cn } from "@/lib/utils";

/**
 * The palette swatches plus a custom colour: a native picker and a hex field,
 * for an exact brand colour (a company's logo).
 */
export function ColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const t = useT();
  const inPalette = PROJECT_COLORS.some((c) => c.hex === value.toLowerCase());
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = (raw: string) => {
    let v = raw.trim();
    if (!v.startsWith("#")) v = `#${v}`;
    if (/^#[0-9a-f]{3}$/i.test(v))
      v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    if (isHexColor(v)) onChange(v.toLowerCase());
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2.5">
        {PROJECT_COLORS.map((c) => {
          const active = value.toLowerCase() === c.hex;
          return (
            <button
              key={c.hex}
              type="button"
              title={c.name}
              aria-label={c.name}
              onClick={() => onChange(c.hex)}
              className={cn(
                "flex h-11 w-14 items-center justify-center rounded-[14px] border-2 transition-transform hover:scale-105",
                active ? "border-foreground" : "border-transparent"
              )}
              style={{ backgroundColor: c.hex }}
              aria-pressed={active}
            >
              {active && (
                <Check className="h-4 w-4 text-[#19181c]" strokeWidth={3} />
              )}
            </button>
          );
        })}
        {/* Custom: the swatch opens the native colour picker. */}
        <label
          title={t("projects.colorField.customTitle")}
          className={cn(
            "relative flex h-11 w-14 cursor-pointer items-center justify-center rounded-[14px] border-2 transition-transform hover:scale-105",
            !inPalette ? "border-foreground" : "border-dashed border-border"
          )}
          style={
            !inPalette
              ? { backgroundColor: value, color: readableTextOn(value) }
              : undefined
          }
        >
          {!inPalette ? (
            <Check className="h-4 w-4" strokeWidth={3} />
          ) : (
            <Pipette className="h-4 w-4 text-muted-foreground" />
          )}
          <input
            type="color"
            value={isHexColor(value) ? value : "#000000"}
            onChange={(e) => onChange(e.target.value.toLowerCase())}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={t("projects.colorField.customPicker")}
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="h-9 w-9 shrink-0 rounded-xl border border-border"
          style={{ backgroundColor: isHexColor(value) ? value : undefined }}
        />
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            commit(e.target.value);
          }}
          onBlur={() => setDraft(value)}
          placeholder={t("projects.colorField.hexPlaceholder")}
          spellCheck={false}
          className="h-9 w-32 font-mono text-[14px] uppercase"
          aria-label={t("projects.colorField.hexAria")}
        />
        <span className="text-[12px] text-muted-foreground">
          {t("projects.colorField.hint")}
        </span>
      </div>
    </div>
  );
}
