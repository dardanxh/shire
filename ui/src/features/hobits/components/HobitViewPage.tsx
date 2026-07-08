import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeftIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { extractErrorMessage, type HobitRunOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useHobitQuery, useHobitRunsQuery } from "../api";
import { HobitConfigForm } from "./HobitConfigForm";

export function HobitViewPage({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { data: hobit, isPending, isError, error } = useHobitQuery(slug);
  const { data: runs } = useHobitRunsQuery(slug);

  const columns = useMemo<ColumnDef<HobitRunOut>[]>(
    () => [
      {
        accessorKey: "status",
        header: t("hobits.view.run_status"),
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.status}</Badge>
        ),
      },
      {
        accessorKey: "tier",
        header: t("hobits.view.run_tier"),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.tier ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "headline",
        header: t("hobits.view.run_headline"),
        cell: ({ row }) => (
          <span className="line-clamp-2 max-w-lg text-sm">
            {row.original.headline ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "started_at",
        header: t("hobits.view.run_when"),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDateTime(row.original.started_at)}
          </span>
        ),
      },
    ],
    [t],
  );

  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (isError || !hobit) {
    return (
      <div className="space-y-4">
        <BackLink label={t("hobits.view.back")} />
        <Card className="p-6 text-sm text-destructive">
          {error ? extractErrorMessage(error) : t("common.states.error_body")}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink label={t("hobits.view.back")} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {hobit.name}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {hobit.description}
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          {hobit.layer}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("hobits.view.config_title")}</CardTitle>
          <CardDescription>{t("hobits.view.config_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <HobitConfigForm hobit={hobit} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden p-0">
        <CardHeader className="p-6 pb-0">
          <CardTitle>{t("hobits.view.runs_title")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-4">
          <DataTable
            columns={columns}
            data={runs ?? []}
            emptyState={
              <div className="p-8 text-center text-sm text-muted-foreground">
                {t("hobits.view.runs_empty")}
              </div>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      to="/hobits"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" />
      {label}
    </Link>
  );
}
