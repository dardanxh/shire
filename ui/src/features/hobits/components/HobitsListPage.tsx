import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { extractErrorMessage, type HobitOut } from "@/lib/api";
import { useHobitsQuery, useUpdateHobitMutation } from "../api";
import { HOBIT_MODELS } from "../schemas";
import { DeleteHobitDialog } from "./DeleteHobitDialog";
import { HobitFormDialog } from "./HobitFormDialog";

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
        accessorKey: "category",
        header: t("hobits.list.col_category"),
        cell: ({ row }) => (
          <Badge variant="outline" className="text-xs">
            {row.original.category}
          </Badge>
        ),
      },
      {
        id: "tags",
        header: t("hobits.list.col_tags"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        accessorKey: "unread_count",
        header: t("hobits.list.col_unread"),
        cell: ({ row }) =>
          row.original.unread_count > 0 ? (
            <Badge>{row.original.unread_count}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "model",
        header: t("hobits.list.col_model"),
        meta: { isAction: true },
        cell: ({ row }) => <ModelCell hobit={row.original} />,
      },
      {
        accessorKey: "enabled",
        header: t("hobits.list.col_status"),
        meta: { isAction: true },
        cell: ({ row }) => <StatusCell hobit={row.original} />,
      },
      {
        id: "last_run",
        header: t("hobits.list.col_last_run"),
        enableSorting: false,
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
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { isAction: true },
        cell: ({ row }) =>
          row.original.custom ? <CustomActions hobit={row.original} /> : null,
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <HobitFormDialog
          trigger={
            <Button size="sm">
              <PlusIcon className="size-4" />
              {t("hobits.list.new_hobit")}
            </Button>
          }
        />
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

/** Edit + delete actions for a custom (user-authored) hobit. */
function CustomActions({ hobit }: { hobit: HobitOut }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-end gap-1">
      <HobitFormDialog
        hobit={hobit}
        trigger={
          <Button size="icon-sm" variant="ghost" title={t("hobits.form.edit")}>
            <PencilIcon className="size-3.5" />
          </Button>
        }
      />
      <DeleteHobitDialog
        slug={hobit.slug}
        name={hobit.name}
        trigger={
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            title={t("hobits.delete.confirm")}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        }
      />
    </div>
  );
}

/** Inline model picker — saves the full config with only `model` changed. */
function ModelCell({ hobit }: { hobit: HobitOut }) {
  const { mutate: save, isPending } = useUpdateHobitMutation(hobit.slug);
  return (
    <Select
      value={hobit.model}
      onValueChange={(model) => model && save({ ...configOf(hobit), model })}
      disabled={isPending}
    >
      <SelectTrigger className="h-7 w-28 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {HOBIT_MODELS.map((m) => (
          <SelectItem key={m.alias} value={m.alias}>
            {m.version}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Inline enabled/disabled toggle. */
function StatusCell({ hobit }: { hobit: HobitOut }) {
  const { t } = useTranslation();
  const { mutate: save, isPending } = useUpdateHobitMutation(hobit.slug);
  return (
    <div className="inline-flex items-center gap-2 text-xs">
      <Switch
        checked={hobit.enabled}
        disabled={isPending}
        aria-label={t("hobits.list.col_status")}
        onCheckedChange={(enabled) => save({ ...configOf(hobit), enabled })}
      />
      <span className="text-muted-foreground">
        {hobit.enabled
          ? t("hobits.status.enabled")
          : t("hobits.status.disabled")}
      </span>
    </div>
  );
}

/** The editable config fields carried on a row, as a HobitConfigUpdate body. */
function configOf(h: HobitOut) {
  return {
    name: h.name,
    enabled: h.enabled,
    model: h.model,
    charter: h.charter,
    instructions: h.instructions,
    timeout_seconds: h.timeout_seconds,
    tags: h.tags,
  };
}
