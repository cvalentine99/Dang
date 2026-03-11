import { cn } from "@/lib/utils";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ── Loading State ─────────────────────────────────────────────────────────── */
interface IndexerLoadingStateProps {
  message?: string;
  className?: string;
}

export function IndexerLoadingState({
  message = "Fetching data from indexer…",
  className,
}: IndexerLoadingStateProps) {
  return (
    <div
      className={cn(
        "glass-panel flex flex-col items-center justify-center py-16 gap-4",
        className
      )}
    >
      <Loader2 className="h-8 w-8 text-primary animate-spin" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

/* ── Error State ───────────────────────────────────────────────────────────── */
interface IndexerErrorStateProps {
  message?: string;
  detail?: string;
  onRetry?: () => void;
  className?: string;
}

export function IndexerErrorState({
  message = "Failed to fetch data from indexer",
  detail,
  onRetry,
  className,
}: IndexerErrorStateProps) {
  return (
    <div
      className={cn(
        "glass-panel flex flex-col items-center justify-center py-12 gap-4 border-threat-critical/20",
        className
      )}
    >
      <div className="h-12 w-12 rounded-full bg-threat-critical/10 border border-threat-critical/20 flex items-center justify-center">
        <AlertCircle className="h-6 w-6 text-threat-critical" />
      </div>
      <div className="text-center max-w-md">
        <p className="text-sm font-medium text-foreground">{message}</p>
        {detail && (
          <p className="text-xs text-muted-foreground mt-1 font-mono break-all">
            {detail}
          </p>
        )}
      </div>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-2 text-xs bg-transparent border-white/10 text-slate-300 hover:bg-white/10"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Retry
        </Button>
      )}
    </div>
  );
}

/* ── Stat Card Skeleton ────────────────────────────────────────────────────── */
interface StatCardSkeletonProps {
  count?: number;
  className?: string;
}

export function StatCardSkeleton({ count = 5, className }: StatCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn("glass-card p-5 flex items-start gap-4 animate-pulse", className)}
        >
          <div className="h-11 w-11 rounded-lg bg-primary/5 border border-primary/10 shrink-0" />
          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="h-3 w-16 rounded bg-white/5" />
            <div className="h-7 w-12 rounded bg-white/8" />
          </div>
        </div>
      ))}
    </>
  );
}
