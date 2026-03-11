import { ReactNode } from "react";
import { RefreshControl } from "./RefreshControl";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
  children?: ReactNode;
}

export function PageHeader({ title, subtitle, onRefresh, isLoading, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {children}
        {onRefresh && <RefreshControl onRefresh={onRefresh} isLoading={isLoading} />}
      </div>
    </div>
  );
}
