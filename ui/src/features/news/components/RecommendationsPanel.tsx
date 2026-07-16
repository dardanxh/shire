import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon, Loader2Icon, SparklesIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTrackedJob } from "@/features/jobs";
import {
  useAcceptRecommendationMutation,
  useDismissRecommendationMutation,
  useGenerateRecommendationsMutation,
  useNewsRecommendationsQuery,
} from "../api";
import { newsKeys } from "../keys";

export function RecommendationsPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Track the generation job to completion, then pull in the fresh suggestions.
  const { track, isTracking } = useTrackedJob(() => {
    queryClient.invalidateQueries({ queryKey: newsKeys.recommendations() });
  });

  const { data } = useNewsRecommendationsQuery(isTracking);
  const { mutate: generate, isPending: isEnqueuing } =
    useGenerateRecommendationsMutation();
  const { mutate: accept } = useAcceptRecommendationMutation();
  const { mutate: dismiss } = useDismissRecommendationMutation();

  const suggested = (data ?? []).filter((r) => r.status === "suggested");
  const isGenerating = isEnqueuing || isTracking;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>{t("news.recommendations.title")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("news.recommendations.description")}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={isGenerating}
          onClick={() =>
            generate(undefined, { onSuccess: (r) => track(r.job_id) })
          }
        >
          {isGenerating ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SparklesIcon className="size-4" />
          )}
          {isGenerating
            ? t("news.recommendations.generating")
            : t("news.recommendations.generate")}
        </Button>
      </CardHeader>
      <CardContent>
        {suggested.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("news.recommendations.empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {suggested.map((rec) => (
              <li
                key={rec.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{rec.name}</p>
                  {rec.rationale ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {rec.rationale}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      accept(rec.id, {
                        onSuccess: (topic) =>
                          toast.success(
                            t("news.recommendations.toast_accepted", {
                              name: topic.name,
                            }),
                          ),
                      })
                    }
                  >
                    <CheckIcon className="size-4" />
                    {t("news.recommendations.accept")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismiss(rec.id)}
                  >
                    <XIcon className="size-4" />
                    {t("news.recommendations.dismiss")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
