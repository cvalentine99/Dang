import { cn } from "@/lib/utils";

type ThreatLevel = "critical" | "high" | "medium" | "low" | "info" | "safe";

const levelConfig: Record<ThreatLevel, { bg: string; text: string; label: string }> = {
  critical: { bg: "bg-threat-critical", text: "threat-critical", label: "Critical" },
  high: { bg: "bg-threat-high", text: "threat-high", label: "High" },
  medium: { bg: "bg-threat-medium", text: "threat-medium", label: "Medium" },
  low: { bg: "bg-threat-low", text: "threat-low", label: "Low" },
  info: { bg: "bg-threat-info", text: "threat-info", label: "Info" },
  safe: { bg: "bg-threat-low", text: "threat-low", label: "Safe" },
};

interface ThreatBadgeProps {
  level: ThreatLevel;
  className?: string;
  showDot?: boolean;
}

export function ThreatBadge({ level, className, showDot = true }: ThreatBadgeProps) {
  const config = levelConfig[level] ?? levelConfig.info;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border",
        config.bg,
        config.text,
        className
      )}
    >
      {showDot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", {
            "bg-[oklch(0.637_0.237_25.331)]": level === "critical",
            "bg-[oklch(0.705_0.191_22.216)]": level === "high",
            "bg-[oklch(0.795_0.184_86.047)]": level === "medium",
            "bg-[oklch(0.765_0.177_163.223)]": level === "low" || level === "safe",
            "bg-[oklch(0.789_0.154_211.53)]": level === "info",
          })}
        />
      )}
      {config.label}
    </span>
  );
}

export function threatLevelFromNumber(level: number): ThreatLevel {
  if (level >= 12) return "critical";
  if (level >= 8) return "high";
  if (level >= 4) return "medium";
  if (level >= 1) return "low";
  return "info";
}
