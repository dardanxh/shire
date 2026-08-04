import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ActivityIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  GitBranchIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { DataTable } from "@/components/shared/DataTable";
import { DataTablePagination } from "@/components/shared/DataTablePagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { extractErrorMessage } from "@/lib/api";
import { formatDate, formatTimeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useDeleteRepositoryMutation,
  useRefreshRepositoriesMutation,
  useRepositoriesQuery,
} from "../api";
import { buildRepositoryTree, type RepositoryTreeRow } from "../grouping";
import { StatusBadge } from "./StatusBadge";

export function RepositoriesListPage({
  page,
  size,
  onPageChange,
  onSizeChange,
}: {
  page: number;
  size: number;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isPending, isError, error } = useRepositoriesQuery({
    page,
    page_size: size,
  });

  // The page is a flat list of repository records; `total` counts parent repos, since the
  // backend pages by family so a monorepo's subdirectory records always arrive with it.
  const pageRows = data?.items ?? [];
  const total = data?.total ?? 0;
  const rows = useMemo(() => buildRepositoryTree(pageRows), [pageRows]);

  // Ticked repositories for the bulk actions — transient UI state.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const pageIds = pageRows.map((repo) => repo.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const toggleSelectAll = () => setSelectedIds(allPageSelected ? [] : pageIds);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const { mutateAsync: deleteRepository, isPending: isDeleting } =
    useDeleteRepositoryMutation();
  const { mutateAsync: refreshRepository, isPending: isRefreshing } =
    useRefreshRepositoriesMutation();

  const handleBulkDelete = async () => {
    try {
      for (const id of selectedIds) await deleteRepository(id);
      toast.success(
        t("repositories.list.delete_selected_success", {
          count: selectedIds.length,
        }),
      );
      setSelectedIds([]);
      setConfirmDeleteOpen(false);
    } catch {
      // Failures toast via the global mutation handler; already-deleted rows
      // drop out on invalidation, the rest stay selected for retry.
    }
  };

  const handleBulkRefresh = async () => {
    try {
      for (const id of selectedIds) await refreshRepository(id);
      toast.success(
        t("repositories.list.refresh_selected_success", {
          count: selectedIds.length,
        }),
      );
      setSelectedIds([]);
    } catch {
      // Global handler toasts the failure; refreshed rows update on invalidation.
    }
  };

  const handleCompare = () =>
    navigate({
      to: "/developments",
      search: { tab: "pulse", repos: selectedIds, range: "today" },
    });

  const handleRunCompliance = () =>
    navigate({
      to: "/compliance",
      search: { tab: "checker", page: 1, size: 20, repos: selectedIds },
    });

  // biome-ignore lint/correctness/useExhaustiveDependencies: toggle helpers are recreated per render; the memo keys on the state they close over
  const columns = useMemo<ColumnDef<RepositoryTreeRow>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        meta: { isAction: true, className: "w-10" },
        header: () => (
          <Checkbox
            checked={allPageSelected}
            onCheckedChange={toggleSelectAll}
            aria-label={t("repositories.list.select_all")}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.includes(row.original.id)}
            onCheckedChange={() => toggleSelect(row.original.id)}
            aria-label={t("repositories.list.select_row", {
              name: row.original.slug,
            })}
          />
        ),
      },
      {
        // The toggle for a repository's subrepo rows. Empty for rows without children —
        // including subdirectory records onboarded without their whole-repo record.
        id: "expander",
        enableSorting: false,
        meta: { isAction: true, className: "w-8" },
        header: () => null,
        cell: ({ row }) =>
          row.getCanExpand() ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-expanded={row.getIsExpanded()}
              aria-label={t(
                row.getIsExpanded()
                  ? "repositories.list.hide_subrepos"
                  : "repositories.list.show_subrepos",
                { name: row.original.slug },
              )}
              onClick={row.getToggleExpandedHandler()}
            >
              {row.getIsExpanded() ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </Button>
          ) : null,
      },
      {
        accessorKey: "slug",
        header: t("repositories.list.col_repository"),
        cell: ({ row }) => {
          const subrepoCount = row.original.subrepos?.length ?? 0;
          // A nested row shows just its subdirectory — the owner/name half is the row above.
          const isSubrepo = row.depth > 0;
          return (
            <div className={cn(isSubrepo && "pl-4")}>
              <span
                className={cn(
                  isSubrepo
                    ? "font-mono text-xs text-muted-foreground"
                    : "font-medium",
                )}
              >
                {isSubrepo ? row.original.subpath : row.original.slug}
              </span>
              {subrepoCount > 0 ? (
                <span className="ml-2 text-xs text-muted-foreground">
                  {t("repositories.list.subrepo_count", {
                    count: subrepoCount,
                  })}
                </span>
              ) : null}
              {row.original.status === "failed" && row.original.error ? (
                <p className="mt-0.5 max-w-md truncate text-xs text-destructive">
                  {row.original.error}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "provider",
        header: t("repositories.list.col_provider"),
        cell: ({ row }) => (
          <span className="capitalize text-muted-foreground">
            {row.original.provider}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: t("repositories.list.col_status"),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "default_branch",
        header: t("repositories.list.col_branch"),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.default_branch}
          </span>
        ),
      },
      {
        accessorKey: "last_analyzed_at",
        header: t("repositories.list.col_last_polled"),
        cell: ({ row }) => (
          <div className="text-muted-foreground">
            <div>{formatDate(row.original.last_analyzed_at)}</div>
            {row.original.last_analyzed_at ? (
              <div className="text-xs">
                {formatTimeAgo(row.original.last_analyzed_at)}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: "chevron",
        header: "",
        meta: { className: "w-8" },
        cell: () => (
          <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        ),
      },
    ],
    // pageRows matters: toggleSelectAll closes over the current page's ids.
    [t, selectedIds, allPageSelected, pageRows],
  );

  return (
    <div className="space-y-6">
      {/* Bulk actions appear once rows are ticked; otherwise no toolbar at all. */}
      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-sm text-muted-foreground">
            {t("repositories.list.selected_count", {
              count: selectedIds.length,
            })}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={isRefreshing}
            onClick={handleBulkRefresh}
          >
            <RefreshCwIcon
              className={isRefreshing ? "animate-spin" : undefined}
            />
            {t("repositories.list.refresh_selected")}
          </Button>
          <Button size="sm" variant="outline" onClick={handleCompare}>
            <ActivityIcon />
            {t("repositories.list.compare_selected")}
          </Button>
          <Button size="sm" variant="outline" onClick={handleRunCompliance}>
            <ShieldCheckIcon />
            {t("repositories.list.run_compliance")}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmDeleteOpen(true)}
          >
            <Trash2Icon />
            {t("repositories.list.delete_selected")}
          </Button>
        </div>
      ) : null}

      <Card className="overflow-hidden p-0">
        <DataTable
          columns={columns}
          data={rows}
          getSubRows={(row) => row.subrepos}
          getRowId={(row) => row.id}
          isPending={isPending}
          isError={isError}
          errorMessage={t("common.states.api_unreachable", {
            message: error ? extractErrorMessage(error) : "",
          })}
          onRowClick={(repo) =>
            navigate({
              to: "/repositories/$id",
              params: { id: repo.id },
              search: { tab: "overview" },
            })
          }
          emptyState={
            <div className="flex flex-col items-center gap-2 p-12 text-center">
              <GitBranchIcon className="size-8 text-muted-foreground" />
              <p className="font-medium">
                {t("repositories.list.empty_title")}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {t("repositories.list.empty_body")}
              </p>
            </div>
          }
        />
        {total > 0 ? (
          <div className="border-t border-border">
            <DataTablePagination
              page={page}
              size={size}
              total={total}
              onPageChange={onPageChange}
              onSizeChange={onSizeChange}
              labels={{
                rowsPerPage: t("common.pagination.rows_per_page"),
                pageOf: t("common.pagination.page_of"),
                previous: t("common.pagination.previous"),
                next: t("common.pagination.next"),
              }}
            />
          </div>
        ) : null}
      </Card>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("repositories.list.delete_selected_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("repositories.list.delete_selected_description", {
                count: selectedIds.length,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={handleBulkDelete}
            >
              {t("repositories.list.delete_selected_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
