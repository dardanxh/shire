import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ExternalLinkIcon,
  FileWarningIcon,
  Loader2Icon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DependencyFreshnessItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  useAiDependencyScanMutation,
  useDependencyFreshnessQuery,
  useDependencyInventoryQuery,
  useGenerateDependencyFreshnessMutation,
} from "../api";
import { UpgradeGapBadge } from "./UpgradeGapBadge";

/**
 * Criticality of a dependency's upgrade gap, most critical first — doubles as the
 * sort rank and the filter option order. A dependency the freshness check hasn't
 * covered yet has no gap at all; it sorts and filters as "unknown".
 */
const CRITICALITY = ["major", "minor", "patch", "up-to-date", "unknown"];

/** Sentinel for "don't filter" — `<SelectItem>` needs a non-empty value. */
const ALL_CRITICALITIES = "all";

/** Translation key for a criticality value ("up-to-date" → `gap_up_to_date`). */
const gapLabelKey = (gap: string) =>
  `repositories.view.gap_${gap.replace(/-/g, "_")}`;

type SortKey = "name" | "criticality";

/** Header cell that toggles the table's sort between its two directions. */
function SortableHead({
  label,
  active,
  dir,
  onSort,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onSort: () => void;
}) {
  const Icon = !active
    ? ArrowUpDownIcon
    : dir === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon;
  return (
    <TableHead
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          "-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground",
          !active && "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="size-3 shrink-0 opacity-60" />
      </button>
    </TableHead>
  );
}

/**
 * The repo view's Dependencies tab. Two sources feed it: the deterministic manifest parsers
 * (the analysis snapshot) and — for monorepos and manifest formats no parser reads — an engine
 * scan the user triggers here. Latest versions come from PyPI where a registry client exists,
 * and otherwise from whatever the engine scan recorded.
 */
export function DependenciesPanel({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const { data: inventory, isPending } = useDependencyInventoryQuery(repoId);
  const { data: freshness } = useDependencyFreshnessQuery(repoId);
  const { mutate: check, isPending: checking } =
    useGenerateDependencyFreshnessMutation(repoId);
  const { mutate: aiScan, isPending: scanning } =
    useAiDependencyScanMutation(repoId);

  const dependencies = useMemo(
    () => inventory?.dependencies ?? [],
    [inventory],
  );
  const aiPending = scanning || (inventory?.ai_pending ?? false);
  const unparsed = useMemo(
    () => (inventory?.manifests ?? []).filter((m) => !m.parsed),
    [inventory],
  );

  const freshByName = useMemo(() => {
    const map = new Map<string, DependencyFreshnessItem>();
    for (const item of freshness?.items ?? []) map.set(item.name, item);
    return map;
  }, [freshness]);

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [criticality, setCriticality] = useState(ALL_CRITICALITIES);

  const sortBy = (key: SortKey) => {
    // Re-clicking the active column flips direction; a new column starts ascending,
    // which for criticality means most critical first.
    if (key === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDir("asc");
    }
  };

  const rows = useMemo(() => {
    const gapOf = (name: string) => freshByName.get(name)?.gap ?? "unknown";
    const filtered =
      criticality === ALL_CRITICALITIES
        ? dependencies
        : dependencies.filter((d) => gapOf(d.name) === criticality);
    const sign = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "name") return sign * a.name.localeCompare(b.name);
      const rank = (n: string) => {
        const i = CRITICALITY.indexOf(gapOf(n));
        return i === -1 ? CRITICALITY.length : i;
      };
      // Equally critical dependencies stay alphabetical rather than in parse order.
      return (
        sign * (rank(a.name) - rank(b.name)) || a.name.localeCompare(b.name)
      );
    });
  }, [dependencies, freshByName, sortKey, dir, criticality]);

  return (
    <div className="space-y-4">
      {/* Only until an engine scan has actually filled the gap — after that it's noise. */}
      {inventory?.ai_recommended && inventory.ai_count === 0 ? (
        <Card className="flex flex-col gap-3 border-warning/30 bg-warning/5 p-4 sm:flex-row sm:items-center">
          <FileWarningIcon className="size-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium">
              {unparsed.length > 0
                ? t("repositories.view.dep_coverage_partial")
                : t("repositories.view.dep_coverage_none")}
            </p>
            <p className="text-xs text-muted-foreground">
              {unparsed.length > 0
                ? t("repositories.view.dep_coverage_body", {
                    count: unparsed.length,
                  })
                : t("repositories.view.dep_coverage_none_body")}
            </p>
            {unparsed.length > 0 ? (
              <p className="truncate font-mono text-xs text-muted-foreground">
                {unparsed
                  .slice(0, 6)
                  .map((m) => m.path)
                  .join(" · ")}
                {unparsed.length > 6 ? " …" : ""}
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <CardHeader className="flex flex-col items-start justify-between gap-3 p-6 pb-0 sm:flex-row sm:items-center">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {t("repositories.view.dependencies_title")}
            {dependencies.length > 0 ? (
              <span className="text-sm font-normal text-muted-foreground">
                (
                {criticality === ALL_CRITICALITIES
                  ? dependencies.length
                  : `${rows.length}/${dependencies.length}`}
                )
              </span>
            ) : null}
            {(inventory?.ai_count ?? 0) > 0 ? (
              <Badge variant="secondary" className="text-[10px]">
                {t("repositories.view.dep_ai_found", {
                  count: inventory?.ai_count ?? 0,
                })}
              </Badge>
            ) : null}
          </CardTitle>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {dependencies.length > 0 ? (
              <Select
                value={criticality}
                onValueChange={(next) =>
                  setCriticality(next ?? ALL_CRITICALITIES)
                }
              >
                <SelectTrigger
                  className="w-40"
                  aria-label={t("repositories.view.dep_criticality_filter")}
                >
                  <SelectValue>
                    {(value) =>
                      value === ALL_CRITICALITIES
                        ? t("repositories.view.dep_criticality_all")
                        : t(gapLabelKey(String(value)))
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CRITICALITIES}>
                    {t("repositories.view.dep_criticality_all")}
                  </SelectItem>
                  {CRITICALITY.map((gap) => (
                    <SelectItem key={gap} value={gap}>
                      {t(gapLabelKey(gap))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={aiPending}
              onClick={() =>
                aiScan(undefined, {
                  onSuccess: () =>
                    toast.success(t("repositories.view.dep_ai_toast")),
                })
              }
            >
              {aiPending ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <SparklesIcon className="size-3.5" />
              )}
              {aiPending
                ? t("repositories.view.dep_ai_scanning")
                : (inventory?.ai_count ?? 0) > 0
                  ? t("repositories.view.dep_ai_rescan")
                  : t("repositories.view.dep_ai_scan")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={checking || dependencies.length === 0}
              onClick={() =>
                check(undefined, {
                  onSuccess: () =>
                    toast.success(t("repositories.view.dep_freshness_toast")),
                })
              }
            >
              {checking ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-3.5" />
              )}
              {checking
                ? t("repositories.view.dep_checking")
                : freshness?.generated
                  ? t("repositories.view.dep_recheck")
                  : t("repositories.view.dep_check")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-4">
          {dependencies.length === 0 || rows.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              {isPending
                ? t("repositories.view.dependencies_loading")
                : dependencies.length > 0
                  ? t("repositories.view.dep_filter_empty")
                  : t("repositories.view.dependencies_empty")}
            </p>
          ) : (
            <div className="max-h-[36rem] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead
                      label={t("repositories.view.dep_name")}
                      active={sortKey === "name"}
                      dir={dir}
                      onSort={() => sortBy("name")}
                    />
                    <TableHead>{t("repositories.view.dep_version")}</TableHead>
                    <TableHead>{t("repositories.view.dep_latest")}</TableHead>
                    <SortableHead
                      label={t("repositories.view.dep_criticality")}
                      active={sortKey === "criticality"}
                      dir={dir}
                      onSort={() => sortBy("criticality")}
                    />
                    <TableHead>{t("repositories.view.dep_gain")}</TableHead>
                    <TableHead>{t("repositories.view.dep_manifest")}</TableHead>
                    <TableHead>
                      {t("repositories.view.dep_ecosystem")}
                    </TableHead>
                    <TableHead>{t("repositories.view.dep_scope")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((dep, i) => {
                    const fresh = freshByName.get(dep.name);
                    // The registry answer wins; the engine's recollection is the fallback for
                    // ecosystems no registry client covers.
                    const latest = fresh?.latest ?? dep.latest_version;
                    return (
                      <TableRow key={`${dep.name}-${dep.manifest_file}-${i}`}>
                        <TableCell className="align-top font-medium">
                          <span className="flex items-center gap-1.5">
                            {dep.name}
                            {dep.source === "ai" ? (
                              <span
                                title={t("repositories.view.dep_source_ai")}
                              >
                                <SparklesIcon className="size-3 shrink-0 text-muted-foreground" />
                              </span>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell className="align-top font-mono text-xs text-muted-foreground">
                          {dep.version ?? "—"}
                        </TableCell>
                        <TableCell className="align-top">
                          {latest ? (
                            <span className="flex items-center gap-2">
                              {fresh?.latest_url ? (
                                <a
                                  href={fresh.latest_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="group inline-flex items-center gap-1 font-mono text-xs hover:text-foreground hover:underline"
                                  title={t("repositories.view.dep_changelog")}
                                >
                                  {latest}
                                  <ExternalLinkIcon className="size-3 opacity-50 group-hover:opacity-100" />
                                </a>
                              ) : (
                                <span className="font-mono text-xs">
                                  {latest}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          {fresh?.gap && fresh.gap !== "unknown" ? (
                            <UpgradeGapBadge gap={fresh.gap} />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          <p className="w-80 whitespace-normal text-xs leading-relaxed text-muted-foreground">
                            {fresh?.gain ?? "—"}
                          </p>
                        </TableCell>
                        <TableCell className="align-top font-mono text-xs text-muted-foreground">
                          {dep.manifest_file}
                        </TableCell>
                        <TableCell className="align-top text-muted-foreground">
                          {dep.ecosystem}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant={dep.is_dev ? "secondary" : "outline"}>
                            {dep.is_dev
                              ? t("repositories.view.dep_dev")
                              : t("repositories.view.dep_prod")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
