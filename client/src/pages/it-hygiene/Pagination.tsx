import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  total: number;
}

export function Pagination({ page, totalPages, onPageChange, total }: PaginationProps) {
  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/30">
      <p className="text-xs text-muted-foreground">
        Page {page + 1} of {totalPages} ({total} items)
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          className="h-7 bg-transparent border-border"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
          className="h-7 bg-transparent border-border"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
