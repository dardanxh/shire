import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ActivityIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  GitBranchIcon,
  Loader2Icon,
  RefreshCwIcon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { DataTable } from "@/components/shared/DataTable";
import { DataTablePagination } from "@/components/shared/DataTablePagination";
import { Sparkline } from "@/components/shared/Sparkline";
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
  useInspectionsOverviewQuery,
  useRefreshRepositoriesMutation,
  useRepositoriesQuery,
  useRunInspectionsMutation,
  useSetRepositoryStarredMutation,
  useStarredRepositoriesQuery,
} from "../api";
import { buildRepositoryTree, type RepositoryTreeRow } from "../grouping";
import { completionToneClass } from "../inspections";
import { StatusBadge } from "./StatusBadge";

export function RepositoriesListPage({
  page,
  size,
  onPageChange,
  onSizeChange,
  starredOnly = false,
}: {
  page: number;
  size: number;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
  /** Starred tab: the hand-curated favourites, unpaginated. Same table, same actions. */
  starredOnly?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Only the active tab's query runs — the other stays idle rather than polling in the background.
  const listQuery = useRepositoriesQuery(
    { page, page_size: size },
    { enabled: !starredOnly },
  );
  const starredQuery = useStarredRepositoriesQuery({ enabled: starredOnly });
  const { isPending, isError, error } = starredOnly ? starredQuery : listQuery;
  const { mutate: setStarred } = useSetRepositoryStarredMutation();

  // The page is a flat list of repository records; `total` counts parent repos, since the
  // backend pages by family so a monorepo's subdirectory records always arrive with it.
  const pageRows =
    (starredOnly ? starredQuery.data : listQuery.data?.items) ?? [];
  const total = listQuery.data?.total ?? 0;
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
  const [confirmAnalyzeOpen, setConfirmAnalyzeOpen] = useState(false);
  const { mutateAsync: deleteRepository, isPending: isDeleting } =
    useDeleteRepositoryMutation();
  const { mutateAsync: refreshRepository, isPending: isRefreshing } =
    useRefreshRepositoriesMutation();
  const { mutateAsync: runInspections, isPending: isAnalyzing } =
    useRunInspectionsMutation();

  // Inspection counts + commit activity for the two derived columns, keyed by repo id.
  const { data: inspections } = useInspectionsOverviewQuery();
  const inspectionsById = useMemo(
    () =>
      new Map((inspections ?? []).map((item) => [item.repository_id, item])),
    [inspections],
  );

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

  /** Start the whole AI analysis set for every selected repo — one request each (the
   * endpoint fans out to the ~13 jobs server-side). Anything already done or already
   * running comes back as a skip rather than a duplicate engine run. */
  const handleBulkAnalyze = async () => {
    let queued = 0;
    let skipped = 0;
    try {
      for (const id of selectedIds) {
        const result = await runInspections({ repositoryId: id });
        // Both default server-side, so the generated types have them optional.
        queued += result.queued?.length ?? 0;
        skipped += result.skipped?.length ?? 0;
      }
      toast.success(
        t("repositories.list.run_ai_analysis_success", {
          count: queued,
          skipped,
        }),
      );
      setSelectedIds([]);
      setConfirmAnalyzeOpen(false);
    } catch {
      // Global handler toasts the failure; the counts above cover partial progress.
    }
  };

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
        // Favourite toggle. Bookmark only — it never touches the watchlist digest.
        id: "star",
        enableSorting: false,
        meta: { isAction: true, className: "w-8" },
        header: () => null,
        cell: ({ row }) => (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-pressed={row.original.starred}
            aria-label={t(
              row.original.starred
                ? "repositories.list.unstar"
                : "repositories.list.star",
              { name: row.original.slug },
            )}
            title={t(
              row.original.starred
                ? "repositories.list.unstar"
                : "repositories.list.star",
              { name: row.original.slug },
            )}
            onClick={() =>
              setStarred({
                id: row.original.id,
                starred: !row.original.starred,
              })
            }
          >
            <StarIcon
              className={cn(
                "size-4",
                row.original.starred
                  ? "fill-warning text-warning"
                  : "text-muted-foreground/40",
              )}
            />
          </Button>
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
        accessorKey: "status",
        header: t("repositories.list.col_status"),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        // Commits per day over the last month. Single series, so no axes and no legend;
        // the numbers live in the title attribute rather than a floating tooltip, which
        // would fight the row's click-to-open.
        id: "activity",
        // Sorts on total commits in the window — the sparkline's shape isn't orderable, its
        // volume is. Repos with no analysis yet sort as -1 so "unknown" stays below a real
        // zero instead of tying with it.
        accessorFn: (repo) => {
          const item = inspectionsById.get(repo.id);
          if (!item) return -1;
          return item.daily_commits.reduce((sum, n) => sum + n, 0);
        },
        sortingFn: "basic",
        sortDescFirst: true,
        header: t("repositories.list.col_activity"),
        cell: ({ row }) => {
          const daily =
            inspectionsById.get(row.original.id)?.daily_commits ?? [];
          return (
            <Sparkline
              values={daily}
              className="text-(--chart-2)"
              title={t("repositories.list.activity_hint", {
                count: daily.reduce((sum, n) => sum + n, 0),
                days: daily.length,
              })}
            />
          );
        },
      },
      {
        id: "checks",
        // Sorts on the completion ratio rather than the raw count, so the order still reads
        // correctly if two repos ever end up with different denominators.
        accessorFn: (repo) => {
          const item = inspectionsById.get(repo.id);
          if (!item || item.total === 0) return -1;
          return item.completed / item.total;
        },
        sortingFn: "basic",
        sortDescFirst: true,
        header: t("repositories.list.col_checks"),
        cell: ({ row }) => {
          const item = inspectionsById.get(row.original.id);
          if (!item) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <span
              className={cn(
                "text-sm font-medium tabular-nums",
                completionToneClass(item.completed, item.total),
              )}
            >
              {item.completed}/{item.total}
            </span>
          );
        },
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
    // pageRows matters: toggleSelectAll closes over the current page's ids. inspectionsById
    // matters too — the Activity and Checks cells read it, and it arrives a beat after the
    // rows do, so leaving it out freezes both columns on the empty first-render map.
    [t, selectedIds, allPageSelected, pageRows, inspectionsById, setStarred],
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
          <Button
            size="sm"
            variant="outline"
            disabled={isAnalyzing}
            onClick={() => setConfirmAnalyzeOpen(true)}
          >
            {isAnalyzing ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <SparklesIcon />
            )}
            {t("repositories.list.run_ai_analysis")}
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
              {starredOnly ? (
                <StarIcon className="size-8 text-muted-foreground" />
              ) : (
                <GitBranchIcon className="size-8 text-muted-foreground" />
              )}
              <p className="font-medium">
                {t(
                  starredOnly
                    ? "repositories.list.starred_empty_title"
                    : "repositories.list.empty_title",
                )}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {t(
                  starredOnly
                    ? "repositories.list.starred_empty_body"
                    : "repositories.list.empty_body",
                )}
              </p>
            </div>
          }
        />
        {!starredOnly && total > 0 ? (
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

      {/* Each selected repo fans out to ~13 engine runs — worth confirming the scale. */}
      <AlertDialog
        open={confirmAnalyzeOpen}
        onOpenChange={setConfirmAnalyzeOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("repositories.list.run_ai_analysis_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("repositories.list.run_ai_analysis_description", {
                count: selectedIds.length,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAnalyzing}>
              {t("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isAnalyzing}
              onClick={handleBulkAnalyze}
            >
              {t("repositories.list.run_ai_analysis_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
