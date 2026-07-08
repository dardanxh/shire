import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { extractErrorMessage, type HobitOut } from "@/lib/api";
import { useHobitsQuery } from "../api";

export function HobitsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: hobits, isPending, isError, error } = useHobitsQuery();

  const columns = useMemo<ColumnDef<HobitOut>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("hobits.list.col_name"),
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <span className="font-medium">{row.original.name}</span>
            <p className="max-w-md truncate text-xs text-muted-foreground">
              {row.original.description}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "layer",
        header: t("hobits.list.col_layer"),
        cell: ({ row }) => (
          <Badge variant="outline" className="font-mono text-xs">
            {row.original.layer}
          </Badge>
        ),
      },
      {
        accessorKey: "model",
        header: t("hobits.list.col_model"),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.model}
          </span>
        ),
      },
      {
        accessorKey: "enabled",
        header: t("hobits.list.col_status"),
        cell: ({ row }) => (
          <Badge variant={row.original.enabled ? "secondary" : "outline"}>
            {row.original.enabled
              ? t("hobits.status.enabled")
              : t("hobits.status.disabled")}
          </Badge>
        ),
      },
      {
        id: "last_run",
        header: t("hobits.list.col_last_run"),
        cell: ({ row }) =>
          row.original.last_run ? (
            <span className="text-xs text-muted-foreground">
              {row.original.last_run.status}
              {row.original.last_run.tier
                ? ` · ${row.original.last_run.tier}`
                : ""}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("hobits.list.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("hobits.list.subtitle")}
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <DataTable
          columns={columns}
          data={hobits ?? []}
          isPending={isPending}
          isError={isError}
          errorMessage={t("common.states.api_unreachable", {
            message: error ? extractErrorMessage(error) : "",
          })}
          onRowClick={(row) =>
            navigate({ to: "/hobits/$slug", params: { slug: row.slug } })
          }
          emptyState={
            <div className="p-12 text-center text-sm text-muted-foreground">
              {t("hobits.list.empty")}
            </div>
          }
        />
      </Card>
    </div>
  );
}
