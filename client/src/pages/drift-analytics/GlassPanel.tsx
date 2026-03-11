import { GLASS_BG, BORDER, PURPLE } from "./theme";

export function GlassPanel({
  children,
  className = "",
  title,
  icon: Icon,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border backdrop-blur-md ${className}`}
      style={{
        background: GLASS_BG,
        borderColor: BORDER,
      }}
    >
      {title && (
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4" style={{ color: PURPLE }} />}
            <h3 className="font-display text-sm font-semibold tracking-wide" style={{ color: "oklch(0.85 0.01 286)" }}>
              {title}
            </h3>
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
