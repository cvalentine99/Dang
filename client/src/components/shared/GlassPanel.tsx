import { cn } from "@/lib/utils";
import { forwardRef } from "react";

export const GlassPanel = forwardRef<HTMLDivElement, React.ComponentProps<"div"> & { hover?: boolean; glow?: boolean }>(
  ({ children, className, hover, glow, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "glass-panel p-4",
          hover && "glass-panel-hover",
          glow && "amethyst-glow",
          className
        )}
        {...rest}
      >
        {children}
      </div>
    );
  }
);
GlassPanel.displayName = "GlassPanel";

export function GlassCard({ children, className, hover = true }: React.ComponentProps<"div"> & { hover?: boolean }) {
  return (
    <div className={cn("glass-card p-4", !hover && "pointer-events-none", className)}>
      {children}
    </div>
  );
}
