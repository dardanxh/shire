import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useRunDetailQuery } from "@/features/briefing/api";
import { RunFeedback } from "@/features/briefing/components/RunFeedback";
import type { HobitOut, HobitRunOut } from "@/lib/api";
import { formatTimeAgo } from "@/lib/format";

/** Runs whose response the user can rate (the backend rejects the rest with a 409). */
const RATABLE_STATUSES = ["completed", "parse_failed"];

const PAGE_SIZE = 10;

/** Settled results of the repo's assigned hobits, newest first, as expand-on-demand cards.
 * The full narrative is only fetched when a card is opened. */
export function HobitRunResults({
  repoId,
  runs,
  assigned,
}: {
  repoId: string;
  runs: HobitRunOut[];
  assigned: HobitOut[];
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(PAGE_SIZE);

  const nameOf = new Map(assigned.map((h) => [h.slug, h.name]));
  // Queued runs have no result yet — the assigned-hobit row already shows them as running.
  const settled = runs.filter(
    (r) => r.status !== "queued" && nameOf.has(r.hobit_slug),
  );

  if (settled.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("repositories.hobits.results.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {settled.slice(0, visible).map((run) => (
          <RunResultCard
            key={run.id}
            repoId={repoId}
            run={run}
            hobitName={nameOf.get(run.hobit_slug) ?? run.hobit_slug}
          />
        ))}
        {settled.length > visible && (
          <div className="flex justify-center">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
            >
              {t("repositories.hobits.results.show_more")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** One run: headline row that expands into the full narrative + feedback. */
function RunResultCard({
  repoId,
  run,
  hobitName,
}: {
  repoId: string;
  run: HobitRunOut;
  hobitName: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 p-3 text-left text-sm"
      >
        {open ? (
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="font-medium">{hobitName}</span>
            {run.tier && (
              <Badge variant="outline" className="text-xs">
                {run.tier}
              </Badge>
            )}
            {run.status !== "completed" && (
              <Badge variant="destructive" className="text-xs">
                {t(`repositories.hobits.status.${run.status}`, {
                  defaultValue: run.status,
                })}
              </Badge>
            )}
          </div>
          {run.headline && (
            <p className="truncate text-xs text-muted-foreground">
              {run.headline}
            </p>
          )}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatTimeAgo(run.started_at)}
        </span>
      </button>
      {open && <RunResultDetail repoId={repoId} run={run} />}
    </div>
  );
}

/** Expanded body: fetches the run's full output on first open. */
function RunResultDetail({
  repoId,
  run,
}: {
  repoId: string;
  run: HobitRunOut;
}) {
  const { t } = useTranslation();
  const { data, isPending } = useRunDetailQuery(repoId, run.id);

  return (
    <div className="space-y-3 border-t border-border p-3">
      {isPending || !data ? (
        <Skeleton className="h-32 w-full" />
      ) : data.narrative ? (
        <Textarea
          value={data.narrative}
          readOnly
          spellCheck={false}
          className="min-h-[16rem] font-mono text-xs leading-relaxed"
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {data.error ?? t("repositories.hobits.results.no_detail")}
        </p>
      )}
      {data && RATABLE_STATUSES.includes(data.status) ? (
        <>
          <Separator />
          <RunFeedback
            repoId={repoId}
            runId={run.id}
            feedback={data.feedback ?? null}
          />
        </>
      ) : null}
    </div>
  );
}
