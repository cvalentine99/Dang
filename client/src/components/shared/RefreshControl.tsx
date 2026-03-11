import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface RefreshControlProps {
  onRefresh: () => void;
  isLoading?: boolean;
  className?: string;
}

const INTERVALS = [
  { label: "Off", value: "0" },
  { label: "30s", value: "30" },
  { label: "1m", value: "60" },
  { label: "5m", value: "300" },
  { label: "15m", value: "900" },
];

export function RefreshControl({ onRefresh, isLoading, className }: RefreshControlProps) {
  const [interval, setInterval_] = useState("0");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearTimer();
    const seconds = parseInt(interval, 10);
    if (seconds > 0) {
      timerRef.current = setInterval(onRefresh, seconds * 1000);
    }
    return clearTimer;
  }, [interval, onRefresh, clearTimer]);

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <Select value={interval} onValueChange={setInterval_}>
        <SelectTrigger className="w-[90px] h-8 text-xs bg-secondary/50 border-border">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-popover border-border">
          {INTERVALS.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={isLoading}
        className="h-8 w-8 p-0 bg-transparent border-border hover:bg-accent"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );
}
