import { getRouteApi } from "@tanstack/react-router";
import {
  PlusIcon,
  ScaleIcon,
  SlidersHorizontalIcon,
  SquarePenIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PRINCIPLE_SEVERITIES,
  PRINCIPLE_TECHS,
  type PrincipleOut,
} from "@/lib/api";
import { useDeletePrincipleMutation, usePrinciplesQuery } from "../api";
import { SeverityBadge } from "./badges";
import { PrincipleDialog } from "./PrincipleDialog";

const route = getRouteApi("/principles");

export function PrinciplesListPage() {
  const { t } = useTranslation();
  const navigate = route.useNavigate();
  const search = route.useSearch();
  const { data: principles, isPending } = usePrinciplesQuery();

  const severityItems = [
    { value: null, label: t("principles.filter.severity_all") },
    ...PRINCIPLE_SEVERITIES.map((s) => ({
      value: s as string,
      label: t(`principles.severity.${s}`),
    })),
  ];
  const techItems = [
    { value: null, label: t("principles.filter.tech_all") },
    ...PRINCIPLE_TECHS.map((tech) => ({
      value: tech as string,
      label: t(`principles.tech.${tech}`),
    })),
  ];

  const filtered = (principles ?? []).filter(
    (p) =>
      (!search.severity || p.severity === search.severity) &&
      (!search.tech || p.tech === search.tech),
  );

  if (isPending) return <Skeleton className="h-96 w-full" />;

  const activeFilters: { key: "severity" | "tech"; label: string }[] = [];
  if (search.severity)
    activeFilters.push({
      key: "severity",
      label: t(`principles.severity.${search.severity}`),
    });
  if (search.tech)
    activeFilters.push({
      key: "tech",
      label: t(`principles.tech.${search.tech}`),
    });
  const dropFilter = (key: "severity" | "tech") =>
    navigate({ search: (prev) => ({ ...prev, [key]: undefined }) });

  return (
    <div className="space-y-6">
      {/* One toolbar: filters left, page action right. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Popover>
          <PopoverTrigger
            render={<Button variant="outline" className="bg-background" />}
          >
            <SlidersHorizontalIcon />
            {t("principles.filter.button")}
            {activeFilters.length > 0 && (
              <Badge variant="accent">{activeFilters.length}</Badge>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="gap-3 p-3">
            <FilterField label={t("principles.filter.severity_label")}>
              <Select
                items={severityItems}
                value={search.severity ?? null}
                onValueChange={(value) =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      severity: (value ?? undefined) as typeof search.severity,
                    }),
                  })
                }
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue
                    placeholder={t("principles.filter.severity_all")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {severityItems.map((item) => (
                    <SelectItem key={item.label} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label={t("principles.filter.tech_label")}>
              <Select
                items={techItems}
                value={search.tech ?? null}
                onValueChange={(value) =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      tech: (value ?? undefined) as typeof search.tech,
                    }),
                  })
                }
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder={t("principles.filter.tech_all")} />
                </SelectTrigger>
                <SelectContent>
                  {techItems.map((item) => (
                    <SelectItem key={item.label} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          </PopoverContent>
        </Popover>
        <PrincipleDialog
          trigger={
            <Button size="sm">
              <PlusIcon className="size-3.5" />
              {t("principles.list.new")}
            </Button>
          }
        />
      </div>

      {/* Active filters as removable chips, tucked under the toolbar. */}
      {activeFilters.length > 0 && (
        <div className="-mt-3 flex flex-wrap items-center gap-1.5">
          {activeFilters.map((filter) => (
            <Badge key={filter.key} variant="accent" className="gap-0.5 pr-1">
              {filter.label}
              <button
                type="button"
                onClick={() => dropFilter(filter.key)}
                aria-label={t("principles.filter.remove", {
                  name: filter.label,
                })}
                className="rounded-full p-0.5 text-accent-foreground/50 transition-colors hover:bg-accent-foreground/10 hover:text-accent-foreground"
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ search: {} })}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("common.actions.clear_filters")}
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <ScaleIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">{t("principles.list.empty_title")}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {t("principles.list.empty_body")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <PrincipleCard key={p.id} principle={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PrincipleCard({ principle }: { principle: PrincipleOut }) {
  const { t } = useTranslation();
  const { mutate: deletePrinciple } = useDeletePrincipleMutation();

  return (
    <Card className="gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-medium">{principle.name}</span>
          <SeverityBadge severity={principle.severity} />
          {principle.tech !== "general" ? (
            <Badge variant="secondary">
              {t(`principles.tech.${principle.tech}`)}
            </Badge>
          ) : null}
          {!principle.enabled ? (
            <Badge variant="outline" className="text-muted-foreground">
              {t("principles.list.disabled")}
            </Badge>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <PrincipleDialog
            principle={principle}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("principles.list.edit")}
              >
                <SquarePenIcon className="size-4 text-muted-foreground" />
              </Button>
            }
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("principles.list.delete")}
            onClick={() =>
              deletePrinciple(principle.id, {
                onSuccess: () => toast.success(t("principles.list.deleted")),
              })
            }
          >
            <Trash2Icon className="size-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
        {principle.statement}
      </p>
    </Card>
  );
}

/** One labeled control row inside the Filters popover. */
function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
