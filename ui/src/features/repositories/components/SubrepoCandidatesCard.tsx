import { Loader2Icon, PackagePlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAddSubrepoMutation, useSubrepoCandidatesQuery } from "../api";

/**
 * Surfaces monorepo subprojects that showed up in the clone (e.g. after a poll pulled a new
 * folder) but aren't onboarded yet — each with a one-click Add. Renders nothing unless the
 * family already has subrepos and new candidates exist, so it stays invisible for plain repos.
 */
export function SubrepoCandidatesCard({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const { data: candidates } = useSubrepoCandidatesQuery(repoId);
  const {
    mutate: addSubrepo,
    isPending,
    variables,
  } = useAddSubrepoMutation(repoId);

  if (!candidates || candidates.length === 0) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-sm">
          {t("repositories.subrepos.detected_title", {
            count: candidates.length,
          })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {t("repositories.subrepos.detected_body")}
        </p>
        <ul className="space-y-1.5">
          {candidates.map((candidate) => (
            <li
              key={candidate.subpath}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-1.5"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-mono text-xs">
                  {candidate.subpath}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {candidate.manifest}
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() =>
                  addSubrepo(candidate.subpath, {
                    onSuccess: () =>
                      toast.success(
                        t("repositories.subrepos.added", {
                          slug: candidate.subpath,
                        }),
                      ),
                  })
                }
              >
                {isPending && variables === candidate.subpath ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <PackagePlusIcon className="size-3.5" />
                )}
                {t("repositories.subrepos.add")}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
