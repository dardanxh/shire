import { Link, useNavigate } from "@tanstack/react-router";
import {
  ActivityIcon,
  AlertTriangleIcon,
  CircleSlashIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileQuestionIcon,
  Loader2Icon,
  PencilIcon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { extractErrorMessage } from "@/lib/api";
import { formatDateTime, formatTimeAgo, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  type AiAction,
  isInFlight,
  reportUrl,
  useAiActionQuery,
  useCancelAiActionMutation,
  useRunAiActionMutation,
} from "../api";
import { describeSchedule } from "../schedule";
import { AiActionFormDialog } from "./AiActionFormDialog";
import { DeleteAiActionDialog } from "./DeleteAiActionDialog";
import { RunnerBanner } from "./RunnerBanner";
import { StatusBadge } from "./StatusBadge";

/** One action: its controls, how the latest run went, and the latest report full-size. */
export function AiActionViewPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: action, isPending, isError, error } = useAiActionQuery(id);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-[70vh] rounded-xl" />
      </div>
    );
  }
  if (isError || !action) {
    return (
      <p className="text-sm text-destructive">
        {t("ai_actions.load_error", { message: extractErrorMessage(error) })}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{action.title}</h1>
            <StatusBadge status={action.status} />
          </div>
          <RunMeta action={action} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RunButton action={action} />
          <Button variant="outline" onClick={() => setEditing(true)}>
            <PencilIcon />
            {t("common.actions.edit")}
          </Button>
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => setDeleting(true)}
          >
            <Trash2Icon />
            {t("common.actions.delete")}
          </Button>
        </div>
      </div>

      <RunnerBanner />

      {isInFlight(action) && action.last_job_id ? (
        <Card className="flex-row items-center gap-3 p-3 text-sm">
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          <span>
            {action.status === "running"
              ? t("ai_actions.view.running", {
                  ago: formatTimeAgo(action.last_started_at),
                })
              : t("ai_actions.view.queued")}
          </span>
          <Link
            to="/jobs/$id"
            params={{ id: action.last_job_id }}
            className={cn(
              buttonVariants({ variant: "link", size: "sm" }),
              "ml-auto",
            )}
          >
            <ActivityIcon />
            {t("ai_actions.view.live")}
          </Link>
        </Card>
      ) : null}

      {action.status === "failed" ? (
        <Card className="flex-row items-start gap-3 border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-destructive">
              {t("ai_actions.view.failed", {
                at: formatDateTime(action.last_finished_at),
              })}
            </p>
            <p className="whitespace-pre-wrap break-words text-muted-foreground">
              {action.last_error}
            </p>
            {action.has_report ? (
              <p className="text-xs text-muted-foreground">
                {t("ai_actions.view.showing_previous")}
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      <ReportFrame action={action} />

      <details className="rounded-lg border bg-card p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          {t("ai_actions.view.prompt")}
        </summary>
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-md bg-muted/60 p-3 font-mono text-xs">
          {action.prompt}
        </pre>
      </details>

      <AiActionFormDialog
        action={action}
        open={editing}
        onOpenChange={setEditing}
      />
      <DeleteAiActionDialog
        action={action}
        open={deleting}
        onOpenChange={setDeleting}
        onDeleted={() => navigate({ to: "/ai-actions" })}
      />
    </div>
  );
}

function RunMeta({ action }: { action: AiAction }) {
  const { t } = useTranslation();
  const parts = [
    describeSchedule(action.schedule, t) +
      (action.schedule !== "manual" && !action.enabled
        ? ` (${t("ai_actions.card.paused")})`
        : ""),
    action.next_run_at
      ? t("ai_actions.card.next", { at: formatDateTime(action.next_run_at) })
      : null,
    action.model ?? t("ai_actions.card.default_model"),
    action.last_duration_seconds != null
      ? t("ai_actions.view.took", {
          seconds: Math.round(action.last_duration_seconds),
        })
      : null,
    action.last_cost_usd != null ? formatUsd(action.last_cost_usd) : null,
  ].filter(Boolean);
  return <p className="text-sm text-muted-foreground">{parts.join(" · ")}</p>;
}

function RunButton({ action }: { action: AiAction }) {
  const { t } = useTranslation();
  const { mutate: run, isPending: isQueueing } = useRunAiActionMutation();
  const { mutate: cancel, isPending: isCancelling } =
    useCancelAiActionMutation();

  if (action.status === "pending") {
    return (
      <Button
        variant="outline"
        disabled={isCancelling}
        onClick={() =>
          cancel(action.id, {
            onSuccess: () => toast.success(t("ai_actions.toast.cancelled")),
          })
        }
      >
        <CircleSlashIcon />
        {t("ai_actions.actions.cancel")}
      </Button>
    );
  }
  const busy = isQueueing || action.status === "running";
  return (
    <Button
      disabled={busy}
      onClick={() =>
        run(action.id, {
          onSuccess: () =>
            toast.success(
              t("ai_actions.toast.queued", { title: action.title }),
            ),
        })
      }
    >
      {busy ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
      {action.status === "running"
        ? t("ai_actions.status.running")
        : t("ai_actions.actions.run")}
    </Button>
  );
}

/**
 * The report in a sandboxed iframe: an opaque origin (no `allow-same-origin`), so model-written
 * HTML built from Slack/Jira/GitHub text can run its own inline scripts but can't touch the app.
 * The backend adds a matching `sandbox` CSP for when the report is opened directly.
 */
function ReportFrame({ action }: { action: AiAction }) {
  const { t } = useTranslation();
  if (!action.has_report) {
    return (
      <Card className="items-center gap-3 p-10 text-center">
        <FileQuestionIcon className="size-8 text-muted-foreground" />
        <p className="font-medium">{t("ai_actions.view.no_report_title")}</p>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("ai_actions.view.no_report_body")}
        </p>
      </Card>
    );
  }
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
        <span>
          {t("ai_actions.view.report_from", {
            at: formatDateTime(action.last_report_at),
            ago: formatTimeAgo(action.last_report_at),
          })}
        </span>
        {action.last_report_format === "text" ? (
          <span className="text-warning">
            · {t("ai_actions.view.text_fallback")}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <a
            href={reportUrl(action)}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ExternalLinkIcon />
            {t("ai_actions.view.open_tab")}
          </a>
          <a
            href={reportUrl(action, { download: true })}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <DownloadIcon />
            {t("ai_actions.view.download")}
          </a>
        </div>
      </div>
      <iframe
        key={action.last_report_at}
        title={action.title}
        src={reportUrl(action)}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        className="h-[75vh] w-full bg-white"
      />
    </Card>
  );
}
