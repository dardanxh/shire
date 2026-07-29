import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTrackedJob } from "@/features/jobs";
import {
  categoryNamesById,
  groupSlugsByCategoryId,
  TechnologyLogo,
  useTechnologyCategoriesQuery,
  useTechnologyCorpusQuery,
} from "@/features/technologies";
import { formatDateTime } from "@/lib/format";
import { useGenerateTechStackMutation, useTechStackQuery } from "../api";
import { repositoryKeys } from "../keys";
import { ArtifactVersionHistory } from "./ArtifactVersionHistory";

export function TechStackPanel({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useTechStackQuery(repoId);
  const { mutate: generate, isPending: isQueueing } =
    useGenerateTechStackMutation(repoId);
  const { data: corpus } = useTechnologyCorpusQuery();
  const { data: categoryTree } = useTechnologyCategoriesQuery();
  const namesById = categoryNamesById(categoryTree);
  const groupSlugs = groupSlugsByCategoryId(categoryTree);

  const { track, isTracking } = useTrackedJob((job) => {
    queryClient.invalidateQueries({
      queryKey: repositoryKeys.techStack(repoId),
    });
    if (job.status === "succeeded") {
      toast.success(t("repositories.view.tech_stack.toast_done"));
    } else {
      toast.error(job.error ?? t("repositories.view.tech_stack.toast_failed"));
    }
  });
  const isPending = isQueueing || isTracking;

  const run = () =>
    generate(undefined, {
      onSuccess: (job) => {
        toast.success(t("repositories.view.tech_stack.toast"));
        track(job.id);
      },
    });

  const bySlug = new Map((corpus ?? []).map((x) => [x.slug, x]));
  const items = data?.items ?? [];
  const matched = items.filter((item) => item.slug && bySlug.has(item.slug));
  const unmatched = items.filter(
    (item) => !item.slug || !bySlug.has(item.slug),
  );

  // Group matched technologies by their catalog category for a stack-shaped read.
  const groups = new Map<
    string,
    {
      item: (typeof matched)[number];
      technology: NonNullable<ReturnType<typeof bySlug.get>>;
    }[]
  >();
  for (const item of matched) {
    // biome-ignore lint/style/noNonNullAssertion: filtered above
    const technology = bySlug.get(item.slug!)!;
    const category =
      namesById.get(technology.category_id) ??
      t("repositories.view.tech_stack.other_category");
    const bucket = groups.get(category) ?? [];
    bucket.push({ item, technology });
    groups.set(category, bucket);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <CardTitle>{t("repositories.view.tech_stack.title")}</CardTitle>
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
            ? t("repositories.view.tech_stack.generating")
            : data?.generated
              ? t("repositories.view.tech_stack.regenerate")
              : t("repositories.view.tech_stack.generate")}
        </Button>
      </CardHeader>
      <CardContent>
        {data?.generated ? (
          <div className="space-y-6">
            {[...groups.entries()].map(([category, entries]) => (
              <section key={category} className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {category}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {entries.map(({ item, technology }) => (
                    <Link
                      key={technology.id}
                      to="/technologies/$id"
                      params={{ id: technology.id }}
                      title={item.evidence ?? undefined}
                      className="flex items-center gap-2 rounded-lg border bg-card py-1.5 pr-3 pl-1.5 transition-colors hover:bg-muted/50"
                    >
                      <TechnologyLogo
                        name={technology.name}
                        homepageUrl={technology.homepage_url}
                        groupSlug={groupSlugs.get(technology.category_id)}
                        className="size-6 rounded-md"
                      />
                      <span className="text-sm font-medium">
                        {technology.name}
                      </span>
                      {item.role ? (
                        <span className="text-xs text-muted-foreground">
                          {item.role}
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              </section>
            ))}

            {unmatched.length > 0 ? (
              <section className="space-y-2 border-t pt-4">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("repositories.view.tech_stack.not_in_catalog")}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {unmatched.map((item) => (
                    <Badge
                      key={item.detected_name}
                      variant="outline"
                      title={item.evidence ?? undefined}
                      className="text-muted-foreground"
                    >
                      {item.detected_name}
                      {item.role ? (
                        <span className="text-muted-foreground/60">
                          · {item.role}
                        </span>
                      ) : null}
                    </Badge>
                  ))}
                </div>
              </section>
            ) : null}

            {matched.length === 0 && unmatched.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("repositories.view.tech_stack.none_detected")}
              </p>
            ) : null}

            {data.generated_at ? (
              <p className="text-xs text-muted-foreground">
                {t("repositories.view.tech_stack.generated_at", {
                  when: formatDateTime(data.generated_at),
                })}
              </p>
            ) : null}
            <ArtifactVersionHistory
              repoId={repoId}
              artifact="tech-stack"
              renderContent={(version) => (
                <div className="flex flex-wrap gap-1.5">
                  {(Array.isArray(version.content.items)
                    ? version.content.items
                    : []
                  ).map((item: { detected_name?: string }, index: number) => (
                    <Badge
                      key={item.detected_name ?? index}
                      variant="secondary"
                      className="text-[11px]"
                    >
                      {item.detected_name}
                    </Badge>
                  ))}
                </div>
              )}
            />
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {data?.agent_available === false
              ? t("repositories.view.tech_stack.unavailable")
              : t("repositories.view.tech_stack.empty")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
