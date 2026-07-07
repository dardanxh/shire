import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface PaginationLabels {
  rowsPerPage: string;
  pageOf: string; // e.g. "Page {{page}} of {{count}}"
  previous: string;
  next: string;
}

/**
 * Presentational pager. State (page/size) lives in URL search params on the
 * consuming route; this component just renders the controls. `total` is the
 * full unpaginated row count (client-side pagination).
 */
export function DataTablePagination({
  page,
  size,
  total,
  sizeOptions = [10, 20, 50],
  labels,
  onPageChange,
  onSizeChange,
}: {
  page: number;
  size: number;
  total: number;
  sizeOptions?: number[];
  labels: PaginationLabels;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / size));
  const clampedPage = Math.min(page, pageCount);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        {labels.rowsPerPage}
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          value={size}
          onChange={(e) => onSizeChange(Number(e.target.value))}
        >
          {sizeOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground tabular-nums">
          {labels.pageOf
            .replace("{{page}}", String(clampedPage))
            .replace("{{count}}", String(pageCount))}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="outline"
            disabled={clampedPage <= 1}
            onClick={() => onPageChange(clampedPage - 1)}
            aria-label={labels.previous}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            disabled={clampedPage >= pageCount}
            onClick={() => onPageChange(clampedPage + 1)}
            aria-label={labels.next}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}
