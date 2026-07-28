import { getRouteApi } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AiReadinessPanel } from "@/features/repositories";
import { useReadinessOverviewQuery } from "../api";

const route = getRouteApi("/ai-readiness");

export function AiReadinessOverviewPage() {
  const { t } = useTranslation();
  const navigate = route.useNavigate();
  const { repo } = route.useSearch();
  const { data: items, isPending } = useReadinessOverviewQuery();

  // A stale deep-link (deleted repo) degrades to "nothing selected".
  const selected = items?.find((item) => item.repository_id === repo);

  const selectItems = [
    { value: null, label: t("readiness.pick_placeholder") },
    ...(items ?? []).map((item) => ({
      value: item.repository_id,
      label: item.slug,
    })),
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("readiness.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("readiness.description")}
        </p>
      </div>

      {isPending ? (
        <Skeleton className="h-10 w-full max-w-md" />
      ) : !items || items.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-medium">{t("readiness.empty_title")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("readiness.empty_body")}
          </p>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              items={selectItems}
              value={selected?.repository_id ?? null}
              onValueChange={(value) =>
                navigate({ search: { repo: value ?? undefined } })
              }
            >
              <SelectTrigger className="w-full max-w-md bg-background">
                <SelectValue placeholder={t("readiness.pick_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {selectItems.map((item) => (
                  <SelectItem key={item.label} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected ? (
              <div className="flex flex-wrap items-center gap-2">
                {selected.detected.map((key) => (
                  <Badge key={key} variant="secondary">
                    {key}
                  </Badge>
                ))}
                <span className="text-xs text-muted-foreground">
                  {t("readiness.artifacts", {
                    present: selected.present_count,
                    expected: selected.expected_count,
                  })}
                </span>
                {selected.proposed_count > 0 ? (
                  <Badge variant="accent">
                    {t("readiness.suggestions", {
                      count: selected.proposed_count,
                    })}
                  </Badge>
                ) : null}
              </div>
            ) : null}
          </div>

          {selected ? (
            <AiReadinessPanel repoId={selected.repository_id} />
          ) : (
            <Card className="p-10 text-center">
              <p className="font-medium">{t("readiness.pick_title")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("readiness.pick_body")}
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
