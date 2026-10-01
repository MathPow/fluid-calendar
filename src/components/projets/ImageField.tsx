"use client";

import { useRef, useState } from "react";

import { Camera, X } from "lucide-react";
import { toast } from "sonner";

import { useT } from "@/i18n/client";
import { readableTextOn } from "@/lib/projets/meta";
import { cn } from "@/lib/utils";

/**
 * Shrinks an image file to a square JPEG data URL (cover crop, `size` px).
 * Done in the browser so nothing big ever reaches the server or the DB.
 */
export async function fileToSquareDataUrl(
  file: File,
  size = 320
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

interface ImageFieldProps {
  value: string | null;
  onChange: (value: string | null) => void;
  /** Shown when there is no image. */
  fallback: React.ReactNode;
  /** Background colour of the fallback. */
  color?: string | null;
  shape?: "round" | "rounded";
  size?: number;
  label?: string;
}

/** Avatar / logo picker: click to choose a file, small × to remove. */
export function ImageField({
  value,
  onChange,
  fallback,
  color,
  shape = "round",
  size = 72,
  label,
}: ImageFieldProps) {
  const t = useT();
  const resolvedLabel = label ?? t("projects.imageField.photoLabel");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("projects.imageField.chooseError"));
      return;
    }
    setBusy(true);
    try {
      onChange(await fileToSquareDataUrl(file));
    } catch (e) {
      toast.error(t("projects.imageField.readError"), {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const radius = shape === "round" ? "rounded-full" : "rounded-2xl";

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={cn(
            "group relative flex items-center justify-center overflow-hidden transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            radius
          )}
          style={{
            width: size,
            height: size,
            backgroundColor: value ? undefined : (color ?? undefined),
            color: readableTextOn(color),
          }}
          title={
            value
              ? t("projects.imageField.titleChange")
              : t("projects.imageField.titleAdd")
          }
          disabled={busy}
        >
          {value ? (
            // Data URL or remote image; next/image can't optimize either.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[22px] font-extrabold">{fallback}</span>
          )}
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center bg-foreground/45 text-background opacity-0 transition-opacity group-hover:opacity-100",
              radius
            )}
          >
            <Camera className="h-5 w-5" />
          </span>
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-card text-muted-foreground shadow-float hover:text-foreground"
            aria-label={t("projects.imageField.removeAria")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="text-[13px] text-muted-foreground">
        <p className="font-medium text-foreground">{resolvedLabel}</p>
        <p>
          {busy
            ? t("projects.imageField.processing")
            : value
              ? t("projects.imageField.clickChange")
              : t("projects.imageField.clickAdd")}
        </p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </div>
  );
}

/** Round avatar showing the image, or initials on a colour. */
export function Avatar({
  image,
  fallback,
  color,
  className,
  shape = "round",
}: {
  image: string | null | undefined;
  fallback: string;
  color?: string | null;
  className?: string;
  shape?: "round" | "rounded";
}) {
  const radius = shape === "round" ? "rounded-full" : "rounded-2xl";
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        className={cn("shrink-0 object-cover", radius, className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center font-bold",
        radius,
        className
      )}
      style={{
        backgroundColor: color ?? undefined,
        color: readableTextOn(color),
      }}
      aria-hidden
    >
      {fallback}
    </span>
  );
}
