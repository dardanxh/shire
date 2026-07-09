import { Loader2Icon, PlayIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { HobitMultiSelect } from "@/components/shared/HobitMultiSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useHobitsQuery } from "@/features/hobits/api";
import type { HobitOut, HobitRunOut } from "@/lib/api";
import { formatTimeAgo } from "@/lib/format";
import {
  useRefreshHobitMutation,
  useRepoHobitRunsQuery,
  useRepoHobitsQuery,
  useRunRepoHobitMutation,
  useSetCadenceMutation,
  useSetRepoHobitsMutation,
} from "../api";

/** Cadence presets offered in the dropdown; a fifth "custom" option reveals a cron input. */
const CADENCE_PRESETS = ["manual", "hourly", "daily", "weekly"] as const;

/** Expected gap between runs per preset (ms), for the freshness heuristic. */
const CADENCE_PERIOD_MS: Record<string, number> = {
  hourly: 3_600_000,
  daily: 86_400_000,
  weekly: 604_800_000,
};

type Freshness = "fresh" | "stale" | "overdue";

/** A lightweight health read for a *scheduled* hobit: how the last result's age compares to its
 * cadence. `null` for manual hobits (nothing is expected to keep them fresh). A custom cron falls
 * back to a 2-day heuristic since we don't parse the expression client-side. */
function freshnessOf(
  hobit: HobitOut,
  last: HobitRunOut | undefined,
): Freshness | null {
  const cadence = hobit.cadence ?? "manual";
  if (cadence === "manual") return null;
  const stamp = last?.finished_at ?? last?.started_at;
  if (!stamp) return "overdue"; // scheduled but never produced a result
  const age = Date.now() - new Date(stamp).getTime();
  const period = CADENCE_PERIOD_MS[cadence] ?? 2 * 86_400_000;
  if (age <= period * 1.5) return "fresh";
  if (age <= period * 3) return "stale";
  return "overdue";
}

const FRESHNESS_VARIANT: Record<
  Freshness,
  "secondary" | "outline" | "destructive"
> = {
  fresh: "secondary",
  stale: "outline",
  overdue: "destructive",
};

export function HobitsPanel({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const { data: assigned, isPending } = useRepoHobitsQuery(repoId);
  const { data: runs } = useRepoHobitRunsQuery(repoId);
  const run = useRunRepoHobitMutation(repoId);

  if (isPending) return <Skeleton className="h-64 w-full" />;

  const lastRunFor = (slug: string) => runs?.find((r) => r.hobit_slug === slug);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("repositories.hobits.assigned_title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(assigned?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("repositories.hobits.assigned_empty")}
            </p>
          ) : (
            (assigned ?? []).map((hobit) => (
              <HobitRow
                key={hobit.slug}
                repoId={repoId}
                hobit={hobit}
                last={lastRunFor(hobit.slug)}
                run={run}
              />
            ))
          )}
        </CardContent>
      </Card>

      <AssignEditor repoId={repoId} assigned={assigned ?? []} />
    </div>
  );
}

/** One assigned hobit: identity + freshness, the cadence picker, and refresh / run actions. */
function HobitRow({
  repoId,
  hobit,
  last,
  run,
}: {
  repoId: string;
  hobit: HobitOut;
  last: HobitRunOut | undefined;
  run: ReturnType<typeof useRunRepoHobitMutation>;
}) {
  const { t } = useTranslation();
  const refresh = useRefreshHobitMutation(repoId);
  const running = run.isPending && run.variables === hobit.slug;
  const refreshing = refresh.isPending && refresh.variables === hobit.slug;
  const fresh = freshnessOf(hobit, last);
  const statusLabel = (status: string) =>
    t(`repositories.hobits.status.${status}`, { defaultValue: status });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{hobit.name}</span>
          <Badge variant="outline" className="text-xs">
            {hobit.category}
          </Badge>
          {fresh && (
            <Badge variant={FRESHNESS_VARIANT[fresh]} className="text-xs">
              {t(`repositories.hobits.freshness.${fresh}`)}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {last
            ? t("repositories.hobits.last_run", {
                status: statusLabel(last.status),
                when: formatTimeAgo(last.started_at),
              })
            : t("repositories.hobits.never")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <CadenceControl
          key={hobit.cadence ?? "manual"}
          repoId={repoId}
          hobit={hobit}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={refreshing}
          title={t("repositories.hobits.refresh_hint")}
          onClick={() =>
            refresh.mutate(hobit.slug, {
              onSuccess: (data) =>
                toast.success(
                  t("repositories.hobits.refresh_done", {
                    status: statusLabel(data.status),
                  }),
                ),
            })
          }
        >
          {refreshing ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-4" />
          )}
          {t("repositories.hobits.refresh")}
        </Button>
        <Button
          size="sm"
          disabled={run.isPending}
          onClick={() =>
            run.mutate(hobit.slug, {
              onSuccess: (data) =>
                toast.success(
                  t("repositories.hobits.run_done", { status: data.status }),
                ),
            })
          }
        >
          {running ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <PlayIcon className="size-4" />
          )}
          {running
            ? t("repositories.hobits.running")
            : t("repositories.hobits.run")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Cadence dropdown (manual / hourly / daily / weekly + custom cron). Presets save on select; a
 * custom cron saves on Apply or Enter. Keyed by the current cadence at the call site so it
 * re-seeds cleanly after a save.
 */
function CadenceControl({
  repoId,
  hobit,
}: {
  repoId: string;
  hobit: HobitOut;
}) {
  const { t } = useTranslation();
  const { mutate: save, isPending } = useSetCadenceMutation(repoId);
  const current = hobit.cadence ?? "manual";
  const isCron = current.startsWith("cron:");
  const [mode, setMode] = useState<string>(isCron ? "custom" : current);
  const [cron, setCron] = useState(isCron ? current.slice("cron:".length) : "");

  const saveCadence = (cadence: string) =>
    save(
      { slug: hobit.slug, cadence },
      {
        onSuccess: () => toast.success(t("repositories.hobits.cadence.saved")),
      },
    );

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={mode}
        onValueChange={(value) => {
          if (!value) return;
          setMode(value);
          if (value !== "custom") saveCadence(value);
        }}
        disabled={isPending}
      >
        <SelectTrigger className="h-8 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CADENCE_PRESETS.map((c) => (
            <SelectItem key={c} value={c}>
              {t(`repositories.hobits.cadence.${c}`)}
            </SelectItem>
          ))}
          <SelectItem value="custom">
            {t("repositories.hobits.cadence.custom")}
          </SelectItem>
        </SelectContent>
      </Select>
      {mode === "custom" && (
        <>
          <Input
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && cron.trim())
                saveCadence(`cron:${cron.trim()}`);
            }}
            placeholder="0 9 * * 1-5"
            aria-label={t("repositories.hobits.cadence.cron_label")}
            className="h-8 w-28 font-mono text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={isPending || !cron.trim()}
            onClick={() => saveCadence(`cron:${cron.trim()}`)}
          >
            {t("repositories.hobits.cadence.apply")}
          </Button>
        </>
      )}
    </div>
  );
}

/** Edit which hobits are assigned to the repo (checkbox list of all non-foundational hobits). */
function AssignEditor({
  repoId,
  assigned,
}: {
  repoId: string;
  assigned: HobitOut[];
}) {
  const { t } = useTranslation();
  const { data: all } = useHobitsQuery();
  const { mutate: save, isPending } = useSetRepoHobitsMutation();
  const assignedSlugs = assigned.map((h) => h.slug).join(",");

  return (
    <Editor
      key={assignedSlugs}
      initial={new Set(assigned.map((h) => h.slug))}
      hobits={(all ?? [])
        .filter((h) => h.category !== "Foundational")
        .map((h) => ({
          slug: h.slug,
          name: h.name,
          category: h.category,
          tags: h.tags,
        }))}
      isPending={isPending}
      onSave={(slugs) =>
        save(
          { id: repoId, slugs },
          { onSuccess: () => toast.success(t("repositories.hobits.saved")) },
        )
      }
    />
  );
}

function Editor({
  initial,
  hobits,
  isPending,
  onSave,
}: {
  initial: Set<string>;
  hobits: { slug: string; name: string; category: string; tags: string[] }[];
  isPending: boolean;
  onSave: (slugs: string[]) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(initial);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("repositories.hobits.manage_title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <HobitMultiSelect
          hobits={hobits}
          selected={selected}
          onToggle={(v) =>
            setSelected((s) => {
              const next = new Set(s);
              if (next.has(v)) next.delete(v);
              else next.add(v);
              return next;
            })
          }
          emptyLabel={t("repositories.hobits.none_available")}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => onSave([...selected])}
          >
            {t("repositories.hobits.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
