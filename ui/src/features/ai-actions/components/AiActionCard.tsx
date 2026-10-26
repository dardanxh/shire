import { Link } from "@tanstack/react-router";
import {
  CalendarClockIcon,
  CircleSlashIcon,
  FileTextIcon,
  Loader2Icon,
  PlayIcon,
  TerminalIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime, formatTimeAgo, formatUsd } from "@/lib/format";
import {
  type AiAction,
  isInFlight,
  useCancelAiActionMutation,
  useRunAiActionMutation,
} from "../api";
import { describeSchedule } from "../schedule";
import { StatusBadge } from "./StatusBadge";

/**
 * One action: what it runs, when, and how its latest run went. The whole card opens the
 * report; the footer buttons run (or withdraw a queued run) without leaving the grid.
 */
export function AiActionCard({ action }: { action: AiAction }) {
  const { t } = useTranslation();
  const { mutate: run, isPending: isQueueing } = useRunAiActionMutation();
  const { mutate: cancel, isPending: isCancelling } =
    useCancelAiActionMutation();
  const inFlight = isInFlight(action);

  return (
    <Card className="relative flex h-full flex-col gap-3 p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <Link
          to="/ai-actions/$id"
          params={{ id: action.id }}
          className="font-medium leading-snug after:absolute after:inset-0 after:content-['']"
        >
          {action.title}
        </Link>
        <StatusBadge status={action.status} />
      </div>

      <p className="line-clamp-2 rounded-md bg-muted/60 px-2 py-1.5 font-mono text-xs text-muted-foreground">
        {action.prompt}
      </p>

      <dl className="grid gap-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CalendarClockIcon className="size-3.5" />
          <dt className="sr-only">{t("ai_actions.card.schedule")}</dt>
          <dd>
            {describeSchedule(action.schedule, t)}
            {action.schedule !== "manual" && !action.enabled
              ? ` · ${t("ai_actions.card.paused")}`
              : null}
            {action.next_run_at
              ? ` · ${t("ai_actions.card.next", { at: formatDateTime(action.next_run_at) })}`
              : null}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <FileTextIcon className="size-3.5" />
          <dt className="sr-only">{t("ai_actions.card.last_report")}</dt>
          <dd>
            {action.last_report_at
              ? t("ai_actions.card.report_from", {
                  ago: formatTimeAgo(action.last_report_at),
                })
              : t("ai_actions.card.no_report")}
            {action.last_cost_usd != null
              ? ` · ${formatUsd(action.last_cost_usd)}`
              : null}
          </dd>
        </div>
        {action.allow_shell ? (
          <div className="flex items-center gap-1.5">
            <TerminalIcon className="size-3.5" />
            <dd>{t("ai_actions.card.shell")}</dd>
          </div>
        ) : null}
      </dl>

      {action.status === "failed" && action.last_error ? (
        <p className="line-clamp-2 text-xs text-destructive">
          {action.last_error}
        </p>
      ) : null}

      {/* Above the card-wide link overlay, so the buttons stay clickable. */}
      <div className="relative z-10 mt-auto flex items-center gap-2 pt-1">
        {action.status === "pending" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={isCancelling}
            onClick={() =>
              cancel(action.id, {
                onSuccess: () => toast.success(t("ai_actions.toast.cancelled")),
              })
            }
          >
            {isCancelling ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <CircleSlashIcon />
            )}
            {t("ai_actions.actions.cancel")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={inFlight || isQueueing}
            onClick={() =>
              run(action.id, {
                onSuccess: () =>
                  toast.success(
                    t("ai_actions.toast.queued", { title: action.title }),
                  ),
              })
            }
          >
            {isQueueing || inFlight ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <PlayIcon />
            )}
            {inFlight
              ? t("ai_actions.status.running")
              : t("ai_actions.actions.run")}
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {action.model ?? t("ai_actions.card.default_model")}
        </span>
      </div>
    </Card>
  );
}
