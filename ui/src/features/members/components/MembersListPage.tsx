import type { ColumnDef } from "@tanstack/react-table";
import { EyeIcon, EyeOffIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  extractErrorMessage,
  type MemberSummaryOut,
  type PortfolioHealthOut,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMembersOverviewQuery } from "../api";
import { ExclusionsDialog } from "./ExclusionsDialog";
import { MemberDetailDialog } from "./MemberDetailDialog";

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
  const { data, isPending, isError, error } =
    useMembersOverviewQuery(anonymize);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exclusionsOpen, setExclusionsOpen] = useState(false);

  const columns = useMemo<ColumnDef<MemberSummaryOut>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("members.list.col_member"),
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.name}</span>
            <span className="text-xs text-muted-foreground">
              {row.original.email}
            </span>
          </div>
        ),
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
        ),
      },
    ],
    [t],
  );

  const health = data?.health;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("members.list.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isPending
              ? t("members.list.loading")
              : t("members.list.subtitle", {
                  repositories: health?.repository_count ?? 0,
                })}
          </p>
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
        </div>
      </div>

      {/* Ethics note — always visible: this is a resilience lens, not a leaderboard. */}
      <Card className="flex-row items-start gap-3 border-primary/20 bg-primary/5 p-4">
        <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{t("members.ethics.title")}</p>
          <p className="text-sm text-muted-foreground">
            {t("members.ethics.body")}
          </p>
        </div>
      </Card>

      {health ? <HealthCards health={health} /> : null}

      <Card className="overflow-hidden p-0">
        <DataTable
          columns={columns}
          data={data?.members ?? []}
          isPending={isPending}
          isError={isError}
          errorMessage={t("common.states.api_unreachable", {
            message: error ? extractErrorMessage(error) : "",
          })}
          onRowClick={(row) => setSelectedId(row.id)}
          emptyState={
            <div className="p-12 text-center text-sm text-muted-foreground">
              {t("members.list.empty")}
            </div>
          }
        />
      </Card>

      <MemberDetailDialog
        id={selectedId}
        anonymize={anonymize}
        onClose={() => setSelectedId(null)}
      />
      <ExclusionsDialog
        open={exclusionsOpen}
        onOpenChange={setExclusionsOpen}
      />
    </div>
  );
}
