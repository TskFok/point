import { Button } from "@point-quest/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationControlsProps = {
  disabled?: boolean;
  onPageChange: (page: number) => void;
  page: number;
  totalPages: number;
};

export function PaginationControls({
  disabled = false,
  onPageChange,
  page,
  totalPages,
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="分页" className="pagination">
      <Button
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
        variant="secondary"
      >
        <ChevronLeft aria-hidden="true" />
        上一页
      </Button>
      <span aria-live="polite">
        第 {page} / {totalPages} 页
      </span>
      <Button
        disabled={disabled || page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        variant="secondary"
      >
        下一页
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
}
