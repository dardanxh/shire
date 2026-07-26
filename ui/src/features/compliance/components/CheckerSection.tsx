import { getRouteApi } from "@tanstack/react-router";
import { PlayIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CheckboxList } from "@/components/shared/CheckboxList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRepositoriesQuery } from "@/features/repositories/api";
import { useDataRegulationsQuery } from "@/features/security";
import { useRunComplianceMutation } from "../api";

const route = getRouteApi("/compliance");

/** Toggle a value in an immutable Set. */
function toggled(set: ReadonlySet<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/** Pick repositories × standards and queue a check per pair. */
export function CheckerSection() {
  const { t } = useTranslation();
  const navigate = route.useNavigate();
  const search = route.useSearch();

  const { data: repositoriesPage } = useRepositoriesQuery({
    page: 1,
    page_size: 100,
  });
  const { data: regulationsPage } = useDataRegulationsQuery();

  // Seeded from the URL so the repositories list can deep-link a preselection.
  const [selectedRepositoryIds, setSelectedRepositoryIds] = useState<
    Set<string>
  >(() => new Set(search.repos ?? []));
  const [selectedRegulationIds, setSelectedRegulationIds] = useState<
    Set<string>
  >(new Set());

  const { mutate: runCompliance, isPending } = useRunComplianceMutation();

  const canRun =
    selectedRepositoryIds.size > 0 && selectedRegulationIds.size > 0;

  const handleRun = () => {
    runCompliance(
      {
        repository_ids: [...selectedRepositoryIds],
        regulation_ids: [...selectedRegulationIds],
      },
      {
        onSuccess: (checks) => {
          toast.success(
            t("compliance.checker.run_queued", { count: checks.length }),
          );
          setSelectedRepositoryIds(new Set());
          setSelectedRegulationIds(new Set());
          navigate({
            search: (prev) => ({
              ...prev,
              tab: "results",
              page: 1,
              repos: undefined,
            }),
          });
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("compliance.checker.repositories_title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CheckboxList
              items={(repositoriesPage?.items ?? []).map((repository) => ({
                value: repository.id,
                label: repository.slug,
              }))}
              selected={selectedRepositoryIds}
              onToggle={(id) =>
                setSelectedRepositoryIds((prev) => toggled(prev, id))
              }
              emptyLabel={t("compliance.checker.repositories_empty")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("compliance.checker.standards_title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CheckboxList
              items={(regulationsPage?.items ?? []).map((regulation) => ({
                value: regulation.id,
                label: regulation.name,
                hint: (
                  <Badge variant="outline">
                    {t(`security.region.${regulation.region}`)}
                  </Badge>
                ),
              }))}
              selected={selectedRegulationIds}
              onToggle={(id) =>
                setSelectedRegulationIds((prev) => toggled(prev, id))
              }
              emptyLabel={t("compliance.checker.standards_empty")}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("compliance.checker.select_hint")}
        </p>
        <Button disabled={!canRun || isPending} onClick={handleRun}>
          <PlayIcon />
          {t("compliance.checker.run_button")}
        </Button>
      </div>
    </div>
  );
}
