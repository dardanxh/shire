import { Loader2Icon, PlayIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { HobitMultiSelect } from "@/components/shared/HobitMultiSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHobitsQuery } from "@/features/hobits/api";
import type { HobitOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  useRepoHobitRunsQuery,
  useRepoHobitsQuery,
  useRunRepoHobitMutation,
  useSetRepoHobitsMutation,
} from "../api";

export function HobitsPanel({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const { data: assigned, isPending } = useRepoHobitsQuery(repoId);
  const { data: runs } = useRepoHobitRunsQuery(repoId);
  const run = useRunRepoHobitMutation(repoId);

  if (isPending) return <Skeleton className="h-64 w-full" />;

  const lastRunFor = (slug: string) => runs?.find((r) => r.hobit_slug === slug);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("repositories.hobits.assigned_title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(assigned?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("repositories.hobits.assigned_empty")}
            </p>
          ) : (
            (assigned ?? []).map((hobit) => {
              const last = lastRunFor(hobit.slug);
              const running = run.isPending && run.variables === hobit.slug;
              return (
                <div
                  key={hobit.slug}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{hobit.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {hobit.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {last
                        ? t("repositories.hobits.last_run", {
                            status: last.status,
                            when: formatDateTime(last.started_at),
                          })
                        : t("repositories.hobits.never")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={run.isPending}
                    onClick={() =>
                      run.mutate(hobit.slug, {
                        onSuccess: (data) =>
                          toast.success(
                            t("repositories.hobits.run_done", {
                              status: data.status,
                            }),
                          ),
                      })
                    }
                  >
                    {running ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <PlayIcon className="size-4" />
                    )}
                    {running
                      ? t("repositories.hobits.running")
                      : t("repositories.hobits.run")}
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <AssignEditor repoId={repoId} assigned={assigned ?? []} />
    </div>
  );
}

/** Edit which hobits are assigned to the repo (checkbox list of all non-foundational hobits). */
function AssignEditor({
  repoId,
  assigned,
}: {
  repoId: string;
  assigned: HobitOut[];
}) {
  const { t } = useTranslation();
  const { data: all } = useHobitsQuery();
  const { mutate: save, isPending } = useSetRepoHobitsMutation();
  const assignedSlugs = assigned.map((h) => h.slug).join(",");

  return (
    <Editor
      key={assignedSlugs}
      initial={new Set(assigned.map((h) => h.slug))}
      hobits={(all ?? [])
        .filter((h) => h.category !== "Foundational")
        .map((h) => ({
          slug: h.slug,
          name: h.name,
          category: h.category,
          tags: h.tags,
        }))}
      isPending={isPending}
      onSave={(slugs) =>
        save(
          { id: repoId, slugs },
          { onSuccess: () => toast.success(t("repositories.hobits.saved")) },
        )
      }
    />
  );
}

function Editor({
  initial,
  hobits,
  isPending,
  onSave,
}: {
  initial: Set<string>;
  hobits: { slug: string; name: string; category: string; tags: string[] }[];
  isPending: boolean;
  onSave: (slugs: string[]) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(initial);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("repositories.hobits.manage_title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <HobitMultiSelect
          hobits={hobits}
          selected={selected}
          onToggle={(v) =>
            setSelected((s) => {
              const next = new Set(s);
              if (next.has(v)) next.delete(v);
              else next.add(v);
              return next;
            })
          }
          emptyLabel={t("repositories.hobits.none_available")}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => onSave([...selected])}
          >
            {t("repositories.hobits.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
