import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type BriefingItemOut, extractErrorMessage } from "@/lib/api";
import { useBriefingQuery } from "../api";

const TIERS = [
  { key: "now" as const, tone: "border-red-500/30" },
  { key: "daily" as const, tone: "border-amber-500/30" },
  { key: "weekly" as const, tone: "border-border" },
];

export function BriefingPage() {
  const { t } = useTranslation();
  const { data, isPending, isError, error } = useBriefingQuery();

  const total =
    (data?.now.length ?? 0) +
    (data?.daily.length ?? 0) +
    (data?.weekly.length ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("briefing.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("briefing.subtitle")}
        </p>
      </div>

      {isPending ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <Skeleton key={tier.key} className="h-40 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Card className="p-6 text-sm text-destructive">
          {t("common.states.api_unreachable", {
            message: error ? extractErrorMessage(error) : "",
          })}
        </Card>
      ) : total === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          {t("briefing.empty")}
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <section key={tier.key} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(`briefing.tiers.${tier.key}`)}
              </h2>
              {(data?.[tier.key] ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("briefing.tier_empty")}
                </p>
              ) : (
                (data?.[tier.key] ?? []).map((item) => (
                  <BriefingCard key={item.id} item={item} tone={tier.tone} />
                ))
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function BriefingCard({ item, tone }: { item: BriefingItemOut; tone: string }) {
  const { t } = useTranslation();
  return (
    <Card className={`border-l-4 ${tone}`}>
      <CardContent className="space-y-2 px-4 py-4">
        <p className="text-sm font-medium">{item.headline}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-mono text-xs">
            {item.hobit_slug}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {t("briefing.scores", {
              importance: item.importance,
              confidence: item.confidence,
              urgency: item.urgency,
            })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
