import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
  EyeIcon,
  EyeOffIcon,
  LayoutDashboardIcon,
  MergeIcon,
  ScaleIcon,
  TriangleAlertIcon,
  UserMinusIcon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { DataTable } from "@/components/shared/DataTable";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AssignTeamDialog, ManageTeamsDialog } from "@/features/teams";
import {
  extractErrorMessage,
  type MemberSummaryOut,
  type PortfolioHealthOut,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAddExclusionMutation, useMembersOverviewQuery } from "../api";
import { ExclusionsDialog } from "./ExclusionsDialog";
import { MergeMembersDialog } from "./MergeMembersDialog";

interface Props {
  anonymize: boolean;
  onAnonymizeChange: (value: boolean) => void;
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="gap-1 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

function HealthCards({ health }: { health: PortfolioHealthOut }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard
        label={t("members.health.members")}
        value={String(health.member_count)}
      />
      <StatCard
        label={t("members.health.active")}
        value={String(health.active_member_count)}
      />
      <StatCard
        label={t("members.health.repositories")}
        value={String(health.repository_count)}
      />
      <StatCard
        label={t("members.health.single_maintainer")}
        value={String(health.single_member_repositories)}
        hint={t("members.health.single_maintainer_hint")}
      />
      <StatCard
        label={t("members.health.concentration")}
        value={`${Math.round(health.knowledge_concentration * 100)}%`}
        hint={t("members.health.concentration_hint")}
      />
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function MembersListPage({ anonymize, onAnonymizeChange }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isPending, isError, error } =
    useMembersOverviewQuery(anonymize);
  const [exclusionsOpen, setExclusionsOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [assignTeamOpen, setAssignTeamOpen] = useState(false);
  const [manageTeamsOpen, setManageTeamsOpen] = useState(false);

  // Ticked members — dashboard (1), compare (2-3), untrack (any count).
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const members = data?.members ?? [];
  const allSelected =
    members.length > 0 && members.every((m) => selectedIds.includes(m.id));
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? [] : members.map((m) => m.id));
  const selectedMembers = members.filter((m) => selectedIds.includes(m.id));

  // Untrack = add an email exclusion per member; reversible via Manage exclusions.
  const [confirmUntrackOpen, setConfirmUntrackOpen] = useState(false);
  const { mutateAsync: addExclusion, isPending: isUntracking } =
    useAddExclusionMutation();
  const handleUntrack = async () => {
    try {
      for (const member of selectedMembers) {
        await addExclusion({
          pattern: member.email,
          reason: t("members.list.untrack_reason"),
          is_bot: false,
        });
      }
      toast.success(
        t("members.list.untrack_success", { count: selectedMembers.length }),
      );
      setSelectedIds([]);
      setConfirmUntrackOpen(false);
    } catch {
      // Failures toast via the global mutation handler; untracked rows drop out
      // on invalidation, the rest stay selected for retry.
    }
  };

  const openDashboard = (id: string) =>
    navigate({ to: "/members/$id", params: { id }, search: { anonymize } });

  // biome-ignore lint/correctness/useExhaustiveDependencies: toggle helpers are recreated per render; the memo keys on the state they close over
  const columns = useMemo<ColumnDef<MemberSummaryOut>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        meta: { isAction: true, className: "w-10" },
        header: () => (
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleSelectAll}
            aria-label={t("members.list.select_all")}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.includes(row.original.id)}
            onCheckedChange={() => toggleSelect(row.original.id)}
            aria-label={t("members.list.select_row", {
              name: row.original.name,
            })}
          />
        ),
      },
      {
        accessorKey: "name",
        header: t("members.list.col_member"),
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 font-medium">
              {row.original.name}
              {row.original.team ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-foreground/10 px-1.5 py-0 text-[10px] font-normal"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: row.original.team.color }}
                  />
                  {row.original.team.name}
                </Badge>
              ) : null}
            </span>
            <span className="text-xs text-muted-foreground">
              {row.original.email}
            </span>
          </div>
        ),
      },
      {
        id: "activity",
        enableSorting: false,
        header: t("members.list.col_activity"),
        cell: ({ row }) => <Sparkline values={row.original.weekly_commits} />,
      },
      {
        accessorKey: "repository_count",
        header: t("members.list.col_repositories"),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.repository_count}</span>
        ),
      },
      {
        accessorKey: "commits",
        header: t("members.list.col_commits"),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.commits}</span>
        ),
      },
      {
        id: "churn",
        header: t("members.list.col_churn"),
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400">
              +{row.original.lines_added}
            </span>{" "}
            <span className="text-red-600 dark:text-red-400">
              −{row.original.lines_removed}
            </span>
          </span>
        ),
      },
      {
        accessorKey: "files_touched",
        header: t("members.list.col_files"),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.files_touched}</span>
        ),
      },
      {
        accessorKey: "last_active_at",
        header: t("members.list.col_last_active"),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.original.last_active_at)}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: t("members.list.col_status"),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn(
                row.original.status === "active"
                  ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "border-foreground/10 bg-muted text-muted-foreground",
              )}
            >
              {t(`members.list.status_${row.original.status}`)}
            </Badge>
            {row.original.sole_maintainer_repos > 0 ? (
              <Badge
                variant="outline"
                className="gap-1 border-warning/30 bg-warning/10 text-warning"
                title={t("members.list.sole_maintainer_hint", {
                  count: row.original.sole_maintainer_repos,
                })}
              >
                <TriangleAlertIcon className="size-3" />
                {row.original.sole_maintainer_repos}
              </Badge>
            ) : null}
          </div>
        ),
      },
    ],
    // members matters: toggleSelectAll closes over the current member ids.
    [t, selectedIds, allSelected, members],
  );

  const health = data?.health;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.length > 0 ? (
            <>
              <span className="text-sm text-muted-foreground">
                {t("members.list.selected_count", {
                  count: selectedIds.length,
                })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds([])}
              >
                {t("members.list.clear_selection")}
              </Button>
              {selectedIds.length === 1 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openDashboard(selectedIds[0])}
                >
                  <LayoutDashboardIcon />
                  {t("members.list.view_dashboard")}
                </Button>
              ) : null}
              {selectedIds.length >= 2 && selectedIds.length <= 3 ? (
                <Button
                  size="sm"
                  render={
                    <Link
                      to="/members/compare"
                      search={{ ids: selectedIds, anonymize }}
                    />
                  }
                >
                  <ScaleIcon />
                  {t("members.list.compare_count", {
                    count: selectedIds.length,
                  })}
                </Button>
              ) : null}
              {selectedIds.length >= 2 ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={anonymize}
                  title={
                    anonymize
                      ? t("members.list.merge_disabled_anonymized")
                      : undefined
                  }
                  onClick={() => setMergeOpen(true)}
                >
                  <MergeIcon />
                  {t("members.list.merge_button", {
                    count: selectedIds.length,
                  })}
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAssignTeamOpen(true)}
              >
                <UsersRoundIcon />
                {t("members.list.assign_team_button", {
                  count: selectedIds.length,
                })}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={anonymize}
                title={
                  anonymize
                    ? t("members.list.untrack_disabled_anonymized")
                    : undefined
                }
                onClick={() => setConfirmUntrackOpen(true)}
              >
                <UserMinusIcon />
                {t("members.list.untrack_button", {
                  count: selectedIds.length,
                })}
              </Button>
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={anonymize ? "default" : "outline"}
            size="sm"
            onClick={() => onAnonymizeChange(!anonymize)}
          >
            {anonymize ? (
              <EyeOffIcon className="size-4" />
            ) : (
              <EyeIcon className="size-4" />
            )}
            {anonymize
              ? t("members.list.anonymize_on")
              : t("members.list.anonymize_off")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExclusionsOpen(true)}
          >
            <UsersIcon className="size-4" />
            {t("members.list.manage_exclusions")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMergeOpen(true)}
          >
            <MergeIcon className="size-4" />
            {t("members.list.manage_merges")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setManageTeamsOpen(true)}
          >
            <UsersRoundIcon className="size-4" />
            {t("members.list.manage_teams")}
          </Button>
        </div>
      </div>

      {health ? <HealthCards health={health} /> : null}

      <Card className="overflow-hidden p-0">
        <DataTable
          columns={columns}
          data={members}
          isPending={isPending}
          isError={isError}
          errorMessage={t("common.states.api_unreachable", {
            message: error ? extractErrorMessage(error) : "",
          })}
          onRowClick={(row) => openDashboard(row.id)}
          emptyState={
            <div className="p-12 text-center text-sm text-muted-foreground">
              {t("members.list.empty")}
            </div>
          }
        />
      </Card>

      <AlertDialog
        open={confirmUntrackOpen}
        onOpenChange={setConfirmUntrackOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("members.list.untrack_title", { count: selectedIds.length })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("members.list.untrack_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUntracking}>
              {t("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isUntracking}
              onClick={handleUntrack}
            >
              {t("members.list.untrack_confirm", {
                count: selectedIds.length,
              })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ExclusionsDialog
        open={exclusionsOpen}
        onOpenChange={setExclusionsOpen}
      />
      <MergeMembersDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        // No creation section when opened just to manage rules (or while anonymized).
        members={anonymize ? [] : selectedMembers}
        onMerged={() => setSelectedIds([])}
      />
      <AssignTeamDialog
        open={assignTeamOpen}
        onOpenChange={setAssignTeamOpen}
        members={selectedMembers.map((m) => ({ id: m.id, email: m.email }))}
        onAssigned={() => setSelectedIds([])}
      />
      <ManageTeamsDialog
        open={manageTeamsOpen}
        onOpenChange={setManageTeamsOpen}
      />
    </div>
  );
}
