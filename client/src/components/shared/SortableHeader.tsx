import { SortAsc, SortDesc, ArrowUpDown } from "lucide-react";

interface SortableHeaderProps {
  label: string;
  field: string;
  currentSort: string;
  onSort: (sort: string) => void;
  className?: string;
}

export function SortableHeader({ label, field, currentSort, onSort, className }: SortableHeaderProps) {
  const isActive = currentSort.replace(/^[+-]/, "") === field;
  const isAsc = currentSort === `+${field}`;

  const handleClick = () => {
    if (!isActive) onSort(`+${field}`);
    else if (isAsc) onSort(`-${field}`);
    else onSort("");
  };

  return (
    <th
      className={`text-left py-2 px-3 text-muted-foreground font-medium whitespace-nowrap cursor-pointer hover:text-foreground transition-colors select-none ${className ?? ""}`}
      onClick={handleClick}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          isAsc ? <SortAsc className="h-3 w-3 text-primary" /> : <SortDesc className="h-3 w-3 text-primary" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </th>
  );
}
