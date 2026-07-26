import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useReadinessOverviewQuery } from "../api";

export function AiReadinessOverviewPage() {
  const { t } = useTranslation();
  const { data: items, isPending } = useReadinessOverviewQuery();

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
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !items || items.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-medium">{t("readiness.empty_title")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("readiness.empty_body")}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card
              key={item.repository_id}
              className="flex-col gap-3 p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.slug}</span>
                  {item.proposed_count > 0 ? (
                    <Badge variant="accent">
                      {t("readiness.suggestions", {
                        count: item.proposed_count,
                      })}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {item.detected.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {t("readiness.none_detected")}
                    </span>
                  ) : (
                    item.detected.map((key) => (
                      <Badge key={key} variant="secondary">
                        {key}
                      </Badge>
                    ))
                  )}
                  <span className="text-xs text-muted-foreground">
                    {t("readiness.artifacts", {
                      present: item.present_count,
                      expected: item.expected_count,
                    })}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 self-start sm:self-center"
                render={
                  <Link
                    to="/repositories/$id"
                    params={{ id: item.repository_id }}
                    search={{ tab: "ai-readiness" }}
                  />
                }
              >
                {t("readiness.view")}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
