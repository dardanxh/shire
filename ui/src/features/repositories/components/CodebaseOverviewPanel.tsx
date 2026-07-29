import { useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTrackedJob } from "@/features/jobs";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useCodebaseOverviewQuery,
  useGenerateCodebaseOverviewMutation,
} from "../api";
import { repositoryKeys } from "../keys";
import { ArtifactVersionHistory } from "./ArtifactVersionHistory";

export function CodebaseOverviewPanel({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useCodebaseOverviewQuery(repoId);
  const { mutate: generate, isPending: isQueueing } =
    useGenerateCodebaseOverviewMutation(repoId);
  const [open, setOpen] = useState(true);

  const { track, isTracking } = useTrackedJob((job) => {
    queryClient.invalidateQueries({
      queryKey: repositoryKeys.codebaseOverview(repoId),
    });
    if (job.status === "succeeded") {
      toast.success(t("repositories.view.overview.toast_done"));
    } else {
      toast.error(job.error ?? t("repositories.view.overview.toast_failed"));
    }
  });
  const isPending = isQueueing || isTracking;

  const run = () =>
    generate(undefined, {
      onSuccess: (job) => {
        toast.success(t("repositories.view.overview.toast"));
        track(job.id);
      },
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex flex-1 items-start gap-2 text-left"
        >
          <ChevronDownIcon
            className={cn(
              "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
          />
          <CardTitle>{t("repositories.view.overview.title")}</CardTitle>
        </button>
        <Button
          size="sm"
          variant={data?.generated ? "outline" : "default"}
          disabled={isPending}
          onClick={run}
        >
          {isPending ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <SparklesIcon className="size-3.5" />
          )}
          {isPending
            ? t("repositories.view.overview.generating")
            : data?.generated
              ? t("repositories.view.overview.regenerate")
              : t("repositories.view.overview.generate")}
        </Button>
      </CardHeader>
      <CardContent className={cn(!open && "hidden")}>
        {data?.generated ? (
          <div className="space-y-5">
            {data.kind || data.domain ? (
              <div className="flex flex-wrap gap-2">
                {data.kind ? (
                  <Badge variant="default">{data.kind}</Badge>
                ) : null}
                {data.domain ? (
                  <Badge variant="secondary">{data.domain}</Badge>
                ) : null}
              </div>
            ) : null}

            {data.summary ? (
              <p className="text-lg font-medium leading-relaxed">
                {data.summary}
              </p>
            ) : null}

            {data.problem ? (
              <section className="space-y-1">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("repositories.view.overview.problem")}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {data.problem}
                </p>
              </section>
            ) : null}

            {data.features.length > 0 ? (
              <section className="space-y-1.5">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("repositories.view.overview.features")}
                </h3>
                <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
                  {data.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {data.audience ? (
              <section className="space-y-1">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("repositories.view.overview.audience")}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {data.audience}
                </p>
              </section>
            ) : null}

            {data.generated_at ? (
              <p className="text-xs text-muted-foreground">
                {t("repositories.view.overview.generated_at", {
                  when: formatDateTime(data.generated_at),
                })}
              </p>
            ) : null}
            <ArtifactVersionHistory
              repoId={repoId}
              artifact="codebase-overview"
              renderContent={(version) => (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {typeof version.content.summary === "string"
                    ? version.content.summary
                    : JSON.stringify(version.content, null, 2)}
                </p>
              )}
            />
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {data?.agent_available === false
              ? t("repositories.view.overview.unavailable")
              : t("repositories.view.overview.empty")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
