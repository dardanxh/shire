import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { TechnologyLogo } from "@/features/technologies";
import { cn } from "@/lib/utils";
import type { ScoredTechnology, ScoreResult, Weights } from "../score";

export function ResultsList({
  result,
  weights,
  groupSlugs,
  hasCategory,
}: {
  result: ScoreResult | null;
  weights: Weights;
  groupSlugs: Map<string, string>;
  hasCategory: boolean;
}) {
  const { t } = useTranslation();

  if (!hasCategory) {
    return (
      <div className="grid min-h-[30vh] place-items-center rounded-xl border bg-card">
        <p className="text-sm text-muted-foreground">
          {t("techchoice.results.empty_category")}
        </p>
      </div>
    );
  }

  const ranked = result?.ranked ?? [];

  return (
    <div className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{t("techchoice.results_title")}</h2>
        {result && result.excludedCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {t("techchoice.results.excluded", { count: result.excludedCount })}
          </span>
        )}
      </div>

      {ranked.length === 0 ? (
        <div className="grid min-h-[20vh] place-items-center rounded-xl border bg-card">
          <p className="max-w-xs text-center text-sm text-muted-foreground">
            {t("techchoice.results.empty_results")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {ranked.map((scored, index) => (
            <ResultCard
              key={scored.tech.id}
              scored={scored}
              weights={weights}
              groupSlug={groupSlugs.get(scored.tech.category_id)}
              isTop={index === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCard({
  scored,
  weights,
  groupSlug,
  isTop,
}: {
  scored: ScoredTechnology;
  weights: Weights;
  groupSlug: string | undefined;
  isTop: boolean;
}) {
  const { t } = useTranslation();
  const { tech, match } = scored;

  return (
    <Link
      to="/technologies/$id"
      params={{ id: tech.id }}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card p-3 transition-shadow hover:shadow-md",
        isTop && "border-l-4 border-l-primary/50",
      )}
    >
      <TechnologyLogo
        name={tech.name}
        homepageUrl={tech.homepage_url}
        groupSlug={groupSlug}
        className="size-8 shrink-0 rounded-md"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{tech.name}</span>
          {isTop && (
            <Badge variant="accent" className="shrink-0">
              {t("techchoice.results.top_pick")}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <AttrBadge
            label={t(`technologies.maturity.${tech.maturity}`)}
            on={weights.maturity > 0}
          />
          <AttrBadge
            label={t(`technologies.adoption.tier_${tech.cost_tier}`)}
            on={weights.cost > 0}
          />
          <AttrBadge
            label={t(`technologies.adoption.curve_${tech.learning_curve}`)}
            on={weights.learning_curve > 0}
          />
          <AttrBadge
            label={t(`technologies.adoption.ttw_${tech.time_to_win}`)}
            on={weights.time_to_win > 0}
          />
          {tech.oss && (
            <AttrBadge label={t("technologies.oss.yes")} on={weights.oss > 0} />
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="font-mono text-lg font-semibold tabular-nums">
          {Math.round(match)}
        </span>
        <span className="text-xs text-muted-foreground">
          {t("techchoice.results.match")}
        </span>
      </div>
    </Link>
  );
}

/** Attribute chip — highlighted when the user is weighting that axis. */
function AttrBadge({ label, on }: { label: string; on: boolean }) {
  return (
    <Badge variant={on ? "secondary" : "outline"} className="font-normal">
      {label}
    </Badge>
  );
}
