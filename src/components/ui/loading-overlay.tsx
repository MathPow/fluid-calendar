import { LoadingSpinner } from "./loading-spinner";

export function LoadingOverlay() {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <LoadingSpinner className="text-foreground" />
    </div>
  );
}
