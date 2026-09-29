"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

export type StoreMedia = {
  id: string;
  name: string;
  caption: string | null;
  capsule: boolean;
  inGallery: boolean;
};

export type StoreFact = { label: string; value: string; href?: string };

const mediaSrc = (id: string) => `/api/project-media/${id}`;

/**
 * A project's "store page", laid out like a Steam product page: the big
 * viewer and its thumbnail strip on the left, the capsule, blurb, facts and
 * tags on the right, the long "about" text underneath.
 */
export function ProjectStorePage({
  media,
  description,
  facts,
  tags,
  about,
}: {
  media: StoreMedia[];
  description: string | null;
  facts: StoreFact[];
  tags: string[];
  about: string | null;
}) {
  const gallery = media.filter((m) => m.inGallery && !m.capsule);
  const capsule = media.find((m) => m.capsule) ?? gallery[0];
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const current = gallery[index];

  const go = useCallback(
    (delta: number) =>
      gallery.length > 0 &&
      setIndex((i) => (i + delta + gallery.length) % gallery.length),
    [gallery.length]
  );

  // Keep the active thumbnail in view as the viewer moves.
  useEffect(() => {
    const strip = stripRef.current;
    const thumb = strip?.children[index] as HTMLElement | undefined;
    if (!strip || !thumb) return;
    strip.scrollTo({
      left: thumb.offsetLeft - strip.clientWidth / 2 + thumb.clientWidth / 2,
      behavior: "smooth",
    });
  }, [index]);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomed(false);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed, go]);

  // ![caption](media:<name>) in the about text points at a stored image.
  const byName = new Map(media.map((m) => [m.name, m.id]));
  const urlTransform = (url: string) => {
    if (url.startsWith("media:")) {
      const id = byName.get(url.slice(6));
      return id ? mediaSrc(id) : "";
    }
    return defaultUrlTransform(url);
  };

  return (
    <>
      <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ------------------------------------------------ Viewer + strip */}
        <div className="tile-ink min-w-0 p-3 md:p-4">
          {current ? (
            <div className="group relative overflow-hidden rounded-2xl bg-black">
              <button
                type="button"
                onClick={() => setZoomed(true)}
                className="block w-full cursor-zoom-in"
                aria-label="Agrandir"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={current.id}
                  src={mediaSrc(current.id)}
                  alt={current.caption ?? current.name}
                  className="aspect-[16/10] w-full animate-in object-contain fade-in duration-300"
                />
              </button>
              {gallery.length > 1 && (
                <>
                  <ViewerArrow side="left" onClick={() => go(-1)} />
                  <ViewerArrow side="right" onClick={() => go(1)} />
                </>
              )}
              <span className="pointer-events-none absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Expand className="h-4 w-4" />
              </span>
              {current.caption && (
                <p className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-gradient-to-t sm:block from-black/70 to-transparent px-4 pb-3 pt-8 text-[13px] font-medium text-white">
                  {current.caption}
                </p>
              )}
            </div>
          ) : (
            <div className="flex aspect-[16/10] items-center justify-center rounded-2xl text-background/60">
              Pas encore d&apos;images.
            </div>
          )}

          {gallery.length > 1 && (
            <div
              ref={stripRef}
              className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
            >
              {gallery.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={cn(
                    "w-28 shrink-0 overflow-hidden rounded-lg border-2 transition-all md:w-36",
                    i === index
                      ? "border-background opacity-100"
                      : "border-transparent opacity-50 hover:opacity-90"
                  )}
                  aria-label={m.caption ?? m.name}
                  aria-current={i === index}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaSrc(m.id)}
                    alt=""
                    loading="lazy"
                    className="aspect-[16/10] w-full object-cover object-top"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ------------------------------------------ Capsule + facts */}
        <aside className="tile flex flex-col overflow-hidden">
          {capsule && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaSrc(capsule.id)}
              alt=""
              className="aspect-[460/215] w-full object-cover"
            />
          )}
          <div className="flex flex-1 flex-col gap-5 p-6">
            {description && (
              <p className="text-[15px] leading-relaxed text-foreground/90">
                {description}
              </p>
            )}
            {facts.length > 0 && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
                {facts.map((f) => (
                  <div key={f.label} className="contents">
                    <dt className="etiquette self-center">{f.label}</dt>
                    <dd className="min-w-0 truncate font-medium">
                      {f.href ? (
                        <a
                          href={f.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-border underline-offset-4 hover:decoration-foreground"
                        >
                          {f.value}
                        </a>
                      ) : (
                        f.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {tags.length > 0 && (
              <div>
                <p className="etiquette">Tags</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <li
                      key={t}
                      className="rounded-full bg-secondary px-3 py-1 text-[12px] font-medium"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </section>

      {/* ------------------------------------------------------ About */}
      {about && (
        <section className="tile mt-5 p-7 md:p-10">
          <p className="etiquette">À propos de ce projet</p>
          <div
            className={cn(
              "mt-5 max-w-3xl text-[15px] leading-7 text-foreground/90",
              "[&_h2]:mb-3 [&_h2]:mt-9 [&_h2]:text-[22px] [&_h2]:font-bold [&_h2]:tracking-title first:[&_h2]:mt-0",
              "[&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-[17px] [&_h3]:font-semibold",
              "[&_p]:mb-4 [&_strong]:font-semibold [&_a]:underline [&_a]:underline-offset-4",
              "[&_ul]:mb-4 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:mb-4 [&_ol]:ml-5 [&_ol]:list-decimal [&_li]:mb-1",
              "[&_img]:my-6 [&_img]:w-full [&_img]:rounded-2xl [&_img]:border [&_img]:border-border",
              "[&_code]:rounded [&_code]:bg-secondary [&_code]:px-1.5 [&_code]:text-[13px]"
            )}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              urlTransform={urlTransform}
            >
              {about}
            </ReactMarkdown>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------- Lightbox */}
      {zoomed && current && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setZoomed(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaSrc(current.id)}
            alt={current.caption ?? current.name}
            className="max-h-[85vh] max-w-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="text-[13px] text-white/80">
            {current.caption ?? current.name} · {index + 1}/{gallery.length}
          </p>
          <button
            type="button"
            onClick={() => setZoomed(false)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
          {gallery.length > 1 && (
            <>
              <ViewerArrow side="left" onClick={() => go(-1)} />
              <ViewerArrow side="right" onClick={() => go(1)} />
            </>
          )}
        </div>
      )}
    </>
  );
}

function ViewerArrow({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "absolute top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70",
        side === "left" ? "left-3" : "right-3"
      )}
      aria-label={side === "left" ? "Image précédente" : "Image suivante"}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
