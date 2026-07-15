import { Loader2Icon, SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { useRepoHobitRunsQuery, useRunOnboardingMutation } from "../api";

/**
 * The Repo-Onboarding trigger inside the Context tab: runs the hobit (blocking) to write an L3
 * mental model into the pack, and shows the last run's status. The narrative appears at the top
 * of the context Markdown once the run completes.
 */
export function OnboardingRunner({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const { data: runs } = useRepoHobitRunsQuery(repoId);
  const { mutate: run, isPending: isQueueing } =
    useRunOnboardingMutation(repoId);

  const last = runs?.find((r) => r.hobit_slug === "repo-onboarding");
  const hasNarrative = last?.status === "completed";
  // The run is enqueued for the engine service; the runs query polls until it settles and
  // then refreshes the context pack, so "running" covers the whole queued window.
  const isPending = isQueueing || last?.status === "queued";

  const handleRun = () => {
    run(undefined, {
      onSuccess: () => toast.success(t("hobits.run.toast_queued")),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("hobits.run.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("hobits.run.desc")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleRun} disabled={isPending} size="sm">
            {isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SparklesIcon className="size-4" />
            )}
            {isPending
              ? t("hobits.run.running")
              : hasNarrative
                ? t("hobits.run.regenerate")
                : t("hobits.run.trigger")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {last
              ? t("hobits.run.last_run", {
                  status: last.status,
                  when: formatDateTime(last.started_at),
                })
              : t("hobits.run.never")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
