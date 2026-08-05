import {
  CircleCheckIcon,
  CircleIcon,
  Loader2Icon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { InspectionItemOut } from "@/lib/api";
import { formatTimeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useInspectionsQuery, useRunInspectionsMutation } from "../api";
import { completionToneClass, inspectionLabel } from "../inspections";

/**
 * Every inspection a repository can have run, in one place: what's done, what's left, and a
 * button per row plus one for everything remaining. Hobits and principles are absent by
 * design — they stay hand-assigned on their own tabs.
 */
export function ActionsPanel({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const { data, isPending } = useInspectionsQuery(repoId);
  const { mutate: runInspections, isPending: isStarting } =
    useRunInspectionsMutation();

  const groups = useMemo(() => {
    const items = data?.items ?? [];
    return [
      { key: "ai", items: items.filter((i) => i.group === "ai") },
      { key: "integration", items: items.filter((i) => i.group !== "ai") },
    ].filter((group) => group.items.length > 0);
  }, [data]);

  const remaining = (data?.items ?? []).filter(
    (item) => !item.done && item.runnable && !item.in_flight,
  );

  const start = (keys: string[]) =>
    runInspections(
      { repositoryId: repoId, keys },
      {
        onSuccess: (result) => {
          const queued = result.queued?.length ?? 0;
          if (queued === 0) {
            toast.info(t("repositories.view.actions.none_started"));
            return;
          }
          toast.success(
            t("repositories.view.actions.started", { count: queued }),
          );
        },
      },
    );

  if (isPending || !data) {
    return (
      <Card className="gap-4 p-5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-1.5 w-full" />
        <Skeleton className="h-40 w-full" />
      </Card>
    );
  }

  const pct =
    data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            {t("repositories.view.actions.title")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("repositories.view.actions.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "text-sm font-medium tabular-nums",
              completionToneClass(data.completed, data.total),
            )}
          >
            {t("repositories.view.actions.progress", {
              done: data.completed,
              total: data.total,
            })}
          </span>
          <Button
            size="sm"
            disabled={isStarting || remaining.length === 0}
            onClick={() => start(remaining.map((item) => item.key))}
          >
            {isStarting ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <SparklesIcon className="size-3.5" />
            )}
            {remaining.length > 0
              ? t("repositories.view.actions.run_all", {
                  count: remaining.length,
                })
              : t("repositories.view.actions.all_done")}
          </Button>
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      {groups.map((group) => (
        <section key={group.key} className="space-y-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t(`repositories.view.actions.groups.${group.key}`)}
          </h3>
          <ul>
            {group.items.map((item) => (
              <InspectionRow
                key={item.key}
                item={item}
                disabled={isStarting}
                onRun={() => start([item.key])}
              />
            ))}
          </ul>
        </section>
      ))}
    </Card>
  );
}

function InspectionRow({
  item,
  disabled,
  onRun,
}: {
  item: InspectionItemOut;
  disabled: boolean;
  onRun: () => void;
}) {
  const { t } = useTranslation();
  const reason = item.unavailable_reason
    ? t(`repositories.view.actions.reasons.${item.unavailable_reason}`)
    : undefined;

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-md px-2 py-2",
        !item.done && "hover:bg-muted/40",
      )}
    >
      {item.in_flight ? (
        <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : item.done ? (
        <CircleCheckIcon className="size-4 shrink-0 text-success" />
      ) : (
        <CircleIcon className="size-4 shrink-0 text-muted-foreground/50" />
      )}
      <span
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 text-sm",
          item.done && "text-muted-foreground",
        )}
      >
        <span className="truncate">{inspectionLabel(item.key, t)}</span>
        {/* Why it can't run lives in a tooltip on this icon — the row stays scannable. */}
        {!item.runnable && !item.in_flight && reason ? (
          <Tooltip>
            <TooltipTrigger
              type="button"
              aria-label={reason}
              className="shrink-0 text-warning"
            >
              <TriangleAlertIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{reason}</TooltipContent>
          </Tooltip>
        ) : null}
      </span>
      {item.done && item.generated_at ? (
        <span className="text-xs text-muted-foreground">
          {formatTimeAgo(item.generated_at)}
        </span>
      ) : null}
      {item.in_flight ? (
        <span className="text-xs text-muted-foreground">
          {t("repositories.view.actions.running")}
        </span>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || !item.runnable}
          onClick={onRun}
        >
          {t("repositories.view.actions.run")}
        </Button>
      )}
    </li>
  );
}
