"use client";

import { useEffect, useRef } from "react";

import { create } from "zustand";

/**
 * In-app deep links (`/email?account=…&uid=…`, `/tasks?task=…`,
 * `/calendar?date=…`) opened from the assistant or pasted in the address bar.
 *
 * Pages here read `window.location` instead of `useSearchParams` (which would
 * force a Suspense boundary and bail them out of prerender), so a client-side
 * navigation to the page you're already on wouldn't re-run their mount effect.
 * {@link openDeepLink} also drops the link in this store, and
 * {@link useDeepLink} picks it up both on mount and while the page is open.
 */
interface DeepLinkStore {
  /** The last in-app URL opened, until the page it targets consumes it. */
  pending: string | null;
  nonce: number;
  push: (url: string) => void;
  clear: () => void;
}

export const useDeepLinkStore = create<DeepLinkStore>((set) => ({
  pending: null,
  nonce: 0,
  push: (url) => set((s) => ({ pending: url, nonce: s.nonce + 1 })),
  clear: () => set({ pending: null }),
}));

/** Record `url` for the target page, then navigate with `navigate`. */
export function openDeepLink(url: string, navigate: (url: string) => void) {
  useDeepLinkStore.getState().push(url);
  navigate(url);
}

const pathOf = (url: string) => new URL(url, "http://x").pathname;
const paramsOf = (url: string) => new URL(url, "http://x").searchParams;

/**
 * Call `handler` with the query params of a deep link aimed at `route`:
 * once on mount (from a pending in-app link, else the address bar), then for
 * every later in-app link to the same route. Handlers ignore params they
 * don't recognise, so a plain visit is harmless.
 */
export function useDeepLink(
  route: string,
  handler: (params: URLSearchParams) => void
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const { pending, clear } = useDeepLinkStore.getState();
    if (pending && pathOf(pending) === route) {
      clear();
      handlerRef.current(paramsOf(pending));
    } else {
      handlerRef.current(new URLSearchParams(window.location.search));
    }

    return useDeepLinkStore.subscribe((s, prev) => {
      if (s.nonce === prev.nonce || !s.pending) return;
      if (pathOf(s.pending) !== route) return;
      const url = s.pending;
      useDeepLinkStore.getState().clear();
      handlerRef.current(paramsOf(url));
    });
  }, [route]);
}
