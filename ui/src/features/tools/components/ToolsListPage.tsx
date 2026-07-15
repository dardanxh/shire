import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLinkIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { extractErrorMessage, type ToolStatusOut } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToolsQuery } from "../api";
import { SyncToolsButton } from "./SyncToolsButton";

export function ToolsListPage() {
  const { t } = useTranslation();
  const { data: tools, isPending, isError, error } = useToolsQuery();

  const columns = useMemo<ColumnDef<ToolStatusOut>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("tools.list.col_tool"),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: "available",
        header: t("tools.list.col_status"),
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={cn(
              row.original.available
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25"
                : "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
            )}
          >
            {row.original.available
              ? t("tools.list.available")
              : t("tools.list.missing")}
          </Badge>
        ),
      },
      {
        accessorKey: "language",
        header: t("tools.list.col_language"),
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={cn(
              "capitalize",
              row.original.language === "python"
                ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/25"
                : "bg-muted text-muted-foreground border-foreground/10",
            )}
          >
            {row.original.language}
          </Badge>
        ),
      },
      {
        accessorKey: "version",
        header: t("tools.list.col_version"),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.version ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "purpose",
        header: t("tools.list.col_purpose"),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.purpose}</span>
        ),
      },
      {
        accessorKey: "install",
        header: t("tools.list.col_install"),
        cell: ({ row }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {row.original.install}
          </code>
        ),
      },
      {
        accessorKey: "homepage",
        header: t("tools.list.col_homepage"),
        meta: { isAction: true },
        cell: ({ row }) =>
          row.original.homepage ? (
            <a
              href={row.original.homepage}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm hover:text-foreground hover:underline"
            >
              {t("tools.list.link")}
              <ExternalLinkIcon className="size-3.5" />
            </a>
          ) : (
            "—"
          ),
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <SyncToolsButton />
      </div>

      <Card className="overflow-hidden p-0">
        <DataTable
          columns={columns}
          data={tools ?? []}
          isPending={isPending}
          isError={isError}
          errorMessage={t("common.states.api_unreachable", {
            message: error ? extractErrorMessage(error) : "",
          })}
          emptyState={
            <div className="p-12 text-center text-sm text-muted-foreground">
              {t("tools.list.empty")}
            </div>
          }
        />
      </Card>
    </div>
  );
}
