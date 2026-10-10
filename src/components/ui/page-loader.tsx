import { cn } from "@/lib/utils";

/**
 * The one page-loading state: a ring centred in the space the page will
 * fill. Used by the route-level loading screens and by pages waiting for
 * their first data, so every page loads the same way.
 */
export function PageLoader({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex h-full min-h-[50dvh] items-center justify-center", className)}
    >
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
      <span className="sr-only">Chargement…</span>
    </div>
  );
}
