import { getRouteApi, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { DataTable } from "@/components/shared/DataTable";
import { DataTablePagination } from "@/components/shared/DataTablePagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type Archetype,
  useArchetypesQuery,
  useSetArchetypeArchivedMutation,
} from "../api";
import { type ArchetypeFamily, FAMILIES } from "../schemas";
import { DeleteArchetypeDialog } from "./DeleteArchetypeDialog";

const route = getRouteApi("/settings/archetypes/");

export function ArchetypesListPage() {
  const { t } = useTranslation();
  const navigate = route.useNavigate();
  const search = route.useSearch();
  const [deleteTarget, setDeleteTarget] = useState<Archetype | null>(null);

  const {
    data: archetypesPage,
    isPending,
    isError,
    refetch,
  } = useArchetypesQuery({
    page: search.page,
    size: search.size,
    family: search.family,
    q: search.q,
    include_archived: search.include_archived,
  });
  const { mutate: setArchived } = useSetArchetypeArchivedMutation();

  // Local mirror of `q` so typing stays responsive while the URL update is debounced.
  const [searchInput, setSearchInput] = useState(search.q ?? "");
  const searchTimer = useRef<number | undefined>(undefined);
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchInput(value);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      navigate({
        search: (prev) => ({ ...prev, q: value || undefined, page: 1 }),
        replace: true,
      });
    }, 300);
  };

  const hasFilters = Boolean(
    search.q || search.family || search.include_archived,
  );
  const clearFilters = () => {
    window.clearTimeout(searchTimer.current);
    setSearchInput("");
    navigate({ search: { page: 1, size: search.size } });
  };

  const familyItems: Array<{ value: ArchetypeFamily | null; label: string }> = [
    { value: null, label: t("archetypes.list.family_all") },
    ...FAMILIES.map((family) => ({
      value: family,
      label: t(`archetypes.family.${family}`),
    })),
  ];

  const handleToggleArchived = (archetype: Archetype) => {
    setArchived(
      { id: archetype.id, archived: !archetype.archived },
      {
        onSuccess: (updated) => {
          toast.success(
            updated.archived
              ? t("archetypes.archive.toast_archived")
              : t("archetypes.archive.toast_unarchived"),
          );
        },
      },
    );
  };

  const columns: ColumnDef<Archetype, unknown>[] = [
    {
      accessorKey: "name",
      header: t("archetypes.columns.name"),
      cell: ({ row }) => (
        <div className="flex items-baseline gap-2">
          <span className="font-medium">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.slug}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "family",
      header: t("archetypes.columns.family"),
      cell: ({ row }) => (
        <Badge variant="secondary">
          {t(`archetypes.family.${row.original.family}`)}
        </Badge>
      ),
    },
    {
      id: "modes",
      header: t("archetypes.columns.modes"),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.supports_greenfield && (
            <Badge variant="outline">{t("archetypes.badges.greenfield")}</Badge>
          )}
          {row.original.supports_brownfield && (
            <Badge variant="outline">{t("archetypes.badges.brownfield")}</Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "is_initiative",
      header: t("archetypes.columns.initiative"),
      cell: ({ row }) =>
        row.original.is_initiative ? (
          <Badge>{t("archetypes.badges.initiative")}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            {t("archetypes.badges.project")}
          </span>
        ),
    },
    {
      accessorKey: "seed_tier",
      header: t("archetypes.columns.tier"),
      cell: ({ row }) =>
        t("archetypes.tier_label", { tier: row.original.seed_tier }),
    },
    {
      accessorKey: "archived",
      header: t("archetypes.columns.state"),
      cell: ({ row }) =>
        row.original.archived ? (
          <Badge variant="destructive">{t("archetypes.badges.archived")}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            {t("archetypes.badges.active")}
          </span>
        ),
    },
    {
      id: "actions",
      header: "",
      meta: { isAction: true },
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("common.actions.open_menu")}
                />
              }
            >
              <EllipsisVerticalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  navigate({
                    to: "/settings/archetypes/$id/edit",
                    params: { id: row.original.id },
                  })
                }
              >
                <PencilIcon />
                {t("common.actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleToggleArchived(row.original)}
              >
                {row.original.archived ? (
                  <ArchiveRestoreIcon />
                ) : (
                  <ArchiveIcon />
                )}
                {row.original.archived
                  ? t("archetypes.archive.unarchive")
                  : t("archetypes.archive.archive")}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteTarget(row.original)}
              >
                <Trash2Icon />
                {t("common.actions.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold">
            {t("archetypes.list.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("archetypes.list.description")}
          </p>
        </div>
        <Button render={<Link to="/settings/archetypes/new" />}>
          <PlusIcon />
          {t("archetypes.list.new_button")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={searchInput}
          onChange={handleSearchChange}
          placeholder={t("archetypes.list.search_placeholder")}
          className="w-full sm:w-64"
        />
        <Select
          items={familyItems}
          value={search.family ?? null}
          onValueChange={(value) =>
            navigate({
              search: (prev) => ({
                ...prev,
                family: value ?? undefined,
                page: 1,
              }),
            })
          }
        >
          <SelectTrigger className="min-w-44">
            <SelectValue placeholder={t("archetypes.list.family_all")} />
          </SelectTrigger>
          <SelectContent>
            {familyItems.map((item) => (
              <SelectItem key={item.label} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={search.include_archived ? "secondary" : "outline"}
          onClick={() =>
            navigate({
              search: (prev) => ({
                ...prev,
                include_archived: search.include_archived ? undefined : true,
                page: 1,
              }),
            })
          }
        >
          <ArchiveIcon />
          {t("archetypes.list.show_archived")}
        </Button>
        {hasFilters && (
          <Button variant="ghost" onClick={clearFilters}>
            <XIcon />
            {t("common.actions.clear_filters")}
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border">
        <DataTable
          columns={columns}
          data={archetypesPage?.items ?? []}
          isPending={isPending}
          isError={isError}
          errorMessage={
            <span className="inline-flex flex-col items-center gap-2">
              {t("common.table.error")}
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {t("common.actions.retry")}
              </Button>
            </span>
          }
          emptyState={
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="font-medium">{t("archetypes.list.empty_title")}</p>
              <p className="text-sm text-muted-foreground">
                {t("archetypes.list.empty_description")}
              </p>
              <Button
                variant="outline"
                size="sm"
                render={<Link to="/settings/archetypes/new" />}
              >
                {t("archetypes.list.new_button")}
              </Button>
            </div>
          }
          onRowClick={(row) =>
            navigate({
              to: "/settings/archetypes/$id/edit",
              params: { id: row.id },
            })
          }
        />
      </div>

      {archetypesPage && archetypesPage.total > 0 && (
        <DataTablePagination
          page={archetypesPage.page ?? 1}
          size={search.size}
          total={archetypesPage.total}
          sizeOptions={[10, 20, 50, 100]}
          onPageChange={(page) =>
            navigate({ search: (prev) => ({ ...prev, page }) })
          }
          onSizeChange={(size) =>
            navigate({ search: (prev) => ({ ...prev, size, page: 1 }) })
          }
          labels={{
            pageOf: t("common.pagination.page_of"),
            previous: t("common.pagination.previous"),
            next: t("common.pagination.next"),
            rowsPerPage: t("common.pagination.rows_per_page"),
          }}
        />
      )}

      {deleteTarget && (
        <DeleteArchetypeDialog
          archetype={deleteTarget}
          open
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}
