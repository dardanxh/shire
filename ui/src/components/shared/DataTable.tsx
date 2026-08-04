import {
  type ColumnDef,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ChevronUpIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // Per-column extras the shared table understands.
  interface ColumnMeta<TData, TValue> {
    /** Mark a cell (e.g. row actions) so clicks don't trigger `onRowClick`. */
    isAction?: boolean;
    className?: string;
    _phantom?: [TData, TValue];
  }
}

interface DataTableProps<TData> {
  // biome-ignore lint/suspicious/noExplicitAny: column value types are heterogeneous.
  columns: ColumnDef<TData, any>[];
  data: TData[];
  isPending?: boolean;
  isError?: boolean;
  errorMessage?: ReactNode;
  emptyState?: ReactNode;
  onRowClick?: (row: TData) => void;
  skeletonRows?: number;
  /** Return a row's children to render them as collapsible sub-rows (default: flat). The
   * toggle is the consumer's job: a cell calls `row.getToggleExpandedHandler()`. */
  getSubRows?: (row: TData) => TData[] | undefined;
  /** Stable row identity. Pass it alongside `getSubRows` — the default index-path ids move
   * expansion onto the wrong row when a poll reorders the data. */
  getRowId?: (row: TData) => string;
}

export function DataTable<TData>({
  columns,
  data,
  isPending,
  isError,
  errorMessage,
  emptyState,
  onRowClick,
  skeletonRows = 6,
  getSubRows,
  getRowId,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  // Explicit generic: with `getSubRows` in the options object TData no longer infers.
  const table = useReactTable<TData>({
    data,
    columns,
    state: { sorting, expanded },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getSubRows,
    getRowId: getRowId && ((row) => getRowId(row)),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead
                key={header.id}
                className={header.column.columnDef.meta?.className}
              >
                {header.isPlaceholder ? null : header.column.getCanSort() ? (
                  <button
                    type="button"
                    onClick={header.column.getToggleSortingHandler()}
                    className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                    <SortIcon direction={header.column.getIsSorted()} />
                  </button>
                ) : (
                  flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )
                )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {isError ? (
          <TableRow>
            <TableCell
              colSpan={columns.length}
              className="h-24 text-center text-sm text-destructive"
            >
              {errorMessage}
            </TableCell>
          </TableRow>
        ) : isPending ? (
          Array.from({ length: skeletonRows }).map((_, r) => (
            <TableRow key={r}>
              {columns.map((_col, c) => (
                <TableCell key={c}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="p-0">
              {emptyState}
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className={cn(
                onRowClick && "group cursor-pointer",
                // Nested rows read as belonging to the row above them.
                row.depth > 0 && "bg-muted/20",
              )}
              onClick={() => onRowClick?.(row.original)}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cell.column.columnDef.meta?.className}
                  onClick={
                    cell.column.columnDef.meta?.isAction
                      ? (e) => e.stopPropagation()
                      : undefined
                  }
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
  if (direction === "asc") return <ChevronUpIcon className="size-3.5" />;
  if (direction === "desc") return <ChevronDownIcon className="size-3.5" />;
  return <ChevronsUpDownIcon className="size-3.5 text-muted-foreground/50" />;
}
