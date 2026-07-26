import { useQueryClient } from "@tanstack/react-query";
import {
  CircleCheckIcon,
  CircleIcon,
  GitBranchIcon,
  Loader2Icon,
  RefreshCwIcon,
  SparklesIcon,
  WandSparklesIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useTrackedJob } from "@/features/jobs";
import { formatDateTime } from "@/lib/format";
import {
  useAiReadinessQuery,
  useApplyReadinessMutation,
  useSuggestReadinessMutation,
} from "../api";
import { repositoryKeys } from "../keys";

export function AiReadinessPanel({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useAiReadinessQuery(repoId);
  const { mutate: suggest, isPending: isQueueing } =
    useSuggestReadinessMutation(repoId);
  const { mutate: apply, isPending: isApplying } =
    useApplyReadinessMutation(repoId);
  const [selected, setSelected] = useState<string[]>([]);

  const { track, isTracking } = useTrackedJob((job) => {
    queryClient.invalidateQueries({
      queryKey: repositoryKeys.aiReadiness(repoId),
    });
    if (job.status === "succeeded") {
      toast.success(t("repositories.view.ai_readiness.toast_done"));
    } else {
      toast.error(
        job.error ?? t("repositories.view.ai_readiness.toast_failed"),
      );
    }
  });
  const isSuggesting = isQueueing || isTracking;

  const runSuggest = () =>
    suggest(undefined, {
      onSuccess: (job) => {
        toast.success(t("repositories.view.ai_readiness.toast_queued"));
        track(job.id);
      },
    });

  const suggestions = data?.suggestions ?? [];
  const proposed = suggestions.filter((s) => s.status === "proposed");
  const applied = suggestions.filter((s) => s.status === "applied");
  // Selection can go stale when a run flips suggestions to applied — count and
  // submit only ids that are still proposed.
  const selectedProposed = proposed
    .filter((s) => selected.includes(s.id))
    .map((s) => s.id);
  const allSelected =
    proposed.length > 0 && selectedProposed.length === proposed.length;

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const toggleAll = () =>
    setSelected(allSelected ? [] : proposed.map((s) => s.id));

  const runApply = () =>
    apply(selectedProposed, {
      onSuccess: () => {
        toast.success(t("repositories.view.ai_readiness.apply_queued"));
        setSelected([]);
      },
    });

  const executions = [...(data?.executions ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  return (
    <div className="space-y-6">
      {/* Current state — instant scan of assistant config artifacts in the clone */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t("repositories.view.ai_readiness.current_state")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data && !data.scanned ? (
            <p className="text-sm text-muted-foreground">
              {t("repositories.view.ai_readiness.not_scanned")}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(data?.assistants ?? []).map((assistant) => (
                <div
                  key={assistant.key}
                  className="space-y-2 rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {assistant.name}
                    </span>
                    {assistant.detected ? (
                      <Badge variant="success">
                        {t("repositories.view.ai_readiness.detected")}
                      </Badge>
                    ) : null}
                  </div>
                  <ul className="space-y-1">
                    {assistant.artifacts.map((artifact) => (
                      <li
                        key={artifact.key}
                        className="flex items-center gap-1.5"
                      >
                        {artifact.present ? (
                          <CircleCheckIcon className="size-3.5 shrink-0 text-success" />
                        ) : (
                          <CircleIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate font-mono text-xs">
                          {artifact.path}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Suggestions — AI-proposed config additions/edits, selectable for a run */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <CardTitle>
            {t("repositories.view.ai_readiness.suggestions")}
          </CardTitle>
          <Button
            size="sm"
            variant={proposed.length > 0 ? "outline" : "default"}
            disabled={isSuggesting}
            onClick={runSuggest}
          >
            {isSuggesting ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : proposed.length > 0 ? (
              <RefreshCwIcon className="size-3.5" />
            ) : (
              <SparklesIcon className="size-3.5" />
            )}
            {isSuggesting
              ? t("repositories.view.ai_readiness.suggesting")
              : proposed.length > 0
                ? t("repositories.view.ai_readiness.resuggest_button")
                : t("repositories.view.ai_readiness.suggest_button")}
          </Button>
        </CardHeader>
        <CardContent>
          {suggestions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {data?.agent_available === false
                ? t("repositories.view.ai_readiness.unavailable")
                : t("repositories.view.ai_readiness.empty")}
            </p>
          ) : (
            <div className="space-y-3">
              {proposed.length > 0 ? (
                <div className="flex items-center gap-3 px-3">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label={t("repositories.view.ai_readiness.select_all")}
                  />
                  <span className="text-sm text-muted-foreground">
                    {t("repositories.view.ai_readiness.select_all")}
                  </span>
                </div>
              ) : null}

              {proposed.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="flex items-start gap-3 rounded-lg border p-3"
                >
                  <Checkbox
                    checked={selected.includes(suggestion.id)}
                    onCheckedChange={() => toggle(suggestion.id)}
                    aria-label={t(
                      "repositories.view.ai_readiness.select_suggestion",
                      { title: suggestion.title },
                    )}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{suggestion.assistant}</Badge>
                      <Badge
                        variant={
                          suggestion.action === "add" ? "accent" : "warning"
                        }
                      >
                        {t(
                          `repositories.view.ai_readiness.action_${suggestion.action}`,
                        )}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {suggestion.path}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{suggestion.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {suggestion.detail}
                    </p>
                  </div>
                </div>
              ))}

              {applied.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="flex items-start gap-3 rounded-lg border p-3 text-muted-foreground"
                >
                  <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="success">
                        {t("repositories.view.ai_readiness.applied")}
                      </Badge>
                      <Badge variant="secondary">{suggestion.assistant}</Badge>
                      <span className="font-mono text-xs">
                        {suggestion.path}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{suggestion.title}</p>
                  </div>
                </div>
              ))}

              {selectedProposed.length > 0 ? (
                <div className="flex justify-end border-t pt-4">
                  <Button disabled={isApplying} onClick={runApply}>
                    {isApplying ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <WandSparklesIcon className="size-3.5" />
                    )}
                    {t("repositories.view.ai_readiness.make_ready", {
                      count: selectedProposed.length,
                    })}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Runs — make-ai-ready executions, newest first; omitted until one exists */}
      {executions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("repositories.view.ai_readiness.runs")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {executions.map((execution) => (
              <div
                key={execution.id}
                className="space-y-1.5 border-b pb-4 last:border-b-0 last:pb-0"
              >
                {execution.status === "pending" ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2Icon className="size-4 animate-spin" />
                    {t("repositories.view.ai_readiness.running")}
                  </p>
                ) : execution.status === "failed" ? (
                  <p className="text-sm text-destructive">
                    {execution.error ??
                      t("repositories.view.ai_readiness.run_failed")}
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <GitBranchIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="select-all font-mono">
                        {execution.branch}
                      </span>
                      {execution.commit_sha ? (
                        <Badge variant="outline" className="font-mono">
                          {execution.commit_sha.slice(0, 7)}
                        </Badge>
                      ) : null}
                    </div>
                    {execution.agent_summary ? (
                      <p className="text-sm text-muted-foreground">
                        {execution.agent_summary}
                      </p>
                    ) : null}
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(execution.created_at)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
