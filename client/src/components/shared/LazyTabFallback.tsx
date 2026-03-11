import { Loader2 } from "lucide-react";

/** Lightweight skeleton shown while a lazy-loaded tab chunk downloads. */
export function LazyTabFallback() {
  return (
    <div className="glass-panel flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      Loading tab…
    </div>
  );
}
