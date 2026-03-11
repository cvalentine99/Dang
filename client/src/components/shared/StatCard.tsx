import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  colorClass?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  trendUp,
  colorClass = "text-primary",
  className,
}: StatCardProps) {
  return (
    <div className={cn("glass-card p-5 flex items-start gap-4", className)}>
      <div
        className={cn(
          "h-11 w-11 rounded-lg flex items-center justify-center shrink-0",
          "bg-primary/10 border border-primary/20"
        )}
      >
        <Icon className={cn("h-5 w-5", colorClass)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
          {label}
        </p>
        <p className="text-2xl font-display font-bold text-foreground mt-1 truncate">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        {trend && (
          <p
            className={cn(
              "text-xs mt-1 font-medium",
              trendUp ? "text-threat-low" : "text-threat-high"
            )}
          >
            {trend}
          </p>
        )}
      </div>
    </div>
  );
}
